import json

import config
from pipeline import DETECTION_KEYS


def _no_base64(obj, path="$"):
    """Fail if any long base64-looking string or image field sneaks into a list response."""
    if isinstance(obj, dict):
        assert "annotated_image" not in obj, f"annotated_image at {path}"
        for k, v in obj.items():
            _no_base64(v, f"{path}.{k}")
    elif isinstance(obj, list):
        for i, v in enumerate(obj):
            _no_base64(v, f"{path}[{i}]")
    elif isinstance(obj, str):
        assert len(obj) < 2000, f"suspiciously long string at {path}"


def test_health(client):
    r = client.get("/health")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok"
    assert body["service"] == "RoadGuard AI API"
    assert body["version"] == "4.0.0"
    assert body["model_ready"] is True
    assert "time" in body


def test_model(client):
    body = client.get("/model").json()
    det = body["detector"]
    for k in ("name", "file", "architecture", "params_m", "imgsz", "runtime", "classes",
              "trained_on", "metrics", "baseline", "latency_ms", "evaluated_at"):
        assert k in det
    assert det["file"] in ("roadguard_det.pt", "roadguard_det.onnx", "best.pt")
    assert [c["code"] for c in det["classes"]] == ["D00", "D10", "D20", "D40"]
    assert body["segmenter"]["metrics"] == {"mask_map50": 0.634, "box_map50": 0.788}
    assert set(body["segmenter"]) == {"name", "file", "use", "metrics"}
    assert isinstance(body["pipeline"], list) and body["pipeline"]
    assert "cpu_onnx_latency_ms" in det


def test_model_card_states_the_severity_weights_in_use(client):
    from severity import WEIGHTS

    score = next(p for p in client.get("/model").json()["pipeline"] if p.startswith("Score:"))
    assert score == "Score: severity from " + ", ".join(
        f"{name} {round(WEIGHTS[k] * 100)}%" for k, name in
        [("type", "defect type"), ("extent", "extent"), ("road_class", "road class"), ("confidence", "confidence"), ("density", "density")]
    )


def test_public_map_has_seed_and_no_base64(client):
    body = client.get("/public/reports/map").json()
    assert body["total"] >= 20
    _no_base64(body)
    item = body["reports"][0]
    for k in ("id", "latitude", "longitude", "location_name", "damage_type", "class_key", "code", "severity",
              "severity_level", "status", "timestamp", "reporter", "description", "upvotes", "defect_count",
              "image_url", "hazard_id", "duplicate_of", "ward", "road_class"):
        assert k in item, k
    img = client.get(item["image_url"])
    assert img.status_code == 200 and img.headers["content-type"] == "image/jpeg"


def test_admin_map_items(client):
    body = client.get("/admin/reports/map").json()
    _no_base64(body)
    item = body["reports"][0]
    for k in ("cost_estimated", "repair_method", "status_history", "assigned_to", "detections", "image",
              "authority", "trust_score", "summary"):
        assert k in item, k


def test_hazards_merge_duplicates(client):
    body = client.get("/hazards").json()
    assert body["eps_m"] == 25
    assert body["duplicates_merged"] >= 3
    assert body["total"] == len(body["hazards"])
    hz = body["hazards"][0]
    for k in ("hazard_id", "latitude", "longitude", "report_ids", "report_count", "worst_severity", "worst_level",
              "status", "ward", "damage_types", "total_upvotes", "first_reported", "last_reported", "image_url"):
        assert k in hz
    merged = [h for h in body["hazards"] if h["report_count"] > 1]
    assert all(h["hazard_id"] == "HZ-" + h["report_ids"][0][4:] for h in merged)


def test_analytics_summary(client):
    body = client.get("/analytics/summary").json()
    for k in ("open_hazards", "open_reports", "critical_open", "fixed_last_7d", "median_days_open",
              "backlog_cost", "reports_last_30d", "duplicates_merged", "sla", "updated_at"):
        assert k in body
    assert body["sla"]["ack_target_h"] == 48
    assert body["sla"]["fix_target_d"] == {"S4": 7, "S3": 15, "S2": 30, "S1": 60}
    assert 0 <= body["sla"]["on_time_pct"] <= 100
    assert body["open_hazards"] > 0


