"""
Build the RoadGuard AI demo seed from held-out RDD2022 India test images.

    python backend/scripts/build_seed.py [--source DIR] [--count 24]

1. Runs the current detector (roadguard_det.pt if present, else best.pt) on the
   India test split and keeps photos with at least one detection at >= 0.4
   confidence, mixing potholes and alligator / longitudinal / transverse cracks.
2. Saves them (max 960 px wide, JPEG q85) to backend/seed/images/.
3. Runs the full pipeline on the saved photos and builds reports at real
   Mumbai / Navi Mumbai / Thane road locations with a spread of statuses.
   Times are stored as RELATIVE offsets (hours ago) so the demo always looks
   current; 3 reports are deliberate duplicates within 25 m of another report.
4. Writes backend/seed/seed_store.json and backend/seed/ATTRIBUTION.md.

Deterministic (fixed random seed). Re-run it when a new detector is dropped in.
Images: RDD2022 (Arya et al.), CC BY 4.0, https://doi.org/10.6084/m9.figshare.21431547
"""

from __future__ import annotations

import argparse
import json
import random
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

from PIL import Image  # noqa: E402

import config  # noqa: E402
from inference import get_detector  # noqa: E402
from pipeline import analyze, load_image  # noqa: E402
from wards import authority_for, ward_for  # noqa: E402

DEFAULT_SOURCE = BACKEND.parent / "training" / "data" / "rdd2022_yolo" / "images" / "test"
RNG_SEED = 2026
MIN_CONF = 0.4
MAX_WIDTH = 960

# lat, lng, name, road_class
LOCATIONS = [
    (19.11760, 72.85530, "Western Express Highway, Andheri East", "arterial"),
    (19.09050, 72.90550, "LBS Marg, Ghatkopar West", "arterial"),
    (19.18650, 72.84400, "SV Road, Malad West", "arterial"),
    (19.17000, 72.95850, "Eastern Express Highway, Mulund", "arterial"),
    (19.05500, 72.83000, "Hill Road, Bandra West", "collector"),
    (19.00800, 72.81700, "Dr Annie Besant Road, Worli", "arterial"),
    (19.02000, 72.84250, "Ranade Road, Dadar West", "collector"),
    (19.05600, 72.89900, "Sion–Trombay Road, Chembur", "arterial"),
    (19.12350, 72.91500, "Jogeshwari–Vikhroli Link Road, Powai", "arterial"),
    (19.11100, 72.87900, "Andheri–Kurla Road, Marol", "arterial"),
    (19.09900, 72.82700, "Juhu Tara Road, Juhu", "collector"),
    (19.14150, 72.82750, "Lokhandwala Back Road, Andheri West", "local"),
    (18.91700, 72.83100, "Colaba Causeway, Colaba", "collector"),
    (19.02800, 73.01200, "Palm Beach Road, Nerul", "arterial"),
    (19.03000, 73.06000, "Sion–Panvel Highway, Kharghar", "arterial"),
    (19.15600, 73.00000, "Thane–Belapur Road, Airoli", "arterial"),
    (19.07600, 72.99900, "Sector 17 Road, Vashi", "collector"),
    (19.01850, 73.11200, "Mumbai–Pune Expressway, Kalamboli", "expressway"),
    (19.01700, 73.03900, "Sector 15 Road, CBD Belapur", "local"),
    (19.10400, 73.01300, "Sector 11 Road, Kopar Khairane", "local"),
    (19.22900, 72.97200, "Ghodbunder Road, Thane", "arterial"),
]

# Final statuses for the 21 base locations (duplicates are always "submitted").
STATUSES = [
    "submitted", "in_progress", "acknowledged", "fixed", "submitted", "in_progress", "submitted",
    "acknowledged", "fixed", "submitted", "in_progress", "submitted", "fixed", "acknowledged",
    "submitted", "in_progress", "fixed", "submitted", "acknowledged", "in_progress", "submitted",
]

# (index of the base report, metres north, metres east)
DUPLICATES = [(0, 9.0, 7.0), (13, -12.0, 8.0), (1, 6.0, -14.0)]

REPORTERS = [
    "Rahul Mehta", "Priya Sharma", "Amit Kumar", "Neha Desai", "Vikram Thakur", "Anjali Rao",
    "Kiran Patil", "Sneha Kulkarni", "Arjun Nair", "Fatima Shaikh", "Rohan Joshi", "Meera Iyer",
    "Saud Vinchu", "Imran Qureshi", "Pooja Patil", "Deepak Yadav",
]

INSPECTORS = ["Inspector Kumar", "Officer Sharma", "Er. Patel"]

DESCRIPTIONS = {
    "D40": [
        "Pothole in the left lane; two-wheelers swerve around it.",
        "Deep pothole near the bus stop. It fills with water when it rains.",
        "Pothole at the junction, cars brake hard to avoid it.",
        "The old patch has broken up into a pothole again.",
    ],
    "D20": [
        "Road surface cracked into small blocks across the lane.",
        "Cracked patch near the signal, pieces are coming loose.",
        "Cracking spreading out from the last patch repair.",
    ],
    "D00": [
        "Long crack along the lane near the divider.",
        "Crack running along the road edge, getting wider.",
    ],
    "D10": [
        "Crack across the full width of the lane.",
        "Several cracks across the road a few metres apart.",
    ],
}

