"""Citizen reports, the public ledger, hazards and complaint letters."""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, File, Form, HTTPException, Query, Request, UploadFile
from starlette.concurrency import run_in_threadpool

import config
from complaints import generate_complaint
from config import log
from fraud_detection import run_full_fraud_check
from gamification import award_points
from inference import annotate, encode_jpeg_b64
from ledger import create_report, feed_item, map_item, public_hazard, report_detail
from pipeline import analyze, gps_from_exif
from routers.common import coords_or_400, read_image_or_400, road_class_or_400
from store import new_id, save_upload, store

router = APIRouter(tags=["reports"])


@router.post("/public/report")
async def submit_citizen_report(
    file: UploadFile = File(...),
    latitude: Optional[float] = Form(default=None),
    longitude: Optional[float] = Form(default=None),
    road_class: str = Form(default="arterial"),
    description: Optional[str] = Form(default=""),
    reporter_name: Optional[str] = Form(default="Anonymous"),
    location_name: Optional[str] = Form(default=""),
):
    """A citizen reports a road defect with a photo and its location."""
    rc = road_class_or_400(road_class)
    image, raw_bytes = await read_image_or_400(file)
    if latitude is None or longitude is None:
        gps = gps_from_exif(raw_bytes)
        if gps is None:
            raise HTTPException(400, "Turn on location or pick the spot on the map.")
        latitude, longitude = gps
    coords_or_400(latitude, longitude)

    result = await run_in_threadpool(analyze, image, config.REPORT_CONFIDENCE, rc, False)
    dets = result["detections"]
    strong = [d for d in dets if d["confidence"] >= config.REPORT_MIN_CONFIDENCE]
    if not strong:
        annotated = await run_in_threadpool(lambda: encode_jpeg_b64(annotate(image, dets)))
        return {
            "id": None,
            "status": "no_damage",
            "message": "No pothole or road crack was found in this photo. Take a closer photo of the damage itself.",
            "detections_count": len(dets),
            "max_confidence": max((d["confidence"] for d in dets), default=0),
            "annotated_image": annotated,
            "hint": "Stand one or two steps from the damage, keep it in the middle of the frame, and avoid strong shadows.",
        }

    reporter = (reporter_name or "Anonymous").strip() or "Anonymous"
    if not store.settings.get("fraud_detection_enabled", True):
        fraud = {"combined_trust_score": 100, "verdict": "trusted", "action": "auto_approve",
                 "flags": [], "scores": {}, "checks": {}, "skipped": True}
    else:
        try:
            fraud = await run_in_threadpool(
                run_full_fraud_check, image, float(latitude), float(longitude), dets, store.reports, reporter)
        except Exception as e:
            log(f"Trust check failed: {e}")
            fraud = {"combined_trust_score": 75, "verdict": "trusted", "action": "auto_approve",
                     "flags": [], "checks": {}}

    if fraud["action"] == "block_submission":
        return {
            "id": None,
            "status": "rejected",
            "message": "This report was not accepted: the photo or location did not pass our checks for a genuine road report.",
            "trust_score": fraud["combined_trust_score"],
            "flags": fraud["flags"],
            "fraud_check": fraud,
        }

    report_id = new_id("RPT")
    img_meta = await run_in_threadpool(save_upload, report_id, image)
    report = create_report(
        report_id=report_id, image_meta=img_meta, result=result, latitude=float(latitude),
        longitude=float(longitude), road_class=rc, reporter=reporter, description=description or "",
        location_name=location_name or "", source="citizen_app",
        trust_score=fraud["combined_trust_score"], fraud_check=fraud,
    )

    gamification = {}
    try:
        gamification = award_points(reporter, report, dets)
    except Exception as e:
        log(f"Gamification error: {e}")

    stats = result["stats"]
    approved = fraud["action"] == "auto_approve"
    return {
        "id": report_id,
        "status": "submitted" if approved else "under_review",
        "detections_count": len(dets),
        "severity_summary": {
            "critical": stats["critical_count"],
            "warning": stats["warning_count"],
            "minor": stats["minor_count"],
        },
        "trust_score": fraud["combined_trust_score"],
        "trust_verdict": fraud["verdict"],
        "flags": fraud["flags"],
        "gamification": gamification,
        "message": (
            ("Thanks. Your report is on the public ledger"
             + (" and has been merged with an earlier report of the same spot." if report["duplicate_of"] else ".")
             + f" It is routed to {report['authority']['name']}.")
            if approved else
            "Thanks. Your report needs a quick manual check before it appears on the public ledger."
        ),
        "fraud_check": fraud,
        "image_url": report["image_url"],
        "hazard_id": report["hazard_id"],
        "duplicate_of": report["duplicate_of"],
        "ward": report["ward"],
        "authority": report["authority"],
        "detections": dets,
        "summary": result["summary"],
    }


