"""Scanning endpoints: single photo, live frame, video, batch, and scan history."""

from __future__ import annotations

import base64
import binascii
import os
import tempfile
import time
from typing import Optional

import cv2
from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from PIL import Image
from starlette.concurrency import run_in_threadpool

from cost_engine import generate_repair_plan
from fraud_detection import check_image_authenticity
from inference import annotate, encode_jpeg_b64, get_detector
from ledger import annotated_b64
from pipeline import BadImageError, analyze, load_image
from routers.common import confidence_or_400, read_image_or_400, road_class_or_400
from severity import compute_overall_stats, summarize
from store import image_url_for, iso, new_id, now_utc, save_upload, store

router = APIRouter(tags=["detect"])


def _authenticity(image: Image.Image) -> dict:
    try:
        a = check_image_authenticity(image)
        a["is_likely_authentic"] = a["trust_score"] >= 60
        return a
    except Exception:
        return {"trust_score": 100, "verdict": "authentic", "is_likely_authentic": True,
                "flags": [], "recommendation": "Check skipped"}


def _alerts_for(record_id: str, detections: list[dict], location_name: Optional[str]) -> list[dict]:
    alerts = []
    for d in detections:
        if d["severity_level"] not in ("S3", "S4"):
            continue
        critical = d["severity_level"] == "S4"
        alerts.append({
            "time": iso(now_utc()),
            "type": "CRITICAL_DAMAGE" if critical else "DAMAGE_WARNING",
            "severity": "critical" if critical else "warning",
            "severity_level": d["severity_level"],
            "message": f"{d['label']} ({d['severity_level']} {d['severity_name']}, severity {d['severity']}) "
                       f"at {location_name or 'an unnamed location'}",
            "detection_id": record_id,
            "class_name": d["code"],
        })
    return alerts


def _model_brief() -> dict:
    info = get_detector().model_info()
    return {"name": info["name"], "runtime": info["runtime"]}


@router.post("/detect")
async def detect_damage(
    file: UploadFile = File(...),
    confidence: float = Form(default=0.25),
    road_class: str = Form(default="arterial"),
    latitude: Optional[float] = Form(default=None),
    longitude: Optional[float] = Form(default=None),
    location_name: Optional[str] = Form(default=None),
    tta: bool = Form(default=False),
):
    """Analyse one road photo and record it as a scan."""
    rc = road_class_or_400(road_class)
    conf = confidence_or_400(confidence)
    image, _ = await read_image_or_400(file)
    result = await run_in_threadpool(analyze, image, conf, rc, tta)
    dets = result["detections"]

    scan_id = new_id("SCN")
    img_meta = await run_in_threadpool(save_upload, scan_id, image)
    annotated = await run_in_threadpool(lambda: encode_jpeg_b64(annotate(image, dets)))
    authenticity = await run_in_threadpool(_authenticity, image)
    timestamp = iso(now_utc())
    location = {"latitude": latitude, "longitude": longitude, "name": location_name}

    store.add_scan({
        "id": scan_id,
        "timestamp": timestamp,
        "filename": file.filename,
        "source": "scan",
        "image": img_meta,
        "image_url": image_url_for(img_meta),
        "road_class": rc,
        "detections": dets,
        "summary": result["summary"],
        "stats": result["stats"],
        "inference_ms": result["inference_ms"],
        "inference_time_ms": result["inference_ms"],
        "location": location,
    })
    store.add_alerts(_alerts_for(scan_id, dets, location_name))

    return {
        "id": scan_id,
        "timestamp": timestamp,
        "image": {"width": result["image_width"], "height": result["image_height"], "url": image_url_for(img_meta)},
        "road_class": rc,
        "detections": dets,
        "summary": result["summary"],
        "stats": result["stats"],
        "annotated_image": annotated,
        "inference_ms": result["inference_ms"],
        "inference_time_ms": result["inference_ms"],
        "model": _model_brief(),
        "authenticity": authenticity,
        "predictions": [d["forecast"] for d in dets],
        "location": location,
    }


@router.post("/detect/frame")
async def detect_single_frame(
    frame_data: str = Form(...),
    confidence: float = Form(default=0.25),
    road_class: str = Form(default="arterial"),
):
    """Live camera: one base64 frame in, detections out (not stored)."""
    rc = road_class_or_400(road_class)
    conf = confidence_or_400(confidence)
    try:
        payload = frame_data.split(",", 1)[1] if "," in frame_data else frame_data
        image = load_image(base64.b64decode(payload))
    except (binascii.Error, BadImageError, ValueError):
        raise HTTPException(400, "The camera frame could not be read. Send a base64 JPEG or PNG frame.")
    result = await run_in_threadpool(analyze, image, conf, rc, False)
    dets = result["detections"]
    annotated = await run_in_threadpool(lambda: encode_jpeg_b64(annotate(image, dets), quality=75))
    return {
        "detections": dets,
        "summary": result["summary"],
        "image": {"width": result["image_width"], "height": result["image_height"]},
        "annotated_image": annotated,
        "detection_count": len(dets),
        "inference_ms": result["inference_ms"],
        "inference_time_ms": result["inference_ms"],
    }