NOTES = {
    "submitted": "Citizen report received",
    "acknowledged": "Inspector acknowledged the report",
    "in_progress": "Repair crew assigned",
    "fixed": "Repair completed",
}


def top_code(detections: list[dict]) -> str:
    return max(detections, key=lambda d: d["confidence"])["code"]


def select_images(source: Path, count: int) -> list[tuple[Path, str, float]]:
    """Pick `count` photos with a confident detection, round-robin across defect types."""
    files = sorted(source.glob("India_*.jpg"))
    if not files:
        raise SystemExit(f"No India_*.jpg images found in {source}")
    buckets: dict[str, list[tuple[Path, str, float]]] = {"D40": [], "D20": [], "D00": [], "D10": []}
    for i, f in enumerate(files):
        res = analyze(load_image(f.read_bytes()), 0.25, "arterial")
        strong = [d for d in res["detections"] if d["confidence"] >= MIN_CONF]
        if strong:
            code = top_code(strong)
            buckets[code].append((f, code, max(d["confidence"] for d in strong)))
        if (i + 1) % 100 == 0:
            print(f"  scanned {i + 1}/{len(files)}")
    for code in buckets:
        buckets[code].sort(key=lambda t: (-t[2], t[0].name))
    print("  candidates per type:", {k: len(v) for k, v in buckets.items()})
    order = ["D40", "D20", "D00", "D10"]
    chosen: list[tuple[Path, str, float]] = []
    while len(chosen) < count and any(buckets.values()):
        for code in order:
            if buckets[code] and len(chosen) < count:
                chosen.append(buckets[code].pop(0))
    return chosen


def save_seed_image(src: Path, dest_dir: Path) -> Path:
    img = load_image(src.read_bytes())
    if img.width > MAX_WIDTH:
        img = img.resize((MAX_WIDTH, round(img.height * MAX_WIDTH / img.width)), Image.LANCZOS)
    dest = dest_dir / src.name
    img.save(dest, format="JPEG", quality=85)
    return dest


def history_for(status: str, hours_ago: float, rng: random.Random) -> list[dict]:
    """Relative status history (hours ago), oldest first."""
    hist = [{"status": "submitted", "hours_ago": round(hours_ago, 1), "note": NOTES["submitted"]}]
    t = hours_ago
    steps = ["acknowledged", "in_progress", "fixed"]
    target = steps.index(status) + 1 if status in steps else 0
    gaps = {"acknowledged": (3, 60), "in_progress": (18, 96), "fixed": (24, 150)}
    for s in steps[:target]:
        lo, hi = gaps[s]
        gap = rng.uniform(lo, hi)
        t = max(1.0, t - gap)
        hist.append({"status": s, "hours_ago": round(t, 1), "note": NOTES[s]})
    return hist


def offset(lat: float, lng: float, north_m: float, east_m: float) -> tuple[float, float]:
    import math
    dlat = north_m / 111_320.0
    dlng = east_m / (111_320.0 * math.cos(math.radians(lat)))
    return round(lat + dlat, 6), round(lng + dlng, 6)


