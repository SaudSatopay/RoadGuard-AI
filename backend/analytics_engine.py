"""
Ledger analytics for RoadGuard AI.

Everything here is computed from the reports ledger and its status history:
open backlog, SLA performance against RoadGuard targets, daily timeline,
per-ward accountability, heatmap and priority queue. Nothing is typed in.
"""

from __future__ import annotations

import statistics
from collections import defaultdict
from datetime import datetime, timedelta, timezone

from config import SLA_ACK_HOURS, SLA_FIX_DAYS
from hazards import parse_ts
from wards import WARDS_BY_CODE

CITY_FOR_AUTHORITY = {
    "MCGM": "Mumbai", "NMMC": "Navi Mumbai", "PMC": "Panvel", "TMC": "Thane", "CIDCO": "Uran (CIDCO)",
}


def report_severity(r: dict) -> float:
    s = r.get("summary") or {}
    if "max_severity" in s:
        return float(s["max_severity"])
    return float((r.get("stats") or {}).get("max_severity", 0))


def report_label(r: dict) -> str:
    dets = r.get("detections") or []
    if not dets:
        return "Unknown"
    top = max(dets, key=lambda d: d.get("severity", 0))
    return top.get("label") or top.get("display_name") or "Defect"


def _first_time(reports: list[dict], statuses: set[str]) -> datetime | None:
    times = [parse_ts(h["time"]) for r in reports for h in (r.get("status_history") or [])
             if h.get("status") in statuses]
    return min(times) if times else None


def hazard_sla(hazard: dict, members: list[dict], now: datetime) -> dict:
    """SLA outcome for one hazard against RoadGuard targets."""
    first = parse_ts(hazard["first_reported"])
    ack = _first_time(members, {"acknowledged", "in_progress", "fixed"})
    fixed = _first_time(members, {"fixed"}) if hazard["status"] == "fixed" else None
    level = hazard.get("worst_level") or "S1"
    fix_deadline = first + timedelta(days=SLA_FIX_DAYS.get(level, 60))
    ack_deadline = first + timedelta(hours=SLA_ACK_HOURS)
    ack_breach = (ack is None and now > ack_deadline) or (ack is not None and ack > ack_deadline)
    fix_breach = (fixed is None and now > fix_deadline) or (fixed is not None and fixed > fix_deadline)
    end = fixed or now
    return {
        "ack_breach": ack_breach,
        "fix_breach": fix_breach,
        "breach": ack_breach or fix_breach,
        "days_open": (end - first).total_seconds() / 86400.0,
        "fixed_at": fixed,
    }


def _members(hazard: dict, by_id: dict) -> list[dict]:
    return [by_id[i] for i in hazard["report_ids"] if i in by_id]


def summary(reports: list[dict], hazards: list[dict], now: datetime | None = None) -> dict:
    now = now or datetime.now(timezone.utc)
    by_id = {r["id"]: r for r in reports}
    open_h = [h for h in hazards if h["status"] != "fixed"]
    slas = {h["hazard_id"]: hazard_sla(h, _members(h, by_id), now) for h in hazards}
    fixed_7d = sum(1 for h in hazards if h["status"] == "fixed" and slas[h["hazard_id"]]["fixed_at"]
                   and now - slas[h["hazard_id"]]["fixed_at"] <= timedelta(days=7))
    days_open = [slas[h["hazard_id"]]["days_open"] for h in open_h]
    breaches = sum(1 for s in slas.values() if s["breach"])
    return {
        "open_hazards": len(open_h),
        "open_reports": sum(1 for r in reports if r.get("status") != "fixed"),
        "critical_open": sum(1 for h in open_h if h.get("worst_level") == "S4"),
        "fixed_last_7d": fixed_7d,
        "median_days_open": round(statistics.median(days_open), 1) if days_open else 0,
        "backlog_cost": sum(int(h.get("total_cost", 0)) for h in open_h),
        "reports_last_30d": sum(1 for r in reports if now - parse_ts(r["timestamp"]) <= timedelta(days=30)),
        "duplicates_merged": sum(h["report_count"] for h in hazards) - len(hazards),
        "sla": {
            "ack_target_h": SLA_ACK_HOURS,
            "fix_target_d": dict(SLA_FIX_DAYS),
            "breaches": breaches,
            "on_time_pct": round((len(hazards) - breaches) / len(hazards) * 100, 1) if hazards else 100.0,
            "basis": "RoadGuard targets, not government commitments",
        },
        "updated_at": now.isoformat(),
    }


