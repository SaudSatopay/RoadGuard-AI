"""Service metadata: root, health, model card, sectors (compat)."""

from __future__ import annotations

from fastapi import APIRouter

from config import DUPLICATE_RADIUS_M, SERVICE_NAME, VERSION
from inference import get_detector, load_model_card, model_ready
from store import iso, now_utc

router = APIRouter(tags=["meta"])


@router.get("/")
async def root():
    return {"status": "online", "service": SERVICE_NAME, "version": VERSION, "docs": "/docs"}


@router.get("/health")
async def health():
    return {"status": "ok", "service": SERVICE_NAME, "version": VERSION,
            "model_ready": model_ready(), "time": iso(now_utc())}


@router.get("/model")
async def model():
    det = get_detector()
    detector = det.model_info()
    detector.update(load_model_card(detector["file"]))
    seg = det.segmenter_info()
    return {
        "detector": detector,
        "segmenter": {k: seg[k] for k in ("name", "file", "use", "metrics")},
        "pipeline": [
            f"Detect: {detector['architecture']} finds 4 RDD2022 defect classes at {detector['imgsz']} px",
            "Measure: crack segmenter gives coverage, skeleton length and mean width for crack boxes",
            "Score: severity from defect type 35%, extent 25%, road class 20%, confidence 10%, density 10%",
            "Price: indicative INR repair range by defect and severity tier",
            "Forecast: rule-based deterioration, 2.5x faster in the monsoon (Jun-Sep)",
            f"Merge: DBSCAN on GPS (haversine, {int(DUPLICATE_RADIUS_M)} m) groups duplicate reports into hazards",
            "Route: nearest ward within 4 km decides the authority; expressways go to MSRDC",
        ],
    }


@router.get("/sectors")
async def sectors():
    """Compatibility: RoadGuard covers roads only."""
    return {"sectors": [{
        "id": "road",
        "label": "Roads",
        "desc": "Potholes and longitudinal, transverse and alligator cracks",
        "models": [get_detector().architecture],
    }]}
