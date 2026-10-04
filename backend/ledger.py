"""
Shapes of ledger records in API responses, plus report creation helpers.

List responses never carry base64 images; only the single-report detail
endpoint renders an `annotated_image` (on demand, from the stored photo).
"""

from __future__ import annotations

from PIL import Image

from config import log
from hazards import STATUS_ORDER, find_open_duplicate
from inference import annotate, encode_jpeg_b64
from store import image_path_for, image_url_for, iso, now_utc, store
from wards import authority_for, ward_for

VALID_STATUSES = STATUS_ORDER

STATUS_NOTES = {
    "submitted": "Citizen report received",
    "acknowledged": "Inspector acknowledged the report",
    "in_progress": "Repair crew assigned",
    "fixed": "Repair completed",
}


def top_detection(r: dict) -> dict | None:
    dets = r.get("detections") or []
    return max(dets, key=lambda d: d.get("severity", 0)) if dets else None


def _loc(r: dict) -> dict:
    return r.get("location") or {}


def map_item(r: dict, index: dict[str, str]) -> dict:
    top = top_detection(r) or {}
    summary = r.get("summary") or {}
    loc = _loc(r)
    return {
        "id": r["id"],
        "latitude": loc.get("latitude"),
        "longitude": loc.get("longitude"),
        "location_name": loc.get("name") or "",
        "damage_type": top.get("label", "Unknown"),
        "class_key": top.get("class_key"),
        "code": top.get("code"),
        "severity": summary.get("max_severity", 0),
        "severity_level": summary.get("worst_level"),
        "status": r.get("status", "submitted"),
        "timestamp": r["timestamp"],
        "reporter": r.get("reporter") or "Anonymous",
        "description": r.get("description") or "",
        "upvotes": int(r.get("upvotes", 0)),
        "defect_count": summary.get("total", len(r.get("detections") or [])),
        "image_url": r.get("image_url") or image_url_for(r.get("image")),
        "hazard_id": index.get(r["id"]),
        "duplicate_of": r.get("duplicate_of"),
        "ward": r.get("ward"),
        "road_class": r.get("road_class"),
    }


def admin_map_item(r: dict, index: dict[str, str]) -> dict:
    item = map_item(r, index)
    top = top_detection(r) or {}
    image = r.get("image") or {}
    item.update({
        "cost_estimated": int((r.get("summary") or {}).get("total_cost", 0)),
        "repair_method": (top.get("cost") or {}).get("repair_method", ""),
        "status_history": r.get("status_history") or [],
        "assigned_to": r.get("assigned_to"),
        "detections": r.get("detections") or [],
        "image": {"width": image.get("width"), "height": image.get("height")},
        "authority": r.get("authority"),
        "trust_score": r.get("trust_score"),
        "summary": r.get("summary"),
    })
    return item


def feed_item(r: dict) -> dict:
    top = top_detection(r) or {}
    return {
        "id": r["id"],
        "timestamp": r["timestamp"],
        "location_name": _loc(r).get("name") or "",
        "damage_type": top.get("label", "Unknown"),
        "severity_level": (r.get("summary") or {}).get("worst_level"),
        "status": r.get("status", "submitted"),
        "image_url": r.get("image_url") or image_url_for(r.get("image")),
        "ward": r.get("ward"),
    }


def annotated_b64(record: dict) -> str:
    """Render boxes on the stored photo; empty string when the photo is missing."""
    path = image_path_for(record.get("image"))
    if path is None:
        return ""
    try:
        with Image.open(path) as img:
            return encode_jpeg_b64(annotate(img, record.get("detections") or []))
    except Exception as e:
        log(f"Could not render annotated image for {record.get('id')}: {e}")
        return ""


def report_detail(r: dict, index: dict[str, str]) -> dict:
    out = dict(r)
    out["image_url"] = r.get("image_url") or image_url_for(r.get("image"))
    out["hazard_id"] = index.get(r["id"])
    out["annotated_image"] = annotated_b64(r)
    return out


def public_hazard(h: dict) -> dict:
    keys = ("hazard_id", "latitude", "longitude", "report_ids", "report_count", "worst_severity",
            "worst_level", "status", "ward", "damage_types", "total_upvotes", "first_reported",
            "last_reported", "image_url")
    return {k: h.get(k) for k in keys}


def history_entry(status: str, note: str = "", by: str | None = None) -> dict:
    entry = {"status": status, "time": iso(now_utc()), "note": note or STATUS_NOTES.get(status, "")}
    if by:
        entry["by"] = by
    return entry


def create_report(*, report_id: str, image_meta: dict, result: dict, latitude: float, longitude: float,
                  road_class: str, reporter: str, description: str, location_name: str, source: str,
                  trust_score: float, fraud_check: dict | None, note: str = "Citizen report received") -> dict:
    """Add a citizen report to the ledger, merging it into an open hazard when it is a duplicate.

    Returns the stored report (with `hazard_id` filled in).
    """
    ward = ward_for(latitude, longitude)
    authority = authority_for(ward, road_class, latitude, longitude)
    timestamp = iso(now_utc())
    report = {
        "id": report_id,
        "timestamp": timestamp,
        "reporter": reporter or "Anonymous",
        "description": description or "",
        "location": {"latitude": latitude, "longitude": longitude,
                     "name": location_name or f"{ward['name']} (approx.)"},
        "road_class": road_class,
        "ward": ward,
        "authority": authority,
        "image": image_meta,
        "image_url": image_url_for(image_meta),
        "detections": result["detections"],
        "summary": result["summary"],
        "stats": result["stats"],
        "inference_ms": result.get("inference_ms", 0),
        "inference_time_ms": result.get("inference_ms", 0),
        "status": "submitted",
        "status_history": [{"status": "submitted", "time": timestamp, "note": note}],
        "assigned_to": None,
        "fix_date": None,
        "upvotes": 1,
        "duplicate_of": None,
        "source": source,
        "trust_score": trust_score,
        "fraud_check": fraud_check,
    }
    with store.mutate():
        hazards, index = store.hazards()
        dup = find_open_duplicate(latitude, longitude, store.reports, hazards, index)
        if dup is not None:
            first_id = dup["report_ids"][0]
            report["duplicate_of"] = first_id
            first = store.find_report(first_id)
            if first is not None:
                first["upvotes"] = int(first.get("upvotes", 0)) + 1
        store.reports.append(report)
    _, index = store.hazards()
    report["hazard_id"] = index.get(report_id)
    return report


def set_status(report: dict, status: str, note: str = "", by: str | None = None) -> None:
    report["status"] = status
    report.setdefault("status_history", []).append(history_entry(status, note, by))
    if status == "fixed":
        report["fix_date"] = report["status_history"][-1]["time"]