@router.get("/public/reports/map")
async def public_map():
    store.refresh()
    _, index = store.hazards()
    items = [map_item(r, index) for r in store.reports
             if (r.get("location") or {}).get("latitude") is not None]
    return {"reports": items, "total": len(items)}


@router.get("/public/reports/map/detail")
async def public_map_detail():
    """Legacy alias: map items with cost and history (no embedded images)."""
    store.refresh()
    _, index = store.hazards()
    items = []
    for r in store.reports:
        if (r.get("location") or {}).get("latitude") is None:
            continue
        item = map_item(r, index)
        dets = r.get("detections") or []
        top = max(dets, key=lambda d: d.get("severity", 0)) if dets else {}
        item.update({
            "cost_estimated": int((r.get("summary") or {}).get("total_cost", 0)),
            "repair_method": (top.get("cost") or {}).get("repair_method", ""),
            "status_history": r.get("status_history") or [],
        })
        items.append(item)
    return {"reports": items, "total": len(items)}


@router.get("/public/feed")
async def public_feed(limit: int = Query(default=8, ge=1, le=50)):
    store.refresh()
    newest = sorted(store.reports, key=lambda r: r["timestamp"], reverse=True)[:limit]
    return {"items": [feed_item(r) for r in newest]}


@router.get("/public/stats")
async def public_stats():
    store.refresh()
    reports = store.reports
    total = len(reports)
    counts = {s: sum(1 for r in reports if r.get("status") == s)
              for s in ("submitted", "acknowledged", "in_progress", "fixed")}
    addressed = counts["fixed"] + counts["in_progress"] + counts["acknowledged"]
    total_cost = sum(int((r.get("summary") or {}).get("total_cost", 0)) for r in reports)
    hazards, _ = store.hazards()
    open_hazards = [h for h in hazards if h.get("status") != "fixed"]
    # Same definition as /analytics/summary: the estimate for every hazard still open, counted once per hazard.
    backlog = sum(int(h.get("total_cost", 0)) for h in open_hazards)
    return {
        "total_reports": total,
        "total_hazards": len(hazards),
        "open_hazards": len(open_hazards),
        "backlog_cost": backlog,
        "fixed": counts["fixed"],
        "in_progress": counts["in_progress"],
        "acknowledged": counts["acknowledged"],
        "pending": counts["submitted"],
        "performance_score": round(addressed / total * 100, 1) if total else 0,
        "total_estimated_cost": total_cost,
        "total_estimated_cost_formatted": f"₹{total_cost:,}",
    }


@router.get("/public/reports/{report_id}")
async def public_report(report_id: str):
    store.refresh()
    r = store.find_report(report_id)
    if not r:
        raise HTTPException(404, "No report with that id.")
    _, index = store.hazards()
    return await run_in_threadpool(report_detail, r, index)


@router.post("/public/reports/{report_id}/upvote")
async def upvote(report_id: str):
    with store.mutate():
        r = store.find_report(report_id)
        if not r:
            raise HTTPException(404, "No report with that id.")
        r["upvotes"] = int(r.get("upvotes", 0)) + 1
        votes = r["upvotes"]
    return {"id": report_id, "upvotes": votes}


@router.get("/hazards")
async def list_hazards():
    store.refresh()
    hazards, _ = store.hazards()
    return {
        "hazards": [public_hazard(h) for h in hazards],
        "total": len(hazards),
        "duplicates_merged": sum(h["report_count"] for h in hazards) - len(hazards),
        "eps_m": int(config.DUPLICATE_RADIUS_M),
    }


@router.get("/reports/{report_id}/complaint")
async def complaint(request: Request, report_id: str, mode: str = Query(default="auto")):
    if mode not in ("auto", "template"):
        raise HTTPException(400, "mode must be 'auto' or 'template'.")
    store.refresh()
    r = store.find_report(report_id)
    if not r:
        raise HTTPException(404, "No report with that id.")
    hazards, index = store.hazards()
    hazard = next((h for h in hazards if h["hazard_id"] == index.get(report_id)), None)
    base_url = str(request.base_url)
    return await run_in_threadpool(generate_complaint, r, hazard, base_url, mode)
