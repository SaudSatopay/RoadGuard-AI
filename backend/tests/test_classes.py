import pytest

from classes import CLASSES, normalize


@pytest.mark.parametrize("name, code", [
    ("Potholes", "D40"),
    ("pothole", "D40"),
    ("D40", "D40"),
    ("d40", "D40"),
    ("Longitudinal Crack", "D00"),
    ("longitudinal_crack", "D00"),
    ("Transverse Crack", "D10"),
    ("transverse-crack", "D10"),
    ("Alligator Crack", "D20"),
    ("ALLIGATOR_CRACK", "D20"),
])
def test_normalize_aliases(name, code):
    entry = normalize(name)
    assert entry is not None, name
    assert entry["code"] == code


def test_unknown_class_is_none():
    assert normalize("spalling") is None
    assert normalize("water leak") is None
    assert normalize(None) is None


def test_registry_shape():
    assert [c["code"] for c in CLASSES] == ["D00", "D10", "D20", "D40"]
    for c in CLASSES:
        assert {"id", "code", "key", "label", "category", "risk", "repair"} <= set(c)
        assert c["risk"].endswith(".") and c["repair"].endswith(".")
