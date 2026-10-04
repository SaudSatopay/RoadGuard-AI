"""
Deterioration forecast for road defects.

A rule-based model: each defect class worsens at a typical rate, and during the
monsoon (June to September) damage progresses 2.5x faster. These are planning
heuristics, not a model trained on historical progression data.
"""

from __future__ import annotations

from datetime import datetime, timezone

from classes import BY_CODE, code_of

PROGRESSION_RATES = {
    "D00": {
        "worsen_per_week": 1.2,   # severity points per week
        "to_pothole_days": 90,    # typical days until it breaks into a pothole if untreated
        "risk": "Water enters along the crack; it branches into transverse and then alligator cracking.",
    },
    "D10": {
        "worsen_per_week": 1.5,
        "to_pothole_days": 60,
        "risk": "Edges ravel under traffic and the crack opens; it can break into a pothole at the joint.",
    },
    "D20": {
        "worsen_per_week": 2.0,
        "to_pothole_days": 21,
        "risk": "Fatigue cracking breaks into loose blocks that traffic plucks out, forming potholes.",
    },
    "D40": {
        "worsen_per_week": 3.0,
        "to_pothole_days": 0,
        "risk": "The hole widens and deepens with every heavy vehicle and rainfall.",
    },
}

MONSOON_MONTHS = {6, 7, 8, 9}
MONSOON_MULTIPLIER = 2.5


def predict_damage_progression(detection: dict, now: datetime | None = None) -> dict:
    """Forecast how one detection worsens over the next 12 weeks."""
    code = code_of(detection.get("code") or detection.get("class_name"))
    prog = PROGRESSION_RATES[code]
    current = float(detection.get("severity", 50))
    now = now or datetime.now(timezone.utc)
    is_monsoon = now.month in MONSOON_MONTHS
    mult = MONSOON_MULTIPLIER if is_monsoon else 1.0

    worsen_per_week = prog["worsen_per_week"] * mult
    days_to_pothole = max(0.0, prog["to_pothole_days"] * (1 - current / 100) / mult)

    timeline = []
    for weeks in (1, 2, 4, 8, 12):
        future = min(100.0, current + worsen_per_week * weeks)
        status = "critical" if future >= 70 else "warning" if future >= 40 else "monitor"
        timeline.append({
            "weeks": weeks,
            "label": f"{weeks} week{'s' if weeks > 1 else ''}",
            "predicted_severity": round(future, 1),
            "status": status,
            "description": (
                f"Severity about {future:.0f}: "
                + ("repair urgently" if status == "critical" else "schedule a repair" if status == "warning" else "monitor")
            ),
        })

    cost_now = int((detection.get("cost") or {}).get("cost_estimated", 0))
    cost_if_delayed = {
        "1_week": int(cost_now * 1.2),
        "2_weeks": int(cost_now * 1.5),
        "1_month": int(cost_now * 2.5),
        "3_months": int(cost_now * 5.0),
    }

    if current >= 70 or (code != "D40" and days_to_pothole < 14):
        urgency, color, action = "IMMEDIATE", "critical", "Make safe and send a crew within 48 hours"
    elif current >= 55 or days_to_pothole < 30:
        urgency, color, action = "HIGH", "warning", "Schedule a repair within 2 weeks"
    elif current >= 40:
        urgency, color, action = "MODERATE", "moderate", "Add to the next maintenance cycle"
    else:
        urgency, color, action = "LOW", "low", "Monitor during routine inspections"

    return {
        "damage_type": BY_CODE[code]["label"],
        "code": code,
        "current_severity": round(current, 1),
        "confidence": detection.get("confidence", 0.0),
        "prediction": {
            "days_to_pothole": round(days_to_pothole),
            "pothole_eta": "Already a pothole" if code == "D40" else f"about {round(days_to_pothole)} days",
            "worsen_per_week": round(worsen_per_week, 1),
            "monsoon_active": is_monsoon,
            "weather_multiplier": mult,
        },
        "timeline": timeline,
        "urgency": urgency,
        "urgency_color": color,
        "recommended_action": action,
        "risk_description": prog["risk"],
        "cost_projection": cost_now,
        "cost_if_delayed": cost_if_delayed,
        "basis": "Rule-based planning heuristic; monsoon (Jun-Sep) speeds deterioration 2.5x",
    }


def predict_all_detections(detections: list) -> list:
    return [predict_damage_progression(d) for d in detections]


def generate_area_forecast(reports: list) -> dict:
    """Which places will deteriorate first, from open reports."""
    zones: dict[str, dict] = {}
    for r in reports:
        if r.get("status") == "fixed":
            continue
        ward = r.get("ward") or {}
        name = (r.get("location") or {}).get("name") or "Unknown"
        zone = zones.setdefault(name, {"reports": 0, "total_severity": 0.0, "predictions": [], "ward": ward})
        zone["reports"] += 1
        zone["total_severity"] += float((r.get("summary") or {}).get("max_severity",
                                        (r.get("stats") or {}).get("avg_severity", 0)))
        for det in (r.get("detections") or [])[:2]:
            zone["predictions"].append(det.get("forecast") or predict_damage_progression(det))

    forecasts = []
    for name, z in zones.items():
        avg_sev = z["total_severity"] / z["reports"] if z["reports"] else 0
        worst_eta = min((p["prediction"]["days_to_pothole"] for p in z["predictions"]), default=999)
        risk = min(100.0, avg_sev + max(0, 100 - worst_eta) * 0.3 + z["reports"] * 5)
        forecasts.append({
            "zone": name,
            "ward": z["ward"].get("code") if isinstance(z["ward"], dict) else None,
            "risk_score": round(risk, 1),
            "active_issues": z["reports"],
            "avg_severity": round(avg_sev, 1),
            "earliest_failure_days": worst_eta,
            "forecast": (
                "Already potholed or expected to break up within 2 weeks" if worst_eta < 14
                else f"Likely to deteriorate within about {worst_eta} days" if worst_eta < 60
                else "Slow deterioration: check quarterly"
            ),
        })
    forecasts.sort(key=lambda x: x["risk_score"], reverse=True)
    return {"zones": forecasts, "total_zones": len(forecasts)}