def _process_video(path: str, conf: float, rc: str, frame_interval: int) -> dict:
    cap = cv2.VideoCapture(path)
    if not cap.isOpened():
        raise HTTPException(400, "The video could not be opened. Upload an MP4 or AVI file.")
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    frame_results, all_dets = [], []
    frame_num = 0
    start = time.perf_counter()
    try:
        while True:
            ok, frame = cap.read()
            if not ok:
                break
            if frame_num % frame_interval == 0:
                image = Image.fromarray(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))
                result = analyze(image, conf, rc)
                dets = result["detections"]
                if dets:
                    t = frame_num / fps
                    frame_results.append({
                        "frame_number": frame_num,
                        "timestamp_sec": round(t, 2),
                        "timestamp_display": f"{int(t // 60)}:{int(t % 60):02d}",
                        "detections": dets,
                        "detection_count": len(dets),
                        "summary": result["summary"],
                        "annotated_image": encode_jpeg_b64(annotate(image, dets), quality=75),
                    })
                    all_dets.extend(dets)
                if len(frame_results) >= 100:
                    break
            frame_num += 1
    finally:
        cap.release()
    return {
        "video_info": {
            "total_frames": total_frames,
            "fps": round(fps, 1),
            "duration_sec": round(total_frames / fps, 1) if fps else 0,
            "frames_analyzed": len(frame_results),
            "frame_interval": frame_interval,
        },
        "frame_results": frame_results,
        "aggregate_stats": compute_overall_stats(all_dets),
        "summary": summarize(all_dets),
        "total_detections": len(all_dets),
        "processing_time_ms": round((time.perf_counter() - start) * 1000, 1),
    }


@router.post("/detect/video")
async def detect_video(
    file: UploadFile = File(...),
    confidence: float = Form(default=0.25),
    frame_interval: int = Form(default=30),
    road_class: str = Form(default="arterial"),
):
    """Analyse one frame every `frame_interval` frames of a dashcam video."""
    rc = road_class_or_400(road_class)
    conf = confidence_or_400(confidence)
    if not (file.content_type or "").startswith("video/"):
        raise HTTPException(400, "That file is not a video. Upload an MP4 or AVI dashcam clip.")
    frame_interval = max(1, int(frame_interval))
    data = await file.read()
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=os.path.splitext(file.filename or "")[1] or ".mp4")
    try:
        tmp.write(data)
        tmp.close()
        out = await run_in_threadpool(_process_video, tmp.name, conf, rc, frame_interval)
    finally:
        os.unlink(tmp.name)
    out["video_info"]["filename"] = file.filename
    return out


@router.post("/detect/batch")
async def detect_batch(
    files: list[UploadFile] = File(...),
    confidence: float = Form(default=0.25),
    road_class: str = Form(default="arterial"),
):
    """Analyse several photos; each is recorded as a scan."""
    rc = road_class_or_400(road_class)
    conf = confidence_or_400(confidence)
    results = []
    for f in files:
        try:
            image, _ = await read_image_or_400(f)
        except HTTPException as e:
            results.append({"filename": f.filename, "error": e.detail})
            continue
        result = await run_in_threadpool(analyze, image, conf, rc, False)
        scan_id = new_id("SCN")
        img_meta = await run_in_threadpool(save_upload, scan_id, image)
        record = {
            "id": scan_id,
            "timestamp": iso(now_utc()),
            "filename": f.filename,
            "source": "scan",
            "image": img_meta,
            "image_url": image_url_for(img_meta),
            "road_class": rc,
            "detections": result["detections"],
            "summary": result["summary"],
            "stats": result["stats"],
            "inference_ms": result["inference_ms"],
            "inference_time_ms": result["inference_ms"],
            "location": {"latitude": None, "longitude": None, "name": None},
        }
        store.add_scan(record)
        results.append({
            "id": scan_id,
            "filename": f.filename,
            "image": {"width": result["image_width"], "height": result["image_height"],
                      "url": record["image_url"]},
            "detection_count": len(result["detections"]),
            "detections": result["detections"],
            "summary": result["summary"],
            "stats": result["stats"],
            "inference_ms": result["inference_ms"],
            "inference_time_ms": result["inference_ms"],
        })
    return {"results": results, "total_processed": len(results)}


