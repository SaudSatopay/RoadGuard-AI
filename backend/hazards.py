"""
Duplicate merging: reports of the same physical hazard are clustered with
DBSCAN (haversine metric, eps = 25 m, min_samples = 1).

The hazard id is stable: "HZ-" + the earliest member report id without its
"RPT-" prefix. The hazard status is the most advanced status of its reports.
"""

from __future__ import annotations

from datetime import datetime, timezone

import numpy as np
from sklearn.cluster import DBSCAN

from config import DUPLICATE_RADIUS_M
from severity import level_rank
from wards import haversine_m

EARTH_RADIUS_M = 6_371_000.0
STATUS_ORDER = ["submitted", "acknowledged", "in_progress", "fixed"]


def status_rank(status: str) -> int:
    return STATUS_ORDER.index(status) if status in STATUS_ORDER else 0


def parse_ts(ts) -> datetime:
    if isinstance(ts, datetime):
        return ts if ts.tzinfo else ts.replace(tzinfo=timezone.utc)
    dt = datetime.fromisoformat(str(ts).replace("Z", "+00:00"))
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def _coords(r: dict):
    loc = r.get("location") or {}
    lat, lng = loc.get("latitude"), loc.get("longitude")
    if lat is None or lng is None:
        return None
    return float(lat), float(lng)


def cluster_labels(points: list[tuple[float, float]], eps_m: float = DUPLICATE_RADIUS_M) -> list[int]:
    """DBSCAN cluster label for each (lat, lng) point."""
    if not points:
        return []
    X = np.radians(np.asarray(points, dtype=float))
    db = DBSCAN(eps=eps_m / EARTH_RADIUS_M, min_samples=1, metric="haversine", algorithm="ball_tree")
    return db.fit_predict(X).tolist()


def hazard_id_for(report_ids_by_time: list[str]) -> str:
    first = report_ids_by_time[0]
    return "HZ-" + (first[4:] if first.startswith("RPT-") else first)


def _sort_key(r: dict):
    return (parse_ts(r["timestamp"]), r["id"])


def _worst_report(members: list[dict]) -> dict:
    def key(r):
        s = r.get("summary") or {}
        return (level_rank(s.get("worst_level") or "S1"), float(s.get("max_severity", 0)))
    return max(members, key=key)


def build_hazards(reports: list[dict], eps_m: float = DUPLICATE_RADIUS_M) -> tuple[list[dict], dict[str, str]]:
    """Cluster reports into hazards.

    Returns (hazards, index) where index maps report id -> hazard id.
    """
    located = [r for r in reports if _coords(r) is not None]
    labels = cluster_labels([_coords(r) for r in located], eps_m)
    groups: dict[int, list[dict]] = {}
    for r, lab in zip(located, labels):
        groups.setdefault(lab, []).append(r)

    hazards, index = [], {}
    for members in groups.values():
        members.sort(key=_sort_key)
        hid = hazard_id_for([m["id"] for m in members])
        worst = _worst_report(members)
        ws = worst.get("summary") or {}
        lats = [_coords(m)[0] for m in members]
        lngs = [_coords(m)[1] for m in members]
        status = max((m.get("status", "submitted") for m in members), key=status_rank)
        damage_types = []
        for m in members:
            for d in m.get("detections") or []:
                lbl = d.get("label") or d.get("display_name")
                if lbl and lbl not in damage_types:
                    damage_types.append(lbl)
        hazards.append({
            "hazard_id": hid,
            "latitude": round(sum(lats) / len(lats), 6),
            "longitude": round(sum(lngs) / len(lngs), 6),
            "report_ids": [m["id"] for m in members],
            "report_count": len(members),
            "worst_severity": float(ws.get("max_severity", 0)),
            "worst_level": ws.get("worst_level"),
            "status": status,
            "ward": worst.get("ward") or members[0].get("ward"),
            "damage_types": damage_types,
            "total_upvotes": sum(int(m.get("upvotes", 0)) for m in members),
            "first_reported": members[0]["timestamp"],
            "last_reported": members[-1]["timestamp"],
            "image_url": worst.get("image_url"),
            "worst_report_id": worst["id"],
            "total_cost": int(ws.get("total_cost", 0)),
            "location_name": (worst.get("location") or {}).get("name", ""),
            "road_class": worst.get("road_class"),
        })
        for m in members:
            index[m["id"]] = hid
    hazards.sort(key=lambda h: (level_rank(h["worst_level"] or "S1"), h["worst_severity"]), reverse=True)
    return hazards, index


def duplicates_merged(hazards: list[dict]) -> int:
    return sum(h["report_count"] for h in hazards) - len(hazards)


def find_open_duplicate(lat: float, lng: float, reports: list[dict], hazards: list[dict],
                        index: dict[str, str], radius_m: float = DUPLICATE_RADIUS_M) -> dict | None:
    """The open hazard (not fixed) that a new point at (lat, lng) duplicates, if any."""
    open_ids = {h["hazard_id"] for h in hazards if h["status"] != "fixed"}
    best, best_d = None, float("inf")
    for r in reports:
        c = _coords(r)
        hid = index.get(r["id"])
        if c is None or hid not in open_ids:
            continue
        d = haversine_m(lat, lng, c[0], c[1])
        if d <= radius_m and d < best_d:
            best, best_d = hid, d
    if best is None:
        return None
    return next(h for h in hazards if h["hazard_id"] == best)
