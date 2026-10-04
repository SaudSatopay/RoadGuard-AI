"""
Repair cost estimates (INR), priority ranking and repair plans.

One table keyed by defect code (D00/D10/D20/D40) x tier. Tiers come from the
severity level: S1 -> minor, S2/S3 -> warning, S4 -> critical. The ranges are
indicative figures from typical Indian municipal road-repair rates, not quotes.
"""

from __future__ import annotations

from datetime import datetime, timezone

from classes import BY_CODE, code_of
from severity import explain_severity, level_for  # noqa: F401  (explain_severity re-exported for compat)

COST_BASIS = "Indicative estimate from typical Indian municipal repair rates"

REPAIR_COSTS = {
    "D00": {  # Longitudinal crack
        "minor": {"min": 500, "max": 2000, "method": "Crack sealing", "time": "1-2 hours", "crew": 2},
        "warning": {"min": 2000, "max": 8000, "method": "Routing and sealing", "time": "2-4 hours", "crew": 3},
        "critical": {"min": 8000, "max": 25000, "method": "Full-depth patching", "time": "4-8 hours", "crew": 5},
    },
    "D10": {  # Transverse crack
        "minor": {"min": 800, "max": 3000, "method": "Crack filling", "time": "1-2 hours", "crew": 2},
        "warning": {"min": 3000, "max": 12000, "method": "Partial-depth repair", "time": "3-5 hours", "crew": 4},
        "critical": {"min": 12000, "max": 35000, "method": "Full-depth reclamation", "time": "6-10 hours", "crew": 6},
    },
    "D20": {  # Alligator crack
        "minor": {"min": 3000, "max": 10000, "method": "Surface seal coat", "time": "2-4 hours", "crew": 3},
        "warning": {"min": 10000, "max": 40000, "method": "Mill and overlay", "time": "1-2 days", "crew": 6},
        "critical": {"min": 40000, "max": 150000, "method": "Full-depth reclamation and overlay", "time": "2-5 days", "crew": 8},
    },
    "D40": {  # Pothole
        "minor": {"min": 1000, "max": 3000, "method": "Throw-and-roll patch", "time": "30 minutes", "crew": 2},
        "warning": {"min": 3000, "max": 10000, "method": "Semi-permanent patch", "time": "1-2 hours", "crew": 3},
        "critical": {"min": 10000, "max": 30000, "method": "Full-depth repair", "time": "3-6 hours", "crew": 5},
    },
}

# How much more the same repair costs if it is left for about six months.
IGNORE_MULTIPLIER = {"minor": 3.0, "warning": 4.0, "critical": 6.0}

TIER_FOR_LEVEL = {"S1": "minor", "S2": "warning", "S3": "warning", "S4": "critical"}

URGENCY_BASE = {"S4": 100, "S3": 75, "S2": 50, "S1": 20}


def tier_of(det: dict) -> str:
    level = det.get("severity_level") or level_for(float(det.get("severity", 0)))
    return TIER_FOR_LEVEL.get(level, "minor")


def estimate_cost(detection: dict) -> dict:
    """Repair cost for one scored detection."""
    code = code_of(detection.get("code") or detection.get("class_name"))
    tier = tier_of(detection)
    row = REPAIR_COSTS[code][tier]
    cost_min, cost_max = row["min"], row["max"]
    cost_avg = (cost_min + cost_max) // 2
    area_ratio = float(detection.get("area_ratio", 5.0))
    area_multiplier = 1 + (min(area_ratio, 100.0) / 100.0) * 2  # 0-100% of frame -> 1x-3x
    cost_estimated = int(round(cost_avg * area_multiplier, -2)) or cost_avg
    cost_if_ignored = int(cost_estimated * IGNORE_MULTIPLIER[tier])
    return {
        "cost_min": cost_min,
        "cost_max": cost_max,
        "cost_estimated": cost_estimated,
        "cost_if_ignored": cost_if_ignored,
        "savings_if_fixed_now": cost_if_ignored - cost_estimated,
        "repair_method": row["method"],
        "repair_time": row["time"],
        "crew_size": row["crew"],
        "currency": "INR",
        "basis": COST_BASIS,
    }


def urgency_score(det: dict) -> float:
    level = det.get("severity_level") or level_for(float(det.get("severity", 0)))
    return round(
        URGENCY_BASE.get(level, 20)
        + float(det.get("confidence", 0)) * 20
        + min(float(det.get("area_ratio", 0)), 50.0),
        1,
    )


def rank_priorities(detections: list) -> list:
    """Attach cost and urgency, sort by urgency (highest first) and number them."""
    ranked = []
    for det in detections:
        d = dict(det)
        d["cost"] = estimate_cost(d)
        d["urgency_score"] = urgency_score(d)
        ranked.append(d)
    ranked.sort(key=lambda x: (x["urgency_score"], x.get("severity", 0)), reverse=True)
    for i, d in enumerate(ranked):
        d["priority_rank"] = i + 1
    return ranked


def _inr(value: int) -> str:
    return f"₹{value:,}"


def generate_repair_plan(detections: list, location: str = "Unknown") -> dict:
    """'What should I fix today?' plan from a list of scored detections."""
    ranked = rank_priorities(detections)
    total_cost = sum(d["cost"]["cost_estimated"] for d in ranked)
    total_if_ignored = sum(d["cost"]["cost_if_ignored"] for d in ranked)
    critical = [d for d in ranked if d.get("severity_label") == "critical"]
    warnings = [d for d in ranked if d.get("severity_label") == "warning"]
    minor = [d for d in ranked if d.get("severity_label") == "minor"]

    actions = []
    for d in ranked[:5]:
        code = code_of(d.get("code") or d.get("class_name"))
        actions.append({
            "priority": d["priority_rank"],
            "damage_type": d.get("label") or BY_CODE[code]["label"],
            "code": code,
            "severity": d.get("severity_label"),
            "severity_level": d.get("severity_level"),
            "urgency_score": d["urgency_score"],
            "location": d.get("location_name") or location,
            "repair_method": d["cost"]["repair_method"],
            "estimated_cost": _inr(d["cost"]["cost_estimated"]),
            "repair_time": d["cost"]["repair_time"],
            "crew_needed": d["cost"]["crew_size"],
            "cost_if_delayed": _inr(d["cost"]["cost_if_ignored"]),
            "savings": _inr(d["cost"]["savings_if_fixed_now"]),
        })

    if critical:
        action = "Repair the critical defects first: make them safe today and fix within 7 days."
    elif warnings:
        action = "Schedule repairs within 15-30 days, starting with the highest severity."
    else:
        action = "Minor defects only: seal or monitor at the next routine inspection."

    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "location": location,
        "summary": {
            "total_defects": len(ranked),
            "critical_count": len(critical),
            "warning_count": len(warnings),
            "minor_count": len(minor),
            "total_repair_cost": _inr(total_cost),
            "cost_if_ignored_6months": _inr(total_if_ignored),
            "potential_savings": _inr(total_if_ignored - total_cost),
            "recommended_action": action,
            "basis": COST_BASIS,
        },
        "top_priorities": actions,
        "all_detections": ranked,
    }
