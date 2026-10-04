"""
Approximate ward / node centroids and the authority responsible for each.

Centroids are approximate (good to a few hundred metres) and results are
labelled "approx.". A point is assigned to the nearest centroid within 4 km.
"""

from __future__ import annotations

import math

AUTHORITIES = {
    "MCGM": "Municipal Corporation of Greater Mumbai",
    "NMMC": "Navi Mumbai Municipal Corporation",
    "PMC": "Panvel Municipal Corporation",
    "TMC": "Thane Municipal Corporation",
    "CIDCO": "City and Industrial Development Corporation of Maharashtra",
    "MSRDC": "MSRDC (Maharashtra State Road Development Corporation)",
}

# code, name, authority, lat, lng
_WARDS = [
    ("A", "Colaba–Fort", "MCGM", 18.920, 72.830),
    ("B", "Sandhurst Road", "MCGM", 18.955, 72.835),
    ("C", "Marine Lines", "MCGM", 18.950, 72.825),
    ("D", "Malabar Hill–Grant Road", "MCGM", 18.960, 72.810),
    ("E", "Byculla", "MCGM", 18.975, 72.835),
    ("F/S", "Parel", "MCGM", 19.000, 72.840),
    ("F/N", "Matunga–Sion", "MCGM", 19.030, 72.860),
    ("G/S", "Worli", "MCGM", 19.010, 72.820),
    ("G/N", "Dadar–Mahim", "MCGM", 19.030, 72.840),
    ("H/E", "Bandra East–Santacruz East", "MCGM", 19.070, 72.850),
    ("H/W", "Bandra West", "MCGM", 19.060, 72.830),
    ("K/E", "Andheri East", "MCGM", 19.115, 72.870),
    ("K/W", "Andheri West–Juhu", "MCGM", 19.130, 72.830),
    ("L", "Kurla", "MCGM", 19.070, 72.885),
    ("M/E", "Govandi–Mankhurd", "MCGM", 19.050, 72.925),
    ("M/W", "Chembur", "MCGM", 19.060, 72.900),
    ("N", "Ghatkopar", "MCGM", 19.085, 72.910),
    ("P/S", "Goregaon", "MCGM", 19.165, 72.850),
    ("P/N", "Malad", "MCGM", 19.190, 72.845),
    ("R/S", "Kandivali", "MCGM", 19.205, 72.845),
    ("R/C", "Borivali", "MCGM", 19.230, 72.855),
    ("R/N", "Dahisar", "MCGM", 19.250, 72.860),
    ("S", "Bhandup–Powai", "MCGM", 19.140, 72.930),
    ("T", "Mulund", "MCGM", 19.170, 72.955),
    ("BEL", "Belapur", "NMMC", 19.020, 73.040),
    ("NER", "Nerul", "NMMC", 19.035, 73.015),
    ("VAS", "Vashi", "NMMC", 19.075, 73.000),
    ("TUR", "Turbhe", "NMMC", 19.080, 73.020),
    ("KOP", "Kopar Khairane", "NMMC", 19.105, 73.010),
    ("GHA", "Ghansoli", "NMMC", 19.120, 73.000),
    ("AIR", "Airoli", "NMMC", 19.155, 72.995),
    ("DIG", "Digha", "NMMC", 19.170, 72.990),
    ("KHA", "Kharghar", "PMC", 19.045, 73.065),
    ("KAM", "Kamothe", "PMC", 19.020, 73.095),
    ("KAL", "Kalamboli", "PMC", 19.030, 73.100),
    ("PNV", "Panvel", "PMC", 18.990, 73.115),
    ("TAL", "Taloja", "PMC", 19.065, 73.115),
    ("THA", "Thane", "TMC", 19.200, 72.970),
    ("URN", "Uran", "CIDCO", 18.880, 72.940),
]

WARDS = [
    {"code": c, "name": n, "authority": a, "authority_name": AUTHORITIES[a], "latitude": lat, "longitude": lng}
    for c, n, a, lat, lng in _WARDS
]
WARDS_BY_CODE = {w["code"]: w for w in WARDS}

MAX_WARD_DISTANCE_KM = 4.0
OUTSIDE = {"code": "—", "name": "Outside mapped wards"}


def haversine_m(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    r = 6_371_000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(min(1.0, math.sqrt(a)))


def _nearest(lat: float, lng: float) -> tuple[dict, float]:
    best, best_d = WARDS[0], float("inf")
    for w in WARDS:
        d = haversine_m(lat, lng, w["latitude"], w["longitude"])
        if d < best_d:
            best, best_d = w, d
    return best, best_d


def ward_for(lat, lng) -> dict:
    """Nearest ward/node within 4 km, else the 'outside' marker."""
    if lat is None or lng is None:
        return {**OUTSIDE, "authority": None, "authority_name": None, "distance_km": None, "approx": True}
    w, d = _nearest(float(lat), float(lng))
    if d > MAX_WARD_DISTANCE_KM * 1000:
        return {**OUTSIDE, "authority": None, "authority_name": None,
                "distance_km": round(d / 1000, 1), "approx": True}
    return {
        "code": w["code"],
        "name": w["name"],
        "authority": w["authority"],
        "authority_name": w["authority_name"],
        "distance_km": round(d / 1000, 1),
        "approx": True,
    }


def authority_for(ward: dict, road_class: str | None, lat=None, lng=None) -> dict:
    """Which body a complaint should go to."""
    if road_class == "expressway":
        return {"short": "MSRDC", "name": AUTHORITIES["MSRDC"], "basis": "road_class"}
    if ward and ward.get("authority"):
        return {"short": ward["authority"], "name": AUTHORITIES[ward["authority"]], "basis": "ward"}
    if lat is not None and lng is not None:
        w, d = _nearest(float(lat), float(lng))
        if d <= 15_000:
            return {"short": w["authority"], "name": w["authority_name"], "basis": "nearest_ward"}
    return {
        "short": "Local authority",
        "name": "The municipal corporation or road-owning agency for this location",
        "basis": "unknown",
    }


def office_for(ward: dict, authority: dict) -> str:
    """Addressee line for a complaint letter (generic, cautious titles)."""
    short = authority.get("short")
    if short == "MSRDC":
        return "The Executive Engineer, MSRDC"
    if short == "MCGM" and ward.get("code") not in (None, "—"):
        return f"The Assistant Commissioner, Ward {ward['code']} ({ward['name']}) Office"
    if short in ("NMMC", "PMC", "TMC") and ward.get("code") not in (None, "—"):
        return f"The Ward Officer, {ward['name']} Ward Office"
    if short == "CIDCO":
        return f"The Executive Engineer, CIDCO ({ward.get('name', 'Navi Mumbai')})"
    return "The Officer in charge of road maintenance"
