"""
RoadGuard AI backend configuration: paths, environment and service constants.

Every path can be overridden through the environment so tests and a second
process (for example a WhatsApp webhook worker) can point at their own data.
"""

from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parent
load_dotenv(BACKEND_DIR / ".env")

SERVICE_NAME = "RoadGuard AI API"
VERSION = "4.0.0"


def _path_from_env(name: str, default: Path) -> Path:
    value = os.environ.get(name)
    return Path(value).resolve() if value else default


MODEL_DIR = _path_from_env("ROADGUARD_MODEL_DIR", BACKEND_DIR / "model")
DATA_DIR = _path_from_env("ROADGUARD_DATA_DIR", BACKEND_DIR / "data")
UPLOAD_DIR = _path_from_env("ROADGUARD_UPLOAD_DIR", BACKEND_DIR / "uploads")
SEED_DIR = _path_from_env("ROADGUARD_SEED_DIR", BACKEND_DIR / "seed")
SEED_IMAGES_DIR = SEED_DIR / "images"
SEED_STORE_FILE = SEED_DIR / "seed_store.json"
KNOWLEDGE_DIR = BACKEND_DIR / "knowledge"
STORE_FILE = DATA_DIR / "roadguard_store.json"
MODEL_CARD_FILE = MODEL_DIR / "model_card.json"

# Detector files, in order of preference.
DETECTOR_PT = "roadguard_det.pt"
DETECTOR_ONNX = "roadguard_det.onnx"
LEGACY_DETECTOR_PT = "best.pt"
SEGMENTER_PT = "crack_seg.pt"

# auto | cuda | cpu
DEVICE_PREF = os.environ.get("ROADGUARD_DEVICE", "auto").strip().lower() or "auto"

# Optional integrations
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
TWILIO_ACCOUNT_SID = os.environ.get("TWILIO_ACCOUNT_SID", "")
TWILIO_AUTH_TOKEN = os.environ.get("TWILIO_AUTH_TOKEN", "")
TWILIO_WHATSAPP_FROM = os.environ.get("TWILIO_WHATSAPP_FROM", "whatsapp:+14155238886")

# Public-report thresholds
REPORT_CONFIDENCE = 0.30          # detector threshold for citizen photos
REPORT_MIN_CONFIDENCE = 0.35      # at least one detection must reach this
DUPLICATE_RADIUS_M = 25.0         # DBSCAN eps and duplicate radius

# RoadGuard service targets (not government commitments)
SLA_ACK_HOURS = 48
SLA_FIX_DAYS = {"S4": 7, "S3": 15, "S2": 30, "S1": 60}


def log(message: str) -> None:
    """Single log prefix for the whole backend."""
    print(f"[RoadGuard] {message}", flush=True)


def ensure_dirs() -> None:
    for d in (DATA_DIR, UPLOAD_DIR):
        d.mkdir(parents=True, exist_ok=True)
