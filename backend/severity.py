"""
Severity model for road defects.

    score = 100 x sum(weight x value), every value in 0..1

    factor       weight  value
    type         0.30    D40 1.0, D20 0.85, D10 0.6, D00 0.5
    extent       0.30    potholes/alligator: min(1, sqrt(area_ratio / 12))
                         linear cracks: min(1, length_px / (0.6 x image diagonal))
                         (area formula when no crack geometry is available)
    road class   0.15    expressway 1.0, arterial 0.8, collector 0.6, local 0.4
    confidence   0.15    detector confidence
    density      0.10    min(1, defects in the photo / 6)

Extent carries as much weight as defect type, so a small pothole is not automatically
critical; the earlier 0.35/0.25/0.20/0.10 split put most seeded potholes at S4.

Levels: S1 < 40 Minor, S2 40-55 Moderate, S3 55-70 Severe, S4 >= 70 Critical.
"""

from __future__ import annotations

import math

from classes import BY_CODE, code_of
from config import SLA_FIX_DAYS

TYPE_VALUE = {"D40": 1.0, "D20": 0.85, "D10": 0.6, "D00": 0.5}
TYPE_DETAIL = {
    "D40": "highest-risk defect class",
    "D20": "structural fatigue cracking",
    "D10": "crack across the lane",
    "D00": "crack along the lane",
}

ROAD_CLASSES = {
    "expressway": {"value": 1.0, "label": "Expressway", "detail": "high-speed, access-controlled road"},
    "arterial": {"value": 0.8, "label": "Arterial road", "detail": "main road carrying heavy daily traffic"},
    "collector": {"value": 0.6, "label": "Collector road", "detail": "links neighbourhoods to main roads"},
    "local": {"value": 0.4, "label": "Local street", "detail": "neighbourhood street with lighter traffic"},
}
DEFAULT_ROAD_CLASS = "arterial"

WEIGHTS = {"type": 0.30, "extent": 0.30, "road_class": 0.15, "confidence": 0.15, "density": 0.10}

LEVELS = {
    "S1": {"name": "Minor", "label": "minor"},
    "S2": {"name": "Moderate", "label": "warning"},
    "S3": {"name": "Severe", "label": "warning"},
    "S4": {"name": "Critical", "label": "critical"},
}
LEVEL_ORDER = ["S1", "S2", "S3", "S4"]


def normalize_road_class(value) -> str:
    """Validate a road class; raises ValueError with a readable message."""
    if value is None or str(value).strip() == "":
        return DEFAULT_ROAD_CLASS
    rc = str(value).strip().lower()
    if rc not in ROAD_CLASSES:
        raise ValueError(
            f"road_class must be one of: {', '.join(ROAD_CLASSES)} (got '{value}')"
        )
    return rc


def level_for(score: float) -> str:
    if score >= 70:
        return "S4"
    if score >= 55:
        return "S3"
    if score >= 40:
        return "S2"
    return "S1"


def level_rank(level: str) -> int:
    return LEVEL_ORDER.index(level) if level in LEVEL_ORDER else -1


def _extent_value(code: str, area_ratio_pct: float, geometry: dict | None, diag: float) -> tuple[float, str]:
    area_value = min(1.0, math.sqrt(max(area_ratio_pct, 0.0) / 12.0))
    if code in ("D00", "D10") and geometry and geometry.get("length_px"):
        length_px = float(geometry["length_px"])
        value = min(1.0, length_px / (0.6 * diag)) if diag > 0 else 0.0
        metres = geometry.get("length_m")
        detail = f"Crack about {int(length_px)} px long"
        if metres:
            detail += f" (≈ {metres} m)"
        return value, detail
    return area_value, f"Covers {area_ratio_pct:.1f}% of the photo"


def score_detection(det: dict, image_width: int, image_height: int, road_class: str, n_detections: int) -> dict:
    """Return the severity fields for one detection (does not mutate `det`)."""
    code = code_of(det.get("code") or det.get("class_name"))
    entry = BY_CODE[code]
    diag = math.hypot(image_width, image_height)
    area_ratio = float(det.get("area_ratio", 0.0))
    rc = ROAD_CLASSES[road_class]
    confidence = float(det.get("confidence", 0.0))

    extent_value, extent_detail = _extent_value(code, area_ratio, det.get("geometry"), diag)
    density_value = min(1.0, n_detections / 6.0)

    raw = [
        ("type", "Defect type", TYPE_VALUE[code], f"{entry['label']}: {TYPE_DETAIL[code]}"),
        ("extent", "Damaged extent", extent_value, extent_detail),
        ("road_class", "Road class", rc["value"], f"{rc['label']}: {rc['detail']}"),
        ("confidence", "Model confidence", confidence, f"The detector is {confidence * 100:.0f}% confident"),
        ("density", "Defect density", density_value,
         f"{n_detections} defect{'s' if n_detections != 1 else ''} found in this photo"),
    ]
    factors = []
    total = 0.0
    for key, label, value, detail in raw:
        value = max(0.0, min(1.0, float(value)))
        points = 100.0 * WEIGHTS[key] * value
        total += points
        factors.append({
            "key": key,
            "label": label,
            "weight": WEIGHTS[key],
            "value": round(value, 3),
            "points": round(points, 1),
            "detail": detail,
        })
    score = round(min(100.0, total), 1)
    level = level_for(score)
    return {
        "severity": score,
        "severity_level": level,
        "severity_label": LEVELS[level]["label"],
        "severity_name": LEVELS[level]["name"],
        "severity_factors": factors,
    }


