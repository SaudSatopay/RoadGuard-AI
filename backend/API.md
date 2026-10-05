# RoadGuard AI API (v4.0.0)

Base URL `http://127.0.0.1:8000`. Run with `uvicorn main:app --app-dir backend --port 8000`.
Interactive docs at `/docs`. Uploads are `multipart/form-data`. Errors are `{"detail": "<what to do>"}` with status 400 (bad input) or 404 (unknown id).

Conventions

- Severity levels: `S1` Minor (< 40), `S2` Moderate (40-55), `S3` Severe (55-70), `S4` Critical (>= 70). Compat `severity_label`: S1 `minor`, S2/S3 `warning`, S4 `critical`.
- Classes: `D00` longitudinal_crack, `D10` transverse_crack, `D20` alligator_crack, `D40` pothole.
- `road_class`: `expressway` | `arterial` (default) | `collector` | `local`.
- Status workflow: `submitted` -> `acknowledged` -> `in_progress` -> `fixed`.
- Images: `image_url` is relative (`/media/u/<file>` for uploads, `/media/seed/<file>` for seed photos). Base64 (`annotated_image`) only appears on `POST /detect`, `/detect/frame`, `/detect/video` frames, `GET /public/reports/{id}` and `GET /detections/{id}`; never in list responses.
- `ward` object: `{"code", "name", "authority", "authority_name", "distance_km", "approx": true}`; outside the mapped wards: `{"code": "—", "name": "Outside mapped wards", "authority": null, ...}`.
- `authority` object: `{"short": "MCGM", "name": "Municipal Corporation of Greater Mumbai", "basis": "ward" | "road_class" | "nearest_ward" | "unknown"}`. Expressways route to MSRDC.

## Detection object

Exact keys, in this order. `bbox` is in original-image pixels (1 decimal); `bbox_norm` is 0..1; `area_ratio` is box area / image area x 100.
`geometry` is `null` for potholes, and for a crack whose box contains no segmented crack pixels.

```json
{
  "id": "d1", "code": "D20", "class_key": "alligator_crack", "label": "Alligator crack",
  "display_name": "Alligator crack", "class_name": "D20", "category": "Crack",
  "risk": "Interconnected fatigue cracking that shows the pavement structure is failing ...",
  "repair": "Remove the cracked area and rebuild it with a full-depth patch, ...",
  "confidence": 0.655,
  "bbox": [297.1, 551.2, 424.1, 649.9], "bbox_norm": [0.4126, 0.7656, 0.5891, 0.9026], "area_ratio": 2.42,
  "geometry": {"mask_coverage_pct": 4.1, "length_px": 160, "mean_width_px": 5.2, "length_m": 0.8,
               "length_basis": "≈ assumes the photo spans one 3.6 m lane"},
  "severity": 71.9, "severity_level": "S4", "severity_label": "critical", "severity_name": "Critical",
  "severity_factors": [
    {"key": "type", "label": "Defect type", "weight": 0.35, "value": 0.85, "points": 29.8, "detail": "Alligator crack: structural fatigue cracking"},
    {"key": "extent", "label": "Damaged extent", "weight": 0.25, "value": 0.449, "points": 11.2, "detail": "Covers 2.4% of the photo"},
    {"key": "road_class", "label": "Road class", "weight": 0.2, "value": 0.8, "points": 16.0, "detail": "Arterial road: main road carrying heavy daily traffic"},
    {"key": "confidence", "label": "Model confidence", "weight": 0.1, "value": 0.655, "points": 6.6, "detail": "The detector is 66% confident"},
    {"key": "density", "label": "Defect density", "weight": 0.1, "value": 0.833, "points": 8.3, "detail": "5 defects found in this photo"}
  ],
  "explanation": {"severity_score": 71.9, "severity_label": "critical",
    "explanation": "Severity 71.9 (S4 Critical): alligator crack on an arterial road, covers 2.4% of the photo, detected with 66% confidence.",
    "factors": [{"factor": "Defect type", "impact": "high", "detail": "Alligator crack: structural fatigue cracking"}],
    "recommendation": "Make the spot safe now and repair within 7 days (RoadGuard target)."},
  "cost": {"cost_min": 40000, "cost_max": 150000, "cost_estimated": 99600, "cost_if_ignored": 597600,
    "savings_if_fixed_now": 498000, "repair_method": "Full-depth reclamation and overlay", "repair_time": "2-5 days",
    "crew_size": 8, "currency": "INR", "basis": "Indicative estimate from typical Indian municipal repair rates"},
  "forecast": {"damage_type": "Alligator crack", "code": "D20", "current_severity": 71.9,
    "prediction": {"days_to_pothole": 7, "pothole_eta": "about 7 days", "worsen_per_week": 2.0, "monsoon_active": false, "weather_multiplier": 1.0},
    "timeline": [{"weeks": 1, "label": "1 week", "predicted_severity": 73.9, "status": "critical", "description": "Severity about 74: repair urgently"}],
    "urgency": "IMMEDIATE", "recommended_action": "Make safe and send a crew within 48 hours", "...": "..."},
  "priority_rank": 1, "urgency_score": 115.5
}
```

