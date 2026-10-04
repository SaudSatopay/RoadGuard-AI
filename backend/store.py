"""
Runtime state for RoadGuard AI.

- Reports (the public ledger), scans (/detect results) and alerts live in
  memory and are written to `data/roadguard_store.json` after every change.
- Merge-on-read: before a read or write, if the file was changed by another
  process (for example a separate WhatsApp webhook worker), its records are
  merged in by id (file wins). A reset writes a new `generation`, which makes
  the other process replace its state instead of merging.
- Images: uploads are saved to `uploads/<id>.jpg` and served at
  `/media/u/<file>`; seed photos are served at `/media/seed/<file>`.
  No base64 image is ever stored.
- On first start (no store file) the seed is loaded with its relative
  timestamps materialised against "now", so the demo always looks current.
"""

from __future__ import annotations

import json
import os
import threading
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

from PIL import Image

import config
from config import log
from hazards import build_hazards
from predictive_engine import predict_damage_progression

MEDIA_UPLOAD_PREFIX = "/media/u/"
MEDIA_SEED_PREFIX = "/media/seed/"


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def iso(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).isoformat()


def new_id(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4().hex[:6].upper()}"


def image_url_for(image: dict | None) -> str | None:
    if not image or not image.get("file"):
        return None
    prefix = MEDIA_SEED_PREFIX if image.get("source") == "seed" else MEDIA_UPLOAD_PREFIX
    return prefix + image["file"]


def image_path_for(image: dict | None) -> Path | None:
    if not image or not image.get("file"):
        return None
    base = config.SEED_IMAGES_DIR if image.get("source") == "seed" else config.UPLOAD_DIR
    path = (base / image["file"]).resolve()
    return path if path.exists() else None


def save_upload(record_id: str, image: Image.Image) -> dict:
    """Save an uploaded photo (re-encoded, so EXIF incl. GPS is not kept)."""
    config.UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    fname = f"{record_id}.jpg"
    image.convert("RGB").save(config.UPLOAD_DIR / fname, format="JPEG", quality=90)
    return {"width": image.width, "height": image.height, "file": fname, "source": "upload"}


def materialize_seed(seed: dict, now: datetime | None = None) -> list[dict]:
    """Turn seed reports with `hours_ago` offsets into reports with real timestamps."""
    now = now or now_utc()
    reports = []
    for raw in seed.get("reports", []):
        r = json.loads(json.dumps(raw))  # deep copy
        r["timestamp"] = iso(now - timedelta(hours=float(r.pop("hours_ago", 0))))
        history = []
        for h in r.get("status_history", []):
            h = dict(h)
            h["time"] = iso(now - timedelta(hours=float(h.pop("hours_ago", 0))))
            history.append(h)
        r["status_history"] = history
        fixed = [h["time"] for h in history if h["status"] == "fixed"]
        r["fix_date"] = fixed[-1] if fixed else None
        r["image_url"] = image_url_for(r.get("image"))
        # Forecasts depend on the current month (monsoon), so refresh them now.
        for d in r.get("detections") or []:
            d["forecast"] = predict_damage_progression(d, now)
        reports.append(r)
    return reports