def compute_severity(detections: list, image_width: int, image_height: int,
                     road_class: str = DEFAULT_ROAD_CLASS) -> list:
    """Add severity fields to every detection; sorted by severity, worst first.

    Each detection needs `bbox`, `confidence` and a class (`code` or
    `class_name`). `area_ratio` is filled in if missing.
    """
    road_class = normalize_road_class(road_class)
    image_area = float(image_width * image_height) or 1.0
    n = len(detections)
    out = []
    for det in detections:
        d = dict(det)
        if "area_ratio" not in d:
            x1, y1, x2, y2 = d["bbox"]
            d["area_ratio"] = round(max(0.0, (x2 - x1) * (y2 - y1)) / image_area * 100.0, 2)
        d.update(score_detection(d, image_width, image_height, road_class, n))
        out.append(d)
    out.sort(key=lambda x: x["severity"], reverse=True)
    return out


def _impact(value: float) -> str:
    if value >= 0.75:
        return "high"
    if value >= 0.45:
        return "medium"
    return "low"


RECOMMENDATIONS = {
    "S4": "Make the spot safe now and repair within 7 days (RoadGuard target).",
    "S3": "Schedule a repair within 15 days (RoadGuard target); recheck after heavy rain.",
    "S2": "Plan a repair within 30 days (RoadGuard target) before it spreads.",
    "S1": "Seal or monitor at the next routine inspection, within 60 days (RoadGuard target).",
}


def explain_severity(det: dict, road_class: str | None = None) -> dict:
    """Plain-language explanation of a scored detection."""
    level = det.get("severity_level") or level_for(det.get("severity", 0))
    factors = det.get("severity_factors") or []
    by_key = {f["key"]: f for f in factors}
    label = det.get("label") or det.get("display_name") or "Defect"
    rc_key = road_class or det.get("road_class")
    rc_label = ROAD_CLASSES.get(rc_key, {}).get("label", "").lower() if rc_key else ""
    if not rc_label and "road_class" in by_key:
        rc_label = by_key["road_class"]["detail"].split(":")[0].lower()
    extent = by_key.get("extent", {}).get("detail", "")
    conf = det.get("confidence", 0.0)
    road = rc_label or "road"
    article = "an" if road[0] in "aeiou" else "a"
    extent_part = f", {extent[0].lower()}{extent[1:]}" if extent else ""
    sentence = (
        f"Severity {det.get('severity', 0)} ({level} {LEVELS[level]['name']}): "
        f"{label.lower()} on {article} {road}{extent_part}, "
        f"detected with {conf * 100:.0f}% confidence."
    )
    top = sorted(factors, key=lambda f: f["points"], reverse=True)[:3]
    return {
        "severity_score": det.get("severity", 0),
        "severity_label": LEVELS[level]["label"],
        "explanation": sentence,
        "factors": [
            {"factor": f["label"], "impact": _impact(f["value"]), "detail": f["detail"]}
            for f in top
        ],
        "recommendation": RECOMMENDATIONS[level],
    }


def compute_overall_stats(detections: list) -> dict:
    """Compatibility aggregate used by older screens."""
    if not detections:
        return {
            "total_defects": 0,
            "critical_count": 0,
            "warning_count": 0,
            "minor_count": 0,
            "avg_severity": 0,
            "max_severity": 0,
            "structural_integrity": 100,
            "damage_types": {},
        }
    severities = [float(d.get("severity", 0)) for d in detections]
    labels = [d.get("severity_label", "minor") for d in detections]
    types: dict[str, int] = {}
    for d in detections:
        name = d.get("label") or d.get("display_name") or d.get("class_name", "Defect")
        types[name] = types.get(name, 0) + 1
    avg_sev = sum(severities) / len(severities)
    max_sev = max(severities)
    integrity = max(0.0, 100 - (avg_sev * 0.6 + max_sev * 0.4))
    return {
        "total_defects": len(detections),
        "critical_count": labels.count("critical"),
        "warning_count": labels.count("warning"),
        "minor_count": labels.count("minor"),
        "avg_severity": round(avg_sev, 1),
        "max_severity": round(max_sev, 1),
        "structural_integrity": round(integrity, 1),
        "damage_types": types,
    }


def summarize(detections: list) -> dict:
    """Summary of one photo's detections for the result screen."""
    by_level = {lvl: 0 for lvl in LEVEL_ORDER}
    for d in detections:
        lvl = d.get("severity_level") or level_for(d.get("severity", 0))
        by_level[lvl] = by_level.get(lvl, 0) + 1
    if not detections:
        return {
            "total": 0,
            "by_level": by_level,
            "worst_level": None,
            "max_severity": 0,
            "avg_severity": 0,
            "road_condition_index": 100,
            "total_cost": 0,
            "total_cost_if_ignored": 0,
            "recommended_action": "No road defects found in this photo.",
        }
    severities = [float(d.get("severity", 0)) for d in detections]
    max_sev = max(severities)
    avg_sev = sum(severities) / len(severities)
    worst = max((d.get("severity_level", "S1") for d in detections), key=level_rank)
    total_cost = sum(int((d.get("cost") or {}).get("cost_estimated", 0)) for d in detections)
    total_ignored = sum(int((d.get("cost") or {}).get("cost_if_ignored", 0)) for d in detections)
    rci = max(0.0, 100 - (0.6 * max_sev + 0.4 * avg_sev))
    return {
        "total": len(detections),
        "by_level": by_level,
        "worst_level": worst,
        "max_severity": round(max_sev, 1),
        "avg_severity": round(avg_sev, 1),
        "road_condition_index": round(rci, 1),
        "total_cost": total_cost,
        "total_cost_if_ignored": total_ignored,
        "recommended_action": RECOMMENDATIONS[worst],
    }


def fix_target_days(level: str) -> int:
    return SLA_FIX_DAYS.get(level, SLA_FIX_DAYS["S1"])