Severity = 100 x (0.35 type + 0.25 extent + 0.20 road class + 0.10 confidence + 0.10 density); see `severity.py`.

## Meta

`GET /health`
```json
{"status": "ok", "service": "RoadGuard AI API", "version": "4.0.0", "model_ready": true, "time": "2026-10-04T15:52:32+00:00"}
```

`GET /model` (`trained_on`, `metrics`, `baseline`, `latency_ms`, `cpu_onnx_latency_ms`, `evaluated_at` come from `model/model_card.json` when its `detector_file` matches the loaded file, else `null`)
```json
{"detector": {"name": "RoadGuard road-damage detector", "file": "roadguard_det.pt", "architecture": "YOLO26s", "params_m": 9.95,
  "imgsz": 640, "runtime": "cuda:0 · torch 2.11",
  "classes": [{"id": 0, "code": "D00", "key": "longitudinal_crack", "label": "Longitudinal crack"}, "..."],
  "trained_on": {"dataset": "RDD2022 (CRDDC'2022)", "...": "..."}, "metrics": {"test": {"map50": 0.602, "...": "..."}, "per_country": {"...": "..."}},
  "baseline": {"name": "CrackWatch YOLOv8s (legacy)", "...": "..."}, "latency_ms": 12.5, "cpu_onnx_latency_ms": 72.8, "evaluated_at": "2026-10-05"},
 "segmenter": {"name": "Crack segmenter", "file": "crack_seg.pt", "use": "Runs only when a crack is detected; ...",
  "metrics": {"mask_map50": 0.634, "box_map50": 0.788}},
 "pipeline": ["Detect: YOLOv8s finds 4 RDD2022 defect classes at 640 px", "..."]}
```

`GET /sectors` (compat, roads only): `{"sectors": [{"id": "road", "label": "Roads", ...}]}`

## Scanning

`POST /detect` form: `file`, `confidence`=0.25, `road_class`=arterial, `latitude`?, `longitude`?, `location_name`?, `tta`=false
```json
{"id": "SCN-802F1B", "timestamp": "2026-10-04T15:52:34+00:00",
 "image": {"width": 720, "height": 720, "url": "/media/u/SCN-802F1B.jpg"}, "road_class": "arterial",
 "detections": ["<Detection>"],
 "summary": {"total": 5, "by_level": {"S1": 0, "S2": 2, "S3": 2, "S4": 1}, "worst_level": "S4", "max_severity": 71.9,
  "avg_severity": 58.3, "road_condition_index": 33.6, "total_cost": 122800, "total_cost_if_ignored": 690400,
  "recommended_action": "Make the spot safe now and repair within 7 days (RoadGuard target)."},
 "stats": {"total_defects": 5, "critical_count": 1, "warning_count": 4, "minor_count": 0, "avg_severity": 58.3,
  "max_severity": 71.9, "structural_integrity": 36.3, "damage_types": {"Alligator crack": 1, "Longitudinal crack": 3, "Transverse crack": 1}},
 "annotated_image": "/9j/4AAQ...", "inference_ms": 206.1,
 "model": {"name": "Legacy RDD road-damage detector", "runtime": "cuda:0 · torch 2.11"},
 "authenticity": {"trust_score": 75, "verdict": "authentic", "is_likely_authentic": true, "flags": [], "recommendation": "..."},
 "predictions": ["<forecast per detection>"], "location": {"latitude": null, "longitude": null, "name": null}}
```
Bad input -> 400 `{"detail": "That file is not a photo (text/plain). Upload a JPEG or PNG photo of the road."}`

`POST /detect/frame` form: `frame_data` (base64 or data URL), `confidence`, `road_class`
```json
{"detections": ["<Detection>"], "summary": {"...": "..."}, "image": {"width": 1280, "height": 720},
 "annotated_image": "/9j/...", "detection_count": 2, "inference_ms": 38.2}
```