def build_report(rid: str, img_path: Path, lat: float, lng: float, name: str, road_class: str,
                 status: str, hours_ago: float, reporter: str, rng: random.Random) -> dict:
    with Image.open(img_path) as im:
        image = im.convert("RGB")
    res = analyze(image, config.REPORT_CONFIDENCE, road_class)
    dets = res["detections"]
    if not dets:
        raise RuntimeError(f"{img_path.name} has no detections at the report threshold")
    code = max(dets, key=lambda d: d["severity"])["code"]
    ward = ward_for(lat, lng)
    if ward["code"] == "—":
        raise RuntimeError(f"{name} is outside the mapped wards")
    severity = res["summary"]["max_severity"]
    trust = rng.randint(82, 98)
    return {
        "id": rid,
        "hours_ago": round(hours_ago, 1),
        "reporter": reporter,
        "description": rng.choice(DESCRIPTIONS[code]),
        "location": {"latitude": lat, "longitude": lng, "name": name},
        "road_class": road_class,
        "ward": ward,
        "authority": authority_for(ward, road_class, lat, lng),
        "image": {"width": res["image_width"], "height": res["image_height"],
                  "file": img_path.name, "source": "seed"},
        "detections": dets,
        "summary": res["summary"],
        "stats": res["stats"],
        "inference_ms": None,
        "inference_time_ms": None,
        "status": status,
        "status_history": history_for(status, hours_ago, rng),
        "assigned_to": None if status == "submitted" else rng.choice(INSPECTORS),
        "upvotes": int(2 + severity * 0.15 + rng.randint(0, 8)),
        "duplicate_of": None,
        "source": "seed",
        "trust_score": trust,
        "fraud_check": {"combined_trust_score": trust, "verdict": "trusted", "action": "auto_approve", "flags": []},
    }


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--source", type=Path, default=DEFAULT_SOURCE)
    ap.add_argument("--count", type=int, default=len(LOCATIONS) + len(DUPLICATES))
    args = ap.parse_args()
    if args.count < len(LOCATIONS) + len(DUPLICATES):
        raise SystemExit(f"--count must be at least {len(LOCATIONS) + len(DUPLICATES)}")

    rng = random.Random(RNG_SEED)
    detector = get_detector()
    detector.warmup()
    print(f"Detector: {detector.det_path.name} ({detector.architecture}, {detector.runtime_string})")

    print(f"Selecting {args.count} photos from {args.source} ...")
    chosen = select_images(args.source, args.count)
    if len(chosen) < args.count:
        raise SystemExit(f"Only {len(chosen)} suitable photos found; need {args.count}.")

    img_dir = config.SEED_IMAGES_DIR
    img_dir.mkdir(parents=True, exist_ok=True)
    for old in img_dir.glob("*.jpg"):
        old.unlink()
    saved = [(save_seed_image(p, img_dir), code) for p, code, _ in chosen]

    # Crack photos go to collector and local streets first (cracks are the
    # typical defect there), everything else in selection order. Each duplicate
    # then takes a remaining photo of the same defect type as its target.
    pool = list(saved)
    base_imgs = []
    for _lat, _lng, _name, rc in LOCATIONS:
        k = 0
        if rc in ("collector", "local"):
            k = next((i for i, (_, c) in enumerate(pool) if c in ("D00", "D10")), 0)
        base_imgs.append(pool.pop(k))
    spare = pool
    n_base = len(LOCATIONS)
    reports, used_ids = [], set()

    def new_rid() -> str:
        while True:
            rid = f"RPT-{rng.getrandbits(24):06X}"
            if rid not in used_ids:
                used_ids.add(rid)
                return rid

    base_hours = []
    for i, ((lat, lng, name, rc), (img, _code)) in enumerate(zip(LOCATIONS, base_imgs)):
        status = STATUSES[i]
        hours = rng.uniform(120 if status == "fixed" else 8, 45 * 24)
        base_hours.append(hours)
        rep = build_report(new_rid(), img, lat, lng, name, rc, status, hours,
                           REPORTERS[i % len(REPORTERS)], rng)
        reports.append(rep)
        print(f"  {rep['id']}  {rep['summary']['worst_level']}  {status:<12} {name}")

    for j, (target, north, east) in enumerate(DUPLICATES):
        base = reports[target]
        want = max(base["detections"], key=lambda d: d["severity"])["code"]
        pick = next((k for k, (_, c) in enumerate(spare) if c == want), 0)
        img, _ = spare.pop(pick)
        lat, lng = offset(base["location"]["latitude"], base["location"]["longitude"], north, east)
        hours = max(2.0, base_hours[target] - rng.uniform(6, 72))
        rep = build_report(new_rid(), img, lat, lng, base["location"]["name"], base["road_class"],
                           "submitted", hours, REPORTERS[(n_base + j * 5) % len(REPORTERS)], rng)
        rep["duplicate_of"] = base["id"]
        rep["upvotes"] = 1
        reports.append(rep)
        print(f"  {rep['id']}  duplicate of {base['id']} ({base['location']['name']})")

    seed = {
        "version": 1,
        "detector_file": detector.det_path.name,
        "detector_architecture": detector.architecture,
        "time_basis": "hours_ago fields are offsets from the moment the seed is loaded",
        "image_license": "RDD2022 (Arya et al.), CC BY 4.0, https://doi.org/10.6084/m9.figshare.21431547",
        "reports": reports,
    }
    config.SEED_STORE_FILE.write_text(json.dumps(seed, ensure_ascii=False, indent=1), encoding="utf-8")

    lines = [
        "# Seed image attribution",
        "",
        "The demo reports in `seed_store.json` use photographs from the held-out **test** split of the",
        "Road Damage Dataset 2022 (RDD2022), India subset. These images were never used to train",
        "the RoadGuard detector. They were resized to at most 960 px wide and re-encoded as JPEG.",
        "",
        "- Dataset: RDD2022, Arya, D., Maeda, H., Ghosh, S. K., Toshniwal, D. and Sekimoto, Y.",
        "- DOI: https://doi.org/10.6084/m9.figshare.21431547",
        "- License: Creative Commons Attribution 4.0 International (CC BY 4.0),",
        "  https://creativecommons.org/licenses/by/4.0/",
        "",
        "The report locations, reporters, descriptions and statuses are fictional demo data;",
        "the detections, severities and cost estimates were produced by the RoadGuard pipeline",
        f"(detector `{detector.det_path.name}`).",
        "",
        "## Files",
        "",
    ]
    lines += [f"- `images/{p.name}`" for p, _ in saved]
    (config.SEED_DIR / "ATTRIBUTION.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"Wrote {len(reports)} reports to {config.SEED_STORE_FILE} and {len(saved)} images to {img_dir}")


if __name__ == "__main__":
    main()