def timeline(reports: list[dict], days: int = 30, now: datetime | None = None) -> dict:
    now = now or datetime.now(timezone.utc)
    days = max(1, min(int(days), 365))
    start = (now - timedelta(days=days - 1)).date()
    buckets = {(start + timedelta(days=i)).isoformat(): {"reported": 0, "acknowledged": 0, "fixed": 0}
               for i in range(days)}
    key_for = {"submitted": "reported", "acknowledged": "acknowledged", "fixed": "fixed"}
    for r in reports:
        for h in r.get("status_history") or []:
            k = key_for.get(h.get("status"))
            if not k:
                continue
            day = parse_ts(h["time"]).date().isoformat()
            if day in buckets:
                buckets[day][k] += 1
    rows = [{"date": d, **v} for d, v in buckets.items()]
    totals = {k: sum(row[k] for row in rows) for k in ("reported", "acknowledged", "fixed")}
    return {"days": rows, "totals": totals}


def wards_analytics(reports: list[dict], hazards: list[dict], now: datetime | None = None) -> dict:
    now = now or datetime.now(timezone.utc)
    by_id = {r["id"]: r for r in reports}
    groups: dict[str, list[dict]] = defaultdict(list)
    for h in hazards:
        code = (h.get("ward") or {}).get("code") or "—"
        groups[code].append(h)
    rows = []
    for code, hs in groups.items():
        w = WARDS_BY_CODE.get(code)
        open_h = [h for h in hs if h["status"] != "fixed"]
        slas = [hazard_sla(h, _members(h, by_id), now) for h in hs]
        open_days = [s["days_open"] for h, s in zip(hs, slas) if h["status"] != "fixed"]
        breaches = sum(1 for s in slas if s["breach"])
        critical_open = sum(1 for h in open_h if h.get("worst_level") == "S4")
        avg_days = sum(open_days) / len(open_days) if open_days else 0.0
        health = 100 - min(40, 8 * len(open_h)) - min(30, 10 * critical_open) - min(20, 5 * breaches) \
            - min(10, avg_days / 3)
        rows.append({
            "code": code,
            "name": w["name"] if w else "Outside mapped wards",
            "authority": w["authority"] if w else None,
            "latitude": w["latitude"] if w else None,
            "longitude": w["longitude"] if w else None,
            "open": len(open_h),
            "fixed": len(hs) - len(open_h),
            "critical_open": critical_open,
            "avg_days_open": round(avg_days, 1),
            "sla_breaches": breaches,
            "health_score": round(max(0.0, min(100.0, health)), 1),
        })
    rows.sort(key=lambda r: (r["health_score"], -r["open"]))
    return {"wards": rows, "total": len(rows)}


# ------------------------------------------------------------- compat analytics

def generate_wall_of_shame(reports: list[dict], hazards: list[dict], now: datetime | None = None) -> dict:
    """Accountability by ward office, computed from the ledger (worst first).

    Keeps the legacy field names (contractor_*) so older screens still work;
    the "contractor" is the ward office responsible for the road.
    """
    now = now or datetime.now(timezone.utc)
    by_id = {r["id"]: r for r in reports}
    groups: dict[str, list[dict]] = defaultdict(list)
    for h in hazards:
        groups[(h.get("ward") or {}).get("code") or "—"].append(h)
    board = []
    for code, hs in groups.items():
        w = WARDS_BY_CODE.get(code)
        slas = [hazard_sla(h, _members(h, by_id), now) for h in hs]
        fixed = [s for h, s in zip(hs, slas) if h["status"] == "fixed"]
        unfixed = [(h, s) for h, s in zip(hs, slas) if h["status"] != "fixed"]
        fix_rate = len(fixed) / len(hs) * 100
        avg_fix_h = sum(s["days_open"] for s in fixed) / len(fixed) * 24 if fixed else 0.0
        negligence = sum(h["worst_severity"] * max(1.0, s["days_open"]) for h, s in unfixed)
        avg_sev = sum(h["worst_severity"] for h in hs) / len(hs)
        performance = max(0.0, min(100.0, fix_rate - negligence / max(1, len(hs)) / 10))
        name = f"{w['authority']} ward {code}" if w else "Unmapped area"
        board.append({
            "contractor_id": code,
            "contractor_name": name,
            "ward": code,
            "authority": w["authority"] if w else None,
            "area": w["name"] if w else "Outside mapped wards",
            "city": CITY_FOR_AUTHORITY.get(w["authority"], "") if w else "",
            "total_reports": sum(h["report_count"] for h in hs),
            "total_hazards": len(hs),
            "fixed": len(fixed),
            "unfixed": len(unfixed),
            "fix_rate": round(fix_rate, 1),
            "avg_severity": round(avg_sev, 1),
            "avg_fix_time_hrs": round(avg_fix_h, 1),
            "negligence_score": round(negligence, 1),
            "sla_breaches": sum(1 for s in slas if s["breach"]),
            "performance_score": round(performance, 1),
            "rank": 0,
        })
    board.sort(key=lambda x: (x["performance_score"], -x["negligence_score"]))
    for i, b in enumerate(board):
        b["rank"] = i + 1
    return {
        "leaderboard": board,
        "total_contractors": len(board),
        "worst_performer": board[0] if board else None,
        "best_performer": board[-1] if board else None,
        "basis": "Computed from the RoadGuard ledger, grouped by ward office",
    }


