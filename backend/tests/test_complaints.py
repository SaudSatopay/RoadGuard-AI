from complaints import generate_complaint, retrieve
from hazards import build_hazards


def test_template_complaint_contains_evidence(seed_reports):
    hazards, index = build_hazards(seed_reports)
    report = next(r for r in seed_reports if r.get("authority", {}).get("short") == "MCGM")
    hazard = next(h for h in hazards if h["hazard_id"] == index[report["id"]])
    letter = generate_complaint(report, hazard, base_url="http://testserver/", mode="template")

    assert letter["generated_by"] == "template"
    assert letter["report_id"] == report["id"]
    assert letter["hazard_id"] == hazard["hazard_id"]
    lat, lng = report["location"]["latitude"], report["location"]["longitude"]
    gps = f"{lat:.5f}, {lng:.5f}"
    assert report["id"] in letter["subject"]
    assert report["id"] in letter["body"]
    assert gps in letter["body"]
    assert letter["to"]["authority"] == "Municipal Corporation of Greater Mumbai"
    assert letter["to"]["authority"] in letter["body"]
    assert "Submitted through RoadGuard AI on behalf of" in letter["body"]
    assert "not a government commitment" in letter["body"]
    assert len(letter["grounding"]) >= 1
    assert all({"id", "title", "source", "snippet"} <= set(g) for g in letter["grounding"])
    assert any(e["label"] == "GPS" and e["value"] == gps for e in letter["evidence"])
    assert "http://testserver/media/seed/" in letter["body"]


def test_expressway_routes_to_msrdc(seed_reports):
    report = next(r for r in seed_reports if r["road_class"] == "expressway")
    letter = generate_complaint(report, None, mode="template")
    assert letter["to"]["authority"].startswith("MSRDC")
    assert any(g["id"] == "kb-msrdc" for g in letter["grounding"])


def test_retrieval_finds_relevant_snippet():
    top = [d["id"] for d, _ in retrieve("RTI reply 30 days action taken")]
    assert top[0] == "kb-rti-30-days"
