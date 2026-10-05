"""Inspector console endpoints: full map data, status workflow, settings, demo reset."""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Form, HTTPException

from gamification import seed_profiles_from_reports
from ledger import VALID_STATUSES, admin_map_item, set_status
from store import store

router = APIRouter(tags=["admin"])


@router.get("/admin/reports/map")
async def admin_map():
    store.refresh()
    _, index = store.hazards()
    items = [admin_map_item(r, index) for r in store.reports
             if (r.get("location") or {}).get("latitude") is not None]
    return {"reports": items, "total": len(items)}


@router.patch("/admin/reports/{report_id}/status")
async def update_status(
    report_id: str,
    status: str = Form(...),
    note: str = Form(default=""),
    propagate: bool = Form(default=True),
    assigned_to: Optional[str] = Form(default=None),
):
    """Move a report through submitted -> acknowledged -> in_progress -> fixed.

    With propagate=true (default) the change applies to every report merged
    into the same hazard.
    """
    if status not in VALID_STATUSES:
        raise HTTPException(400, f"status must be one of: {', '.join(VALID_STATUSES)}.")
    with store.mutate():
        r = store.find_report(report_id)
        if not r:
            raise HTTPException(404, "No report with that id.")
        _, index = store.hazards()
        hazard_id = index.get(report_id)
        targets = [r]
        if propagate and hazard_id:
            targets = [x for x in store.reports if index.get(x["id"]) == hazard_id]
        updated = []
        for t in targets:
            t_note = note if t["id"] == report_id else (note or "") + f" (applied to hazard {hazard_id})"
            set_status(t, status, t_note.strip())
            if assigned_to is not None:
                t["assigned_to"] = assigned_to or None
            updated.append(t["id"])
    return {
        "id": report_id,
        "status": status,
        "hazard_id": hazard_id,
        "updated": updated,
        "message": f"Status set to {status.replace('_', ' ')} for {len(updated)} report(s).",
    }


@router.post("/admin/reset-demo")
async def reset_demo():
    n = store.reset_to_seed()
    seed_profiles_from_reports(store.reports)
    return {"reports": n}


@router.post("/admin/reports/seed-demo")
async def seed_demo_alias():
    n = store.reset_to_seed()
    seed_profiles_from_reports(store.reports)
    return {"reports": n, "seeded": n, "total_reports": n, "message": f"Demo ledger restored with {n} reports."}


@router.get("/admin/settings")
async def get_settings():
    return store.settings


@router.patch("/admin/settings")
async def update_settings(fraud_detection_enabled: Optional[bool] = Form(default=None)):
    with store.mutate():
        if fraud_detection_enabled is not None:
            store.settings["fraud_detection_enabled"] = fraud_detection_enabled
    return store.settings