# ------------------------------------------------------------------ history

def _brief(r: dict) -> dict:
    return {
        "id": r["id"],
        "timestamp": r["timestamp"],
        "filename": r.get("filename") or (r.get("image") or {}).get("file"),
        "source": r.get("source", "citizen_report" if r["id"].startswith("RPT-") else "scan"),
        "stats": r.get("stats") or compute_overall_stats(r.get("detections") or []),
        "summary": r.get("summary"),
        "inference_time_ms": r.get("inference_time_ms", r.get("inference_ms", 0)),
        "location": r.get("location"),
        "image_url": r.get("image_url") or image_url_for(r.get("image")),
        "detection_count": len(r.get("detections") or []),
    }


@router.get("/detections")
async def list_detections():
    store.refresh()
    records = sorted(store.all_records(), key=lambda r: r["timestamp"], reverse=True)
    return {"detections": [_brief(r) for r in records], "total": len(records)}


@router.get("/detections/{detection_id}")
async def get_detection(detection_id: str):
    store.refresh()
    r = store.find_scan(detection_id) or store.find_report(detection_id)
    if not r:
        raise HTTPException(404, "No scan or report with that id.")
    out = dict(r)
    out["image_url"] = r.get("image_url") or image_url_for(r.get("image"))
    out["annotated_image"] = await run_in_threadpool(annotated_b64, r)
    return out


@router.get("/stats")
async def aggregate_stats():
    store.refresh()
    records = store.all_records()
    dets = [d for r in records for d in (r.get("detections") or [])]
    stats = compute_overall_stats(dets)
    stats["summary"] = summarize(dets)
    stats["total_scans"] = len(records)
    stats["total_images"] = len(records)
    stats["locations_with_damage"] = sum(1 for r in records if r.get("detections"))
    return stats


@router.get("/alerts")
async def get_alerts():
    store.refresh()
    return {"alerts": list(reversed(store.alerts)), "total": len(store.alerts)}


@router.get("/repair-plan")
async def repair_plan():
    store.refresh()
    dets = []
    for r in store.all_records():
        if r.get("status") == "fixed":
            continue
        loc = r.get("location") or {}
        for d in r.get("detections") or []:
            dets.append({**d, "source_scan": r["id"], "scan_time": r["timestamp"],
                         "location_name": loc.get("name") or r.get("filename") or r["id"]})
    if not dets:
        return {"message": "No open defects yet. Scan a photo or wait for citizen reports.",
                "summary": None, "top_priorities": []}
    return generate_repair_plan(dets, location="All open records")


@router.get("/repair-plan/{detection_id}")
async def repair_plan_for(detection_id: str):
    store.refresh()
    r = store.find_scan(detection_id) or store.find_report(detection_id)
    if not r:
        raise HTTPException(404, "No scan or report with that id.")
    loc = r.get("location") or {}
    return generate_repair_plan(r.get("detections") or [], location=loc.get("name") or r.get("filename") or r["id"])


@router.post("/analytics/before-after")
async def before_after(
    before_file: UploadFile = File(...),
    after_file: UploadFile = File(...),
    road_class: str = Form(default="arterial"),
):
    """Compare a photo before and after a repair."""
    rc = road_class_or_400(road_class)
    before_img, _ = await read_image_or_400(before_file)
    after_img, _ = await read_image_or_400(after_file)
    before = await run_in_threadpool(analyze, before_img, 0.2, rc, False)
    after = await run_in_threadpool(analyze, after_img, 0.2, rc, False)
    sb, sa = before["summary"], after["summary"]
    sev_b, sev_a = sb["avg_severity"], sa["avg_severity"]
    improvement = round((sev_b - sev_a) / max(sev_b, 1) * 100, 1)

    def side(img, res):
        return {
            "detections": len(res["detections"]),
            "avg_severity": res["summary"]["avg_severity"],
            "road_condition_index": res["summary"]["road_condition_index"],
            "integrity": res["stats"]["structural_integrity"],
            "summary": res["summary"],
            "annotated_image": encode_jpeg_b64(annotate(img, res["detections"])),
        }

    return {
        "before": side(before_img, before),
        "after": side(after_img, after),
        "improvement_pct": improvement,
        "severity_reduced": round(sev_b - sev_a, 1),
        "verdict": "Improved" if improvement > 10 else "Minimal change" if improvement > -10 else "Worsened",
    }

