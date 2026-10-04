from hazards import build_hazards, cluster_labels, find_open_duplicate

BASE = (19.11760, 72.85530)
M_LAT = 1 / 111_320.0  # degrees per metre of latitude


def _report(rid, lat, lng, ts, status="submitted", sev=60.0, level="S3"):
    return {
        "id": rid, "timestamp": ts, "status": status, "upvotes": 2,
        "location": {"latitude": lat, "longitude": lng, "name": "Test road"},
        "summary": {"max_severity": sev, "worst_level": level, "total_cost": 1000},
        "detections": [{"label": "Pothole", "severity": sev}],
        "image_url": f"/media/seed/{rid}.jpg",
        "status_history": [{"status": status, "time": ts}],
    }


def test_dbscan_merges_10m_and_separates_200m():
    labels = cluster_labels([
        BASE,
        (BASE[0] + 10 * M_LAT, BASE[1]),
        (BASE[0] + 200 * M_LAT, BASE[1]),
    ])
    assert labels[0] == labels[1]
    assert labels[2] != labels[0]


def test_hazard_id_is_stable_and_status_most_advanced():
    a = _report("RPT-AAAAAA", BASE[0], BASE[1], "2026-09-01T10:00:00+00:00", "acknowledged", 70, "S4")
    b = _report("RPT-BBBBBB", BASE[0] + 10 * M_LAT, BASE[1], "2026-09-03T10:00:00+00:00", "submitted")
    c = _report("RPT-CCCCCC", BASE[0] + 200 * M_LAT, BASE[1], "2026-09-02T10:00:00+00:00")
    hazards, index = build_hazards([b, c, a])
    assert index["RPT-AAAAAA"] == index["RPT-BBBBBB"] == "HZ-AAAAAA"
    assert index["RPT-CCCCCC"] == "HZ-CCCCCC"
    hz = next(h for h in hazards if h["hazard_id"] == "HZ-AAAAAA")
    assert hz["report_count"] == 2 and hz["status"] == "acknowledged"
    assert hz["worst_level"] == "S4" and hz["image_url"] == "/media/seed/RPT-AAAAAA.jpg"
    assert hz["report_ids"] == ["RPT-AAAAAA", "RPT-BBBBBB"]
    # order of input does not change the id
    hazards2, index2 = build_hazards([a, c, b])
    assert index2 == index


def test_open_duplicate_lookup():
    a = _report("RPT-AAAAAA", BASE[0], BASE[1], "2026-09-01T10:00:00+00:00")
    reports = [a]
    hazards, index = build_hazards(reports)
    dup = find_open_duplicate(BASE[0] + 12 * M_LAT, BASE[1], reports, hazards, index)
    assert dup is not None and dup["hazard_id"] == "HZ-AAAAAA"
    assert find_open_duplicate(BASE[0] + 60 * M_LAT, BASE[1], reports, hazards, index) is None
    a["status"] = "fixed"
    hazards, index = build_hazards(reports)
    assert find_open_duplicate(BASE[0] + 12 * M_LAT, BASE[1], reports, hazards, index) is None


def test_new_report_after_repair_reopens_hazard():
    from hazards import hazard_status

    fixed = {"id": "RPT-A", "timestamp": "2026-09-01T10:00:00+00:00", "status": "fixed", "fix_date": "2026-09-05T10:00:00+00:00"}
    before = {"id": "RPT-B", "timestamp": "2026-09-02T10:00:00+00:00", "status": "submitted"}
    after = {"id": "RPT-C", "timestamp": "2026-09-20T10:00:00+00:00", "status": "submitted"}
    assert hazard_status([fixed]) == "fixed"
    assert hazard_status([fixed, before]) == "fixed"
    assert hazard_status([fixed, after]) == "submitted"
