"""Ledger analytics: summary, timeline, wards, accountability, heatmap, priorities, forecast."""

from __future__ import annotations

from fastapi import APIRouter, Query

import analytics_engine as ae
from predictive_engine import generate_area_forecast
from store import store

router = APIRouter(tags=["analytics"])


def _data():
    store.refresh()
    hazards, _ = store.hazards()
    return store.reports, hazards


@router.get("/analytics/summary")
async def summary():
    reports, hazards = _data()
    return ae.summary(reports, hazards)


@router.get("/analytics/timeline")
async def timeline(days: int = Query(default=30, ge=1, le=365)):
    reports, _ = _data()
    return ae.timeline(reports, days)


@router.get("/analytics/wards")
async def wards():
    reports, hazards = _data()
    return ae.wards_analytics(reports, hazards)


@router.get("/analytics/wall-of-shame")
@router.get("/analytics/accountability")
async def accountability():
    reports, hazards = _data()
    return ae.generate_wall_of_shame(reports, hazards)


@router.get("/analytics/heatmap")
async def heatmap():
    reports, _ = _data()
    points = ae.generate_heatmap_data(reports)
    return {"points": points, "total": len(points)}


@router.get("/analytics/priority-queue")
async def priority_queue():
    reports, hazards = _data()
    queue = ae.generate_priority_queue(reports, hazards)
    return {"priorities": queue[:10], "total_unfixed": len(queue)}


@router.get("/analytics/city-health")
async def city_health():
    reports, hazards = _data()
    scores = ae.generate_city_health_scores(reports, hazards)
    return {"cities": scores, "total_cities": len(scores)}


@router.get("/analytics/forecast")
async def forecast():
    reports, _ = _data()
    return generate_area_forecast(reports)