def test_analytics_timeline(client):
    body = client.get("/analytics/timeline?days=30").json()
    assert len(body["days"]) == 30
    assert set(body["days"][0]) == {"date", "reported", "acknowledged", "fixed"}
    assert body["totals"]["reported"] == sum(d["reported"] for d in body["days"]) > 0


def test_analytics_wards(client):
    body = client.get("/analytics/wards").json()
    assert body["total"] == len(body["wards"]) > 0
    w = body["wards"][0]
    for k in ("code", "name", "authority", "latitude", "longitude", "open", "fixed", "critical_open",
              "avg_days_open", "sla_breaches", "health_score"):
        assert k in w


def test_complaint_template(client):
    rid = client.get("/public/reports/map").json()["reports"][0]["id"]
    body = client.get(f"/reports/{rid}/complaint?mode=template").json()
    assert body["generated_by"] == "template"
    assert body["report_id"] == rid and rid in body["body"]
    assert body["grounding"] and body["evidence"]
    assert set(body["to"]) == {"authority", "office", "channel", "escalation"}


def test_feed_and_detail(client):
    items = client.get("/public/feed?limit=5").json()["items"]
    assert len(items) == 5
    _no_base64(items)
    detail = client.get(f"/public/reports/{items[0]['id']}").json()
    assert detail["image_url"] and detail["hazard_id"] and detail["ward"]
    assert isinstance(detail["annotated_image"], str)


