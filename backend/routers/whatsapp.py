"""
WhatsApp bot (Twilio webhook). Two-step flow:
  1. The citizen sends a photo: the detector runs at once and the bot asks for the location.
  2. The citizen shares the location: the report is added to the ledger and the bot replies with a summary.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Form
from fastapi.responses import Response
from starlette.concurrency import run_in_threadpool

import config
from config import log
from gamification import award_points
from ledger import create_report
from pipeline import BadImageError, analyze, gps_from_exif, load_image
from store import new_id, save_upload

router = APIRouter(tags=["whatsapp"])

PENDING_TTL_MIN = 15
sessions: dict[str, dict] = {}

WELCOME_MSG = (
    "Welcome to *RoadGuard AI*. Report a damaged road in two steps:\n\n"
    "1. Send a photo of the pothole or crack.\n"
    "2. Share your location (attach > Location > Send your current location).\n\n"
    "RoadGuard checks the photo, rates the damage, estimates the repair cost and puts it on the public ledger "
    "for the responsible authority."
)

NO_DAMAGE_MSG = (
    "RoadGuard did not find a pothole or road crack in this photo.\n\n"
    "Tips: stand one or two steps from the damage, keep it in the middle of the frame and avoid strong shadows. "
    "Then send another photo."
)


def _twiml(text: str) -> Response:
    safe = text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    xml = f'<?xml version="1.0" encoding="UTF-8"?><Response><Message>{safe}</Message></Response>'
    return Response(content=xml, media_type="application/xml")


async def _download_media(url: str) -> Optional[bytes]:
    import httpx
    try:
        async with httpx.AsyncClient(follow_redirects=True, timeout=15.0) as client:
            r = await client.get(url, auth=(config.TWILIO_ACCOUNT_SID, config.TWILIO_AUTH_TOKEN))
            if r.status_code == 200:
                return r.content
    except Exception as e:
        log(f"WhatsApp media download failed: {e}")
    return None


def _finalize(phone: str, reporter: str, lat: float, lng: float, pending: dict, loc_source: str) -> Response:
    report = create_report(
        report_id=pending["report_id"], image_meta=pending["image_meta"], result=pending["result"],
        latitude=lat, longitude=lng, road_class="arterial", reporter=reporter,
        description=pending.get("description") or "Reported via WhatsApp",
        location_name="", source="whatsapp", trust_score=90, fraud_check=None,
        note="WhatsApp report received",
    )
    gami = {}
    try:
        gami = award_points(reporter, report, pending["result"]["detections"])
    except Exception as e:
        log(f"WhatsApp gamification error: {e}")
    sessions[phone]["pending_photo"] = None
    sessions[phone]["last_report_id"] = report["id"]

    top = pending["strong"][0]
    summary = pending["result"]["summary"]
    where = {"whatsapp_location": "from your shared location", "exif": "from the photo's GPS"}.get(loc_source, "")
    lines = [
        f"*Report {report['id']}* is on the RoadGuard ledger.",
        "",
        f"*{top['label']}*: {top['severity_level']} {top['severity_name']} (severity {top['severity']:.0f}/100, "
        f"{top['confidence'] * 100:.0f}% confidence)",
        f"{summary['total']} defect(s) in the photo",
        f"Indicative repair cost: ₹{summary['total_cost']:,} ({top['cost']['repair_method'].lower()})",
        "",
        f"Location {where}: {lat:.5f}, {lng:.5f} ({report['ward']['name']})",
        f"Routed to: {report['authority']['name']}",
    ]
    if report.get("duplicate_of"):
        lines.append(f"This spot was already reported; your report was merged into hazard {report['hazard_id']}.")
    if gami.get("xp_earned"):
        lines += ["", f"+{gami['xp_earned']} XP, +{gami['coins_earned']} coins, level {gami.get('level', 1)}"]
    lines += ["", "You can follow it on the public map. Thank you."]
    return _twiml("\n".join(lines))


@router.post("/whatsapp/webhook")
async def whatsapp_webhook(
    From: str = Form(...),
    Body: str = Form(default=""),
    NumMedia: int = Form(default=0),
    MediaUrl0: Optional[str] = Form(default=None),
    MediaContentType0: Optional[str] = Form(default=None),
    Latitude: Optional[float] = Form(default=None),
    Longitude: Optional[float] = Form(default=None),
    ProfileName: Optional[str] = Form(default="Citizen"),
):
    body = (Body or "").strip().lower()
    phone = From.replace("whatsapp:", "")
    reporter = ProfileName or f"WhatsApp {phone[-4:]}"
    session = sessions.setdefault(phone, {"pending_photo": None})

    if Latitude is not None and Longitude is not None and NumMedia == 0:
        pending = session.get("pending_photo")
        if not pending:
            return _twiml("Got your location, but there is no photo yet. Send a photo of the damage first, "
                          "then share the location again.")
        age_min = (datetime.now(timezone.utc) - pending["received_at"]).total_seconds() / 60
        if age_min > PENDING_TTL_MIN:
            session["pending_photo"] = None
            return _twiml("Your last photo is more than 15 minutes old. Please send a fresh photo.")
        return await run_in_threadpool(_finalize, phone, reporter, float(Latitude), float(Longitude),
                                       pending, "whatsapp_location")

    if NumMedia > 0:
        if not (MediaContentType0 or "").startswith("image/"):
            return _twiml("Only photos are supported. Please send a photo of the damage.")
        data = await _download_media(MediaUrl0) if MediaUrl0 else None
        if not data:
            return _twiml("The photo could not be downloaded. Please try sending it again.")
        try:
            image = load_image(data)
        except BadImageError:
            return _twiml("That photo could not be opened. Please send it again as a normal photo.")
        result = await run_in_threadpool(analyze, image, config.REPORT_CONFIDENCE, "arterial", False)
        strong = [d for d in result["detections"] if d["confidence"] >= config.REPORT_MIN_CONFIDENCE]
        if not strong:
            session["pending_photo"] = None
            return _twiml(NO_DAMAGE_MSG)
        report_id = new_id("RPT")
        image_meta = await run_in_threadpool(save_upload, report_id, image)
        pending = {
            "report_id": report_id,
            "image_meta": image_meta,
            "result": result,
            "strong": strong,
            "description": Body,
            "received_at": datetime.now(timezone.utc),
        }
        session["pending_photo"] = pending
        gps = gps_from_exif(data)
        if gps:
            return await run_in_threadpool(_finalize, phone, reporter, gps[0], gps[1], pending, "exif")
        top = strong[0]
        return _twiml(
            "*Photo received.*\n\n"
            f"RoadGuard sees a *{top['label'].lower()}*: {top['severity_level']} {top['severity_name']} "
            f"({top['confidence'] * 100:.0f}% confidence).\n\n"
            "Now share the location so the right ward office gets it: attach > Location > Send your current location."
        )

    if body in ("hi", "hello", "help", "start", "hey", "menu", ""):
        return _twiml(WELCOME_MSG)
    return _twiml("Send a *photo* of a pothole or road crack, or reply *help* for instructions.")