class Store:
    def __init__(self, path: Path | None = None):
        self.path = Path(path or config.STORE_FILE)
        self.lock = threading.RLock()
        self.reports: list[dict] = []
        self.scans: list[dict] = []
        self.alerts: list[dict] = []
        self.settings: dict = {"fraud_detection_enabled": True}
        self.generation: str = uuid.uuid4().hex
        self._file_mtime: float | None = None
        self._version = 0
        self._hazard_cache: tuple[int, list, dict] | None = None

    # ------------------------------------------------------------ persistence

    def _snapshot(self) -> dict:
        return {
            "generation": self.generation,
            "saved_at": iso(now_utc()),
            "reports": self.reports,
            "scans": self.scans,
            "alerts": self.alerts,
            "settings": self.settings,
        }

    def save(self) -> None:
        with self.lock:
            self.path.parent.mkdir(parents=True, exist_ok=True)
            tmp = self.path.with_suffix(".tmp")
            tmp.write_text(json.dumps(self._snapshot(), ensure_ascii=False, default=str), encoding="utf-8")
            os.replace(tmp, self.path)
            self._file_mtime = self.path.stat().st_mtime
            self._touch()

    def _touch(self) -> None:
        self._version += 1
        self._hazard_cache = None

    def _read_file(self) -> dict | None:
        try:
            return json.loads(self.path.read_text(encoding="utf-8"))
        except FileNotFoundError:
            return None
        except Exception as e:
            log(f"Store file could not be read ({e}); keeping in-memory state.")
            return None

    def load(self) -> bool:
        with self.lock:
            data = self._read_file()
            if data is None:
                return False
            self._apply(data, merge=False)
            return True

    def _apply(self, data: dict, merge: bool) -> None:
        if not merge:
            self.reports = list(data.get("reports", []))
            self.scans = list(data.get("scans", []))
            self.alerts = list(data.get("alerts", []))
        else:
            for attr in ("reports", "scans"):
                merged = {r["id"]: r for r in getattr(self, attr)}
                for r in data.get(attr, []):
                    merged[r["id"]] = r
                setattr(self, attr, list(merged.values()))
            known = {a.get("id") for a in self.alerts}
            self.alerts.extend(a for a in data.get("alerts", []) if a.get("id") not in known)
        self.settings.update(data.get("settings") or {})
        self.generation = data.get("generation", self.generation)
        try:
            self._file_mtime = self.path.stat().st_mtime
        except FileNotFoundError:
            self._file_mtime = None
        self._touch()

    def refresh(self) -> None:
        """Merge changes written by another process since our last read/write."""
        with self.lock:
            try:
                mtime = self.path.stat().st_mtime
            except FileNotFoundError:
                return
            if self._file_mtime is not None and mtime == self._file_mtime:
                return
            data = self._read_file()
            if data is None:
                return
            same_generation = data.get("generation") == self.generation
            self._apply(data, merge=same_generation)

    def init(self) -> None:
        """Load the store file, or build it from the seed on first start."""
        with self.lock:
            if self.load():
                log(f"Loaded {len(self.reports)} reports from {self.path.name}")
                return
            n = self.reset_to_seed()
            log(f"No store file yet; loaded {n} seed reports.")

    def reset_to_seed(self) -> int:
        with self.lock:
            seed = {}
            if config.SEED_STORE_FILE.exists():
                seed = json.loads(config.SEED_STORE_FILE.read_text(encoding="utf-8"))
            else:
                log(f"Seed file {config.SEED_STORE_FILE} not found; starting with an empty ledger. "
                    f"Run scripts/build_seed.py to create it.")
            self.reports = materialize_seed(seed)
            self.scans = []
            self.alerts = []
            self.generation = uuid.uuid4().hex
            self.save()
            return len(self.reports)

    # ------------------------------------------------------------ records

    def find_report(self, report_id: str) -> dict | None:
        return next((r for r in self.reports if r["id"] == report_id), None)

    def find_scan(self, scan_id: str) -> dict | None:
        return next((r for r in self.scans if r["id"] == scan_id), None)

    def add_report(self, report: dict) -> None:
        with self.lock:
            self.refresh()
            self.reports.append(report)
            self.save()

    def add_scan(self, scan: dict) -> None:
        with self.lock:
            self.refresh()
            self.scans.append(scan)
            self.save()

    def add_alerts(self, alerts: list[dict]) -> None:
        if not alerts:
            return
        with self.lock:
            for a in alerts:
                a["id"] = len(self.alerts) + 1
                self.alerts.append(a)
            self.save()

    def mutate(self):
        """Context manager: refresh, let the caller change records, then save."""
        store = self

        class _Mutation:
            def __enter__(self_inner):
                store.lock.acquire()
                store.refresh()
                return store

            def __exit__(self_inner, exc_type, exc, tb):
                try:
                    if exc_type is None:
                        store.save()
                finally:
                    store.lock.release()
                return False

        return _Mutation()

    # ------------------------------------------------------------ hazards

    def hazards(self) -> tuple[list[dict], dict[str, str]]:
        with self.lock:
            if self._hazard_cache and self._hazard_cache[0] == self._version:
                return self._hazard_cache[1], self._hazard_cache[2]
            hazards, index = build_hazards(self.reports)
            self._hazard_cache = (self._version, hazards, index)
            return hazards, index

    def all_records(self) -> list[dict]:
        """Scans plus ledger reports (used by /stats, /detections and /repair-plan)."""
        return list(self.scans) + list(self.reports)


store = Store()
