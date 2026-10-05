"""
RoadGuard AI API.

Run:  uvicorn main:app --app-dir backend --port 8000

Startup loads the detector and crack segmenter (fails loudly if no local
detector exists), warms them up, and loads the ledger (from
data/roadguard_store.json, or from the seed on first start).
"""

from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

import config
from config import SERVICE_NAME, VERSION, log
from gamification import seed_profiles_from_reports
from inference import ModelNotFoundError, get_detector
from routers import accounts, admin, analytics, detect, meta, reports, whatsapp
from routers import gamification as gamification_router
from store import store

config.ensure_dirs()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    log(f"Starting {SERVICE_NAME} {VERSION}")
    try:
        detector = get_detector()
    except ModelNotFoundError as e:
        log(f"FATAL: {e}")
        raise
    detector.warmup()
    store.init()
    seed_profiles_from_reports(store.reports)
    log(f"Ready: {len(store.reports)} reports on the ledger, detector {detector.det_path.name} "
        f"({detector.runtime_string}).")
    yield


app = FastAPI(
    title=SERVICE_NAME,
    description="Road-damage detection, prioritisation and complaint routing for Indian cities.",
    version=VERSION,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/media/u", StaticFiles(directory=str(config.UPLOAD_DIR), check_dir=False), name="uploads")
app.mount("/media/seed", StaticFiles(directory=str(config.SEED_IMAGES_DIR), check_dir=False), name="seed")

for r in (meta.router, accounts.router, detect.router, reports.router, admin.router,
          analytics.router, gamification_router.router, whatsapp.router):
    app.include_router(r)