def test_detect_with_seed_image(client):
    seed = json.loads(config.SEED_STORE_FILE.read_text(encoding="utf-8"))
    fname = seed["reports"][0]["image"]["file"]
    data = (config.SEED_IMAGES_DIR / fname).read_bytes()
    r = client.post("/detect", files={"file": (fname, data, "image/jpeg")},
                    data={"confidence": "0.25", "road_class": "arterial"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["id"].startswith("SCN-")
    for k in ("timestamp", "image", "road_class", "detections", "summary", "stats", "annotated_image",
              "inference_ms", "model", "authenticity", "predictions", "location"):
        assert k in body, k
    assert body["image"]["url"].startswith("/media/u/")
    assert body["detections"], "seed image should produce detections"
    for d in body["detections"]:
        assert list(d.keys()) == list(DETECTION_KEYS)
        assert d["class_name"] == d["code"] and d["label"] == d["display_name"]
        assert len(d["bbox"]) == 4 and len(d["bbox_norm"]) == 4
        assert d["severity_level"] in ("S1", "S2", "S3", "S4")
        assert d["cost"]["currency"] == "INR"
        if d["code"] == "D40":
            assert d["geometry"] is None
    assert len(body["annotated_image"]) > 1000


def test_detect_rejects_non_image(client):
    r = client.post("/detect", files={"file": ("notes.txt", b"hello", "text/plain")})
    assert r.status_code == 400
    assert "Upload a JPEG or PNG photo of the road" in r.json()["detail"]
    r = client.post("/detect", files={"file": ("x.jpg", b"not really a jpeg", "image/jpeg")})
    assert r.status_code == 400


def test_detect_rejects_bad_road_class(client):
    seed = json.loads(config.SEED_STORE_FILE.read_text(encoding="utf-8"))
    data = (config.SEED_IMAGES_DIR / seed["reports"][0]["image"]["file"]).read_bytes()
    r = client.post("/detect", files={"file": ("a.jpg", data, "image/jpeg")}, data={"road_class": "motorway"})
    assert r.status_code == 400


def test_public_report_requires_location(client):
    seed = json.loads(config.SEED_STORE_FILE.read_text(encoding="utf-8"))
    data = (config.SEED_IMAGES_DIR / seed["reports"][0]["image"]["file"]).read_bytes()
    r = client.post("/public/report", files={"file": ("a.jpg", data, "image/jpeg")})
    assert r.status_code == 400
    assert r.json()["detail"] == "Turn on location or pick the spot on the map."


def test_public_report_duplicate_and_status_propagation(client):
    seed = json.loads(config.SEED_STORE_FILE.read_text(encoding="utf-8"))
    target = seed["reports"][1]
    data = (config.SEED_IMAGES_DIR / target["image"]["file"]).read_bytes()
    before = client.get(f"/public/reports/{target['id']}").json()
    hazard_id = before["hazard_id"]
    first_id = "RPT-" + hazard_id[3:]
    first_upvotes = client.get(f"/public/reports/{first_id}").json()["upvotes"]

    client.patch("/admin/settings", data={"fraud_detection_enabled": "false"})
    try:
        lat = target["location"]["latitude"] + 5 / 111_320.0
        r = client.post("/public/report", files={"file": ("a.jpg", data, "image/jpeg")},
                        data={"latitude": str(lat), "longitude": str(target["location"]["longitude"]),
                              "reporter_name": "Test Citizen", "road_class": target["road_class"]})
    finally:
        client.patch("/admin/settings", data={"fraud_detection_enabled": "true"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["status"] == "submitted"
    assert body["hazard_id"] == hazard_id
    assert body["duplicate_of"] == first_id
    for k in ("image_url", "ward", "detections", "summary", "trust_score", "severity_summary"):
        assert k in body, k
    assert client.get(f"/public/reports/{first_id}").json()["upvotes"] == first_upvotes + 1

    r = client.patch(f"/admin/reports/{body['id']}/status", data={"status": "acknowledged", "note": "Seen"})
    assert r.status_code == 200
    updated = r.json()["updated"]
    assert body["id"] in updated and first_id in updated
    statuses = {x["id"]: x["status"] for x in client.get("/public/reports/map").json()["reports"]}
    assert all(statuses[i] == "acknowledged" for i in updated)


def test_reset_demo_restores_seed(client):
    seed = json.loads(config.SEED_STORE_FILE.read_text(encoding="utf-8"))
    r = client.post("/admin/reset-demo")
    assert r.json() == {"reports": len(seed["reports"])}
    assert client.get("/public/reports/map").json()["total"] == len(seed["reports"])


def test_leaderboard_is_built_from_the_ledger(client):
    from collections import Counter

    from store import store

    client.post("/admin/reset-demo")
    counts = Counter(r["reporter"] for r in store.reports)
    board = client.get("/gamification/leaderboard").json()["leaderboard"]
    assert {row["name"]: row["total_reports"] for row in board} == dict(counts)
    assert [row["xp"] for row in board] == sorted((row["xp"] for row in board), reverse=True)


def test_daily_challenges_are_named_and_start_at_zero(client):
    challenges = client.get("/gamification/challenges/Someone%20New").json()["challenges"]
    assert len(challenges) == 3
    for c in challenges:
        assert c["name"] and c["description"]
        assert c["progress"] == 0 and c["completed"] is False


def test_compat_endpoints(client):
    for path in ("/stats", "/alerts", "/detections", "/repair-plan", "/analytics/wall-of-shame",
                 "/analytics/accountability", "/analytics/heatmap", "/analytics/priority-queue",
                 "/analytics/city-health", "/analytics/forecast", "/public/stats", "/sectors",
                 "/gamification/leaderboard", "/gamification/achievements", "/admin/settings"):
        assert client.get(path).status_code == 200, path
    login = client.post("/auth/login", data={"username": "admin", "password": "admin123"})
    assert login.status_code == 200
    me = client.get("/auth/me", headers={"Authorization": f"Bearer {login.json()['token']}"})
    assert me.json()["role"] == "government"
    assert client.post("/auth/login", data={"username": "saud", "password": "123"}).status_code == 200