def generate_heatmap_data(reports: list[dict]) -> list[dict]:
    points = []
    for r in reports:
        loc = r.get("location") or {}
        lat, lng = loc.get("latitude"), loc.get("longitude")
        if lat is None or lng is None:
            continue
        sev = report_severity(r)
        status = r.get("status", "submitted")
        points.append({
            "lat": lat, "lng": lng,
            "intensity": round(sev / 100 if status != "fixed" else 0.1, 2),
            "severity": sev,
            "severity_level": (r.get("summary") or {}).get("worst_level"),
            "status": status,
            "type": report_label(r),
        })
    return points


def generate_priority_queue(reports: list[dict], hazards: list[dict], now: datetime | None = None) -> list[dict]:
    """Open hazards ranked by severity x time unresolved x public interest."""
    now = now or datetime.now(timezone.utc)
    by_id = {r["id"]: r for r in reports}
    queue = []
    for h in hazards:
        if h["status"] == "fixed":
            continue
        worst = by_id.get(h["worst_report_id"]) or {}
        days = (now - parse_ts(h["first_reported"])).total_seconds() / 86400
        time_factor = min(days, 30) / 30
        traffic = min(h["total_upvotes"] / 10, 2.0)
        score = h["worst_severity"] * (1 + time_factor) * (1 + traffic)
        top = max(worst.get("detections") or [{}], key=lambda d: d.get("severity", 0))
        queue.append({
            "report_id": h["worst_report_id"],
            "hazard_id": h["hazard_id"],
            "location": h.get("location_name") or "Unknown",
            "ward": h.get("ward"),
            "damage_type": report_label(worst) if worst else "Unknown",
            "severity": h["worst_severity"],
            "severity_level": h.get("worst_level"),
            "days_unresolved": round(days, 1),
            "upvotes": h["total_upvotes"],
            "report_count": h["report_count"],
            "priority_score": round(score, 1),
            "estimated_cost": int(h.get("total_cost", 0)),
            "repair_method": (top.get("cost") or {}).get("repair_method", ""),
            "status": h["status"],
        })
    queue.sort(key=lambda x: x["priority_score"], reverse=True)
    for i, q in enumerate(queue):
        q["rank"] = i + 1
    return queue


def generate_city_health_scores(reports: list[dict], hazards: list[dict], now: datetime | None = None) -> list[dict]:
    now = now or datetime.now(timezone.utc)
    by_id = {r["id"]: r for r in reports}
    groups: dict[str, list[dict]] = defaultdict(list)
    for h in hazards:
        auth = (h.get("ward") or {}).get("authority")
        groups[CITY_FOR_AUTHORITY.get(auth, "Other")].append(h)
    scores = []
    for city, hs in groups.items():
        slas = [hazard_sla(h, _members(h, by_id), now) for h in hs]
        fixed = [s for h, s in zip(hs, slas) if h["status"] == "fixed"]
        unfixed = len(hs) - len(fixed)
        fix_rate = len(fixed) / len(hs)
        avg_sev = sum(h["worst_severity"] for h in hs) / len(hs)
        avg_fix_h = sum(s["days_open"] for s in fixed) / len(fixed) * 24 if fixed else None
        health = 100 - min(30, unfixed * 5) - min(30, avg_sev * 0.4) \
            - (min(20, (avg_fix_h or 0) / 24 * 2) if fixed else 10) + fix_rate * 20
        scores.append({
            "city": city,
            "health_score": round(max(0.0, min(100.0, health)), 1),
            "total_reports": sum(h["report_count"] for h in hs),
            "total_hazards": len(hs),
            "fixed": len(fixed),
            "unfixed": unfixed,
            "fix_rate": round(fix_rate * 100, 1),
            "avg_severity": round(avg_sev, 1),
            "avg_fix_time_hrs": round(avg_fix_h, 1) if avg_fix_h is not None else None,
            "trend": "improving" if fix_rate > 0.5 else "stable" if fix_rate > 0.2 else "worsening",
        })
    scores.sort(key=lambda x: x["health_score"], reverse=True)
    for i, s in enumerate(scores):
        s["rank"] = i + 1
    return scores

