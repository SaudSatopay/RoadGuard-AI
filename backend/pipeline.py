"""
Full analysis of one road photo:
detect -> crack geometry -> severity -> cost and priority -> explanation -> forecast.

Returns Detection objects in the exact shape the frontends read (see API.md).
"""

from __future__ import annotations

import io
import time

import numpy as np
from PIL import Image, ImageOps

from cost_engine import rank_priorities
from inference import RoadDetector, get_detector
from predictive_engine import predict_damage_progression
from severity import DEFAULT_ROAD_CLASS, compute_overall_stats, compute_severity, explain_severity, summarize

DETECTION_KEYS = (
    "id", "code", "class_key", "label", "display_name", "class_name", "category", "risk", "repair",
    "confidence", "bbox", "bbox_norm", "area_ratio", "geometry",
    "severity", "severity_level", "severity_label", "severity_name", "severity_factors",
    "explanation", "cost", "forecast", "priority_rank", "urgency_score",
)


class BadImageError(ValueError):
    pass


def load_image(image_bytes: bytes) -> Image.Image:
    """Open uploaded bytes as an upright RGB image (EXIF orientation applied)."""
    if not image_bytes:
        raise BadImageError("The file is empty. Upload a JPEG or PNG photo of the road.")
    try:
        img = Image.open(io.BytesIO(image_bytes))
        img = ImageOps.exif_transpose(img)
        return img.convert("RGB")
    except Exception as e:
        raise BadImageError("That file is not a readable image. Upload a JPEG or PNG photo of the road.") from e


def gps_from_exif(image_bytes: bytes) -> tuple[float, float] | None:
    """(lat, lng) from the photo's EXIF GPS block, or None."""
    try:
        img = Image.open(io.BytesIO(image_bytes))
        gps = img.getexif().get_ifd(0x8825)  # GPSInfo
        if not gps or 2 not in gps or 4 not in gps:
            return None

        def to_deg(dms, ref) -> float:
            d, m, s = (float(x) for x in dms)
            deg = d + m / 60 + s / 3600
            return -deg if ref in ("S", "W") else deg

        lat = to_deg(gps[2], gps.get(1, "N"))
        lng = to_deg(gps[4], gps.get(3, "E"))
        if lat == 0 and lng == 0:
            return None
        return lat, lng
    except Exception:
        return None


def _base_detection(raw: dict, width: int, height: int) -> dict:
    e = raw["entry"]
    x1, y1, x2, y2 = raw["bbox"]
    x1, x2 = max(0.0, min(x1, width)), max(0.0, min(x2, width))
    y1, y2 = max(0.0, min(y1, height)), max(0.0, min(y2, height))
    area_ratio = (x2 - x1) * (y2 - y1) / float(width * height) * 100.0
    return {
        "code": e["code"],
        "class_key": e["key"],
        "label": e["label"],
        "display_name": e["label"],
        "class_name": e["code"],
        "category": e["category"],
        "risk": e["risk"],
        "repair": e["repair"],
        "confidence": round(raw["confidence"], 3),
        "bbox": [round(x1, 1), round(y1, 1), round(x2, 1), round(y2, 1)],
        "bbox_norm": [round(x1 / width, 4), round(y1 / height, 4), round(x2 / width, 4), round(y2 / height, 4)],
        "area_ratio": round(area_ratio, 2),
        "geometry": raw.get("geometry"),
    }


def finalize_detections(base: list[dict], width: int, height: int, road_class: str) -> list[dict]:
    """Score, price, explain and forecast base detections; returns contract-shaped dicts."""
    scored = compute_severity(base, width, height, road_class)
    ranked = rank_priorities(scored)
    out = []
    for i, d in enumerate(ranked):
        d["id"] = f"d{i + 1}"
        d["explanation"] = explain_severity(d, road_class)
        d["forecast"] = predict_damage_progression(d)
        out.append({k: d.get(k) for k in DETECTION_KEYS})
    return out


def analyze(image: Image.Image, confidence: float = 0.25, road_class: str = DEFAULT_ROAD_CLASS,
            tta: bool = False, detector: RoadDetector | None = None) -> dict:
    detector = detector or get_detector()
    rgb = np.asarray(image.convert("RGB"))
    height, width = rgb.shape[:2]
    t0 = time.perf_counter()
    raw = detector.detect(rgb, confidence, tta=tta)
    detector.geometry_for(raw, rgb)
    inference_ms = round((time.perf_counter() - t0) * 1000, 1)
    base = [_base_detection(r, width, height) for r in raw]
    detections = finalize_detections(base, width, height, road_class)
    return {
        "detections": detections,
        "image_width": width,
        "image_height": height,
        "inference_ms": inference_ms,
        "summary": summarize(detections),
        "stats": compute_overall_stats(detections),
    }