`POST /detect/video` form: `file` (video/*), `confidence`, `frame_interval`=30, `road_class`
```json
{"video_info": {"filename": "drive.mp4", "total_frames": 900, "fps": 30.0, "duration_sec": 30.0, "frames_analyzed": 6, "frame_interval": 30},
 "frame_results": [{"frame_number": 120, "timestamp_sec": 4.0, "timestamp_display": "0:04", "detections": ["<Detection>"],
   "detection_count": 1, "summary": {"...": "..."}, "annotated_image": "/9j/..."}],
 "aggregate_stats": {"...": "..."}, "summary": {"...": "..."}, "total_detections": 7, "processing_time_ms": 2140.5}
```

`POST /detect/batch` form: `files` (several), `confidence`, `road_class`
```json
{"results": [{"id": "SCN-1A2B3C", "filename": "a.jpg", "image": {"width": 720, "height": 720, "url": "/media/u/SCN-1A2B3C.jpg"},
  "detection_count": 2, "detections": ["<Detection>"], "summary": {"...": "..."}, "stats": {"...": "..."}, "inference_ms": 61.0}],
 "total_processed": 1}
```

`POST /analytics/before-after` form: `before_file`, `after_file`, `road_class`
```json
{"before": {"detections": 3, "avg_severity": 66.1, "road_condition_index": 30.2, "integrity": 31.0, "summary": {}, "annotated_image": "..."},
 "after": {"detections": 0, "...": "..."}, "improvement_pct": 100.0, "severity_reduced": 66.1, "verdict": "Improved"}
```

History (scans and reports): `GET /detections` -> `{"detections": [{"id", "timestamp", "filename", "source", "stats", "summary", "inference_time_ms", "location", "image_url", "detection_count"}], "total"}`; `GET /detections/{id}` -> the full record plus `annotated_image`; `GET /stats` -> compat stats plus `summary`, `total_scans`, `locations_with_damage`; `GET /alerts` -> `{"alerts": [{"id", "time", "type", "severity", "severity_level", "message", "detection_id", "class_name"}], "total"}`; `GET /repair-plan`, `GET /repair-plan/{id}` -> `{"generated_at", "location", "summary": {...}, "top_priorities": [...], "all_detections": [...]}`.

## Citizen reports and the public ledger

`POST /public/report` form: `file`, `latitude`?, `longitude`?, `road_class`=arterial, `description`, `reporter_name`, `location_name`.
Missing lat/lng falls back to the photo's EXIF GPS, else 400 `"Turn on location or pick the spot on the map."`
```json
{"id": "RPT-4C1D2E", "status": "submitted", "detections_count": 2,
 "severity_summary": {"critical": 1, "warning": 1, "minor": 0},
 "trust_score": 88.5, "trust_verdict": "trusted", "flags": [], "gamification": {"points_earned": 25, "xp_earned": 125, "...": "..."},
 "message": "Thanks. Your report is on the public ledger and has been merged with an earlier report of the same spot. It is routed to Municipal Corporation of Greater Mumbai.",
 "fraud_check": {"...": "..."}, "image_url": "/media/u/RPT-4C1D2E.jpg", "hazard_id": "HZ-9F1995", "duplicate_of": "RPT-9F1995",
 "ward": {"code": "N", "name": "Ghatkopar", "authority": "MCGM", "...": "..."},
 "authority": {"short": "MCGM", "name": "Municipal Corporation of Greater Mumbai", "basis": "ward"},
 "detections": ["<Detection>"], "summary": {"...": "..."}}
```
Other outcomes keep their shapes: `{"id": null, "status": "no_damage", "message", "detections_count", "max_confidence", "annotated_image", "hint"}`, `{"id": null, "status": "rejected", "message", "trust_score", "flags", "fraud_check"}`, and `"status": "under_review"` when the trust check wants a manual look.
A report within 25 m of an open hazard gets `duplicate_of` = that hazard's earliest report id, which gains one upvote.

`GET /public/reports/map`
```json
{"reports": [{"id": "RPT-80A4DF", "latitude": 19.1176, "longitude": 72.8553, "location_name": "Western Express Highway, Andheri East",
  "damage_type": "Pothole", "class_key": "pothole", "code": "D40", "severity": 79.3, "severity_level": "S4", "status": "submitted",
  "timestamp": "2026-09-29T00:10:32+00:00", "reporter": "Rahul Mehta", "description": "Pothole in the left lane; two-wheelers swerve around it.",
  "upvotes": 16, "defect_count": 4, "image_url": "/media/seed/India_005305.jpg", "hazard_id": "HZ-80A4DF", "duplicate_of": null,
  "ward": {"code": "K/E", "name": "Andheri East", "authority": "MCGM", "authority_name": "Municipal Corporation of Greater Mumbai", "distance_km": 1.6, "approx": true},
  "road_class": "arterial"}], "total": 24}
```

`GET /admin/reports/map` -> same items plus `cost_estimated`, `repair_method`, `status_history` (`[{"status", "time", "note"}]`), `assigned_to`, `detections` (full), `image` (`{"width", "height"}`), `authority`, `trust_score`, `summary`.
`GET /public/reports/map/detail` (legacy) -> map items plus `cost_estimated`, `repair_method`, `status_history`.

`GET /public/reports/{id}` -> the full stored report: map fields plus `location`, `image`, `image_url`, `detections`, `summary`, `stats`, `status_history`, `ward`, `authority`, `hazard_id`, `fraud_check`, and `annotated_image` (base64, rendered from the stored photo; `""` if the photo is missing).

`GET /public/feed?limit=8`
```json
{"items": [{"id": "RPT-B5FB12", "timestamp": "2026-10-03T05:22:32+00:00", "location_name": "Ranade Road, Dadar West",
  "damage_type": "Alligator crack", "severity_level": "S4", "status": "submitted", "image_url": "/media/seed/India_003674.jpg",
  "ward": {"code": "G/N", "name": "Dadar–Mahim", "...": "..."}}]}
```

`POST /public/reports/{id}/upvote` -> `{"id": "RPT-80A4DF", "upvotes": 17}`

`GET /public/stats` -> `{"total_reports", "total_hazards", "fixed", "in_progress", "acknowledged", "pending", "performance_score", "total_estimated_cost", "total_estimated_cost_formatted"}`

## Hazards (merged duplicates)

`GET /hazards` (DBSCAN, haversine, eps 25 m, min_samples 1; id = `HZ-` + earliest report id without `RPT-`; status = most advanced member status; centroid = mean of members; `image_url` of the worst report)
```json
{"hazards": [{"hazard_id": "HZ-9F1995", "latitude": 19.090527, "longitude": 72.905434, "report_ids": ["RPT-9F1995", "RPT-63F1BB"],
  "report_count": 2, "worst_severity": 81.8, "worst_level": "S4", "status": "in_progress",
  "ward": {"code": "N", "name": "Ghatkopar", "...": "..."}, "damage_types": ["Alligator crack", "Pothole"], "total_upvotes": 19,
  "first_reported": "2026-08-25T07:10:00+00:00", "last_reported": "2026-08-27T11:40:00+00:00", "image_url": "/media/seed/India_005526.jpg"}],
 "total": 21, "duplicates_merged": 3, "eps_m": 25}
```

## Inspector workflow

`PATCH /admin/reports/{id}/status` form: `status`, `note`="", `propagate`=true, `assigned_to`?
```json
{"id": "RPT-63F1BB", "status": "acknowledged", "hazard_id": "HZ-9F1995", "updated": ["RPT-9F1995", "RPT-63F1BB"],
 "message": "Status set to acknowledged for 2 report(s)."}
```

`POST /admin/reset-demo` -> `{"reports": 24}` (restores the seed with timestamps relative to now). `POST /admin/reports/seed-demo` is an alias (`{"reports", "seeded", "total_reports", "message"}`).
`GET /admin/settings` / `PATCH /admin/settings` (form `fraud_detection_enabled`) -> `{"fraud_detection_enabled": true}`

## Analytics

`GET /analytics/summary` (SLA targets are RoadGuard targets, not government commitments; a hazard breaches when it was not acknowledged within 48 h or not fixed within its level's target)
```json
{"open_hazards": 17, "open_reports": 20, "critical_open": 12, "fixed_last_7d": 1, "median_days_open": 16.9, "backlog_cost": 1457900,
 "reports_last_30d": 16, "duplicates_merged": 3,
 "sla": {"ack_target_h": 48, "fix_target_d": {"S4": 7, "S3": 15, "S2": 30, "S1": 60}, "breaches": 17, "on_time_pct": 19.0,
  "basis": "RoadGuard targets, not government commitments"},
 "updated_at": "2026-10-04T15:52:32+00:00"}
```

`GET /analytics/timeline?days=30` (counts of status-history entries per UTC day)
```json
{"days": [{"date": "2026-10-03", "reported": 1, "acknowledged": 0, "fixed": 0}], "totals": {"reported": 16, "acknowledged": 9, "fixed": 3}}
```

`GET /analytics/wards` (sorted worst health first)
```json
{"wards": [{"code": "K/E", "name": "Andheri East", "authority": "MCGM", "latitude": 19.115, "longitude": 72.87, "open": 2, "fixed": 0,
  "critical_open": 2, "avg_days_open": 20.1, "sla_breaches": 2, "health_score": 47.3}], "total": 19}
```

Compat analytics, computed from the ledger:
`GET /analytics/wall-of-shame` = `GET /analytics/accountability` -> `{"leaderboard": [{"contractor_id": "K/E", "contractor_name": "MCGM ward K/E", "ward", "authority", "area", "city", "total_reports", "total_hazards", "fixed", "unfixed", "fix_rate", "avg_severity", "avg_fix_time_hrs", "negligence_score", "sla_breaches", "performance_score", "rank"}], "total_contractors", "worst_performer", "best_performer", "basis"}` (grouped by ward office);
`GET /analytics/heatmap` -> `{"points": [{"lat", "lng", "intensity", "severity", "severity_level", "status", "type"}], "total"}`;
`GET /analytics/priority-queue` -> `{"priorities": [{"report_id", "hazard_id", "location", "ward", "damage_type", "severity", "severity_level", "days_unresolved", "upvotes", "report_count", "priority_score", "estimated_cost", "repair_method", "status", "rank"}], "total_unfixed"}`;
`GET /analytics/city-health` -> `{"cities": [{"city", "health_score", "total_reports", "total_hazards", "fixed", "unfixed", "fix_rate", "avg_severity", "avg_fix_time_hrs", "trend", "rank"}], "total_cities"}`;
`GET /analytics/forecast` -> `{"zones": [{"zone", "ward", "risk_score", "active_issues", "avg_severity", "earliest_failure_days", "forecast"}], "total_zones"}`.

## Complaint letters

`GET /reports/{id}/complaint?mode=auto|template` (template by default; `auto` uses Claude only when `ANTHROPIC_API_KEY` is set, falling back to the template with a `note`)
```json
{"report_id": "RPT-80A4DF", "hazard_id": "HZ-80A4DF", "generated_by": "template",
 "to": {"authority": "Municipal Corporation of Greater Mumbai", "office": "The Assistant Commissioner, Ward K/E (Andheri East) Office",
  "channel": "MCGM ward office, MCGM's online complaint portal, or the 24x7 civic helpline 1916",
  "escalation": ["Escalate to the Assistant Commissioner of the ward.", "If there is no reply, file an RTI application ..."]},
 "subject": "Pothole at Western Express Highway, Andheri East, RoadGuard report RPT-80A4DF",
 "body": "04 October 2026\n\nTo,\nThe Assistant Commissioner, Ward K/E (Andheri East) Office\n...\nSubmitted through RoadGuard AI on behalf of Rahul Mehta",
 "evidence": [{"label": "RoadGuard report", "value": "RPT-80A4DF"}, {"label": "GPS", "value": "19.11760, 72.85530"}, "..."],
 "grounding": [{"id": "kb-mcgm-1916", "title": "MCGM civic helpline 1916", "source": "Municipal Corporation of Greater Mumbai", "snippet": "..."}],
 "created_at": "2026-10-04T15:52:33+00:00"}
```

## Accounts, gamification, WhatsApp

- `POST /auth/login` form `username`, `password` -> `{"token", "role", "name", "department", "username"}` (demo: admin/admin123, inspector/inspect123, engineer/eng123, citizen saud/123). `POST /auth/register` form `name`. `GET /auth/me` with `Authorization: Bearer <token>` -> `{"username", "role", "name"}`.
- `GET /gamification/leaderboard`, `/gamification/profile/{user_id}`, `/gamification/challenges/{user_id}`, `/gamification/ai-challenge`, `/gamification/fix-streaks`, `/gamification/achievements`; `POST /gamification/verify` (form `report_id`, `voter_id`, `vote`), `/gamification/ai-challenge/answer`, `/gamification/seed-demo`.
- `POST /whatsapp/webhook` (Twilio form fields `From`, `Body`, `NumMedia`, `MediaUrl0`, `MediaContentType0`, `Latitude`, `Longitude`, `ProfileName`) -> TwiML. Photo first, then location; the report joins the same ledger.

## Media

`GET /media/u/<file>` (uploaded originals, EXIF stripped) and `GET /media/seed/<file>` (RDD2022 seed photos, CC BY 4.0, see `seed/ATTRIBUTION.md`).
