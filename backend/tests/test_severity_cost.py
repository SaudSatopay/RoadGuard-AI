import pytest

from cost_engine import REPAIR_COSTS, estimate_cost, rank_priorities
from severity import compute_severity, level_for, normalize_road_class, summarize

W, H = 1000, 800


def _det(code, conf=0.8, bbox=(100, 100, 300, 260)):
    return {"code": code, "class_name": code, "label": code, "confidence": conf, "bbox": list(bbox)}


def test_pothole_priced_from_pothole_table():
    scored = compute_severity([_det("D40")], W, H, "arterial")[0]
    cost = estimate_cost(scored)
    tier = {"S1": "minor", "S2": "warning", "S3": "warning", "S4": "critical"}[scored["severity_level"]]
    row = REPAIR_COSTS["D40"][tier]
    assert (cost["cost_min"], cost["cost_max"], cost["repair_method"]) == (row["min"], row["max"], row["method"])
    # and not priced as a longitudinal crack
    assert cost["repair_method"] != REPAIR_COSTS["D00"][tier]["method"]
    assert cost["currency"] == "INR" and cost["basis"]


def test_display_name_pothole_also_priced_as_pothole():
    det = {"class_name": "Potholes", "confidence": 0.9, "bbox": [0, 0, 200, 200]}
    scored = compute_severity([det], W, H)[0]
    assert scored["severity_factors"][0]["value"] == 1.0  # type value for D40
    assert estimate_cost(scored)["cost_max"] in {r["max"] for r in REPAIR_COSTS["D40"].values()}


def test_severity_rises_with_road_class():
    scores = [compute_severity([_det("D20")], W, H, rc)[0]["severity"]
              for rc in ("local", "collector", "arterial", "expressway")]
    assert scores == sorted(scores) and len(set(scores)) == 4


def test_severity_formula_components():
    d = compute_severity([_det("D40", conf=0.5, bbox=(0, 0, 400, 240))], W, H, "expressway")[0]
    # area 12% -> extent 1.0; one detection -> density 1/6
    expected = 100 * (0.35 * 1.0 + 0.25 * 1.0 + 0.20 * 1.0 + 0.10 * 0.5 + 0.10 / 6)
    assert d["severity"] == pytest.approx(expected, abs=0.1)
    assert [f["key"] for f in d["severity_factors"]] == ["type", "extent", "road_class", "confidence", "density"]
    assert sum(f["points"] for f in d["severity_factors"]) == pytest.approx(d["severity"], abs=0.3)


def test_crack_extent_uses_geometry_length():
    det = _det("D00")
    det["geometry"] = {"length_px": 768, "length_m": 2.8}  # 0.6 x diagonal(1000x800) ~ 768
    d = compute_severity([det], W, H)[0]
    extent = next(f for f in d["severity_factors"] if f["key"] == "extent")
    assert extent["value"] == pytest.approx(1.0, abs=0.01)


@pytest.mark.parametrize("score, level", [(10, "S1"), (39.9, "S1"), (40, "S2"), (54.9, "S2"),
                                          (55, "S3"), (69.9, "S3"), (70, "S4"), (100, "S4")])
def test_levels(score, level):
    assert level_for(score) == level


def test_level_labels_and_names():
    from severity import LEVELS
    assert {k: v["label"] for k, v in LEVELS.items()} == {
        "S1": "minor", "S2": "warning", "S3": "warning", "S4": "critical"}
    assert {k: v["name"] for k, v in LEVELS.items()} == {
        "S1": "Minor", "S2": "Moderate", "S3": "Severe", "S4": "Critical"}


def test_invalid_road_class():
    with pytest.raises(ValueError):
        normalize_road_class("highway-ish")
    assert normalize_road_class(None) == "arterial"


def test_summarize():
    assert summarize([])["road_condition_index"] == 100
    ranked = rank_priorities(compute_severity([_det("D40"), _det("D00", conf=0.4)], W, H))
    s = summarize(ranked)
    assert s["total"] == 2 and sum(s["by_level"].values()) == 2
    assert s["road_condition_index"] == pytest.approx(
        max(0, 100 - (0.6 * s["max_severity"] + 0.4 * s["avg_severity"])), abs=0.11)
    assert s["total_cost"] == sum(d["cost"]["cost_estimated"] for d in ranked)
    assert ranked[0]["priority_rank"] == 1
