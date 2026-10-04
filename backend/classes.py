"""
Canonical road-defect class registry (RDD2022 codes).

Every model class name, whatever its spelling ('Potholes', 'pothole', 'D40',
'Longitudinal Crack', 'longitudinal_crack', ...), is normalised to one entry of
this registry. All other modules key their tables by `code`.
"""

from __future__ import annotations

import re
from typing import Optional

CLASSES: list[dict] = [
    {
        "id": 0,
        "code": "D00",
        "key": "longitudinal_crack",
        "label": "Longitudinal crack",
        "category": "Crack",
        "risk": "A crack running along the direction of traffic that lets water reach the base layer and widens under repeated wheel loads.",
        "repair": "Clean the crack and seal it with hot-poured bituminous sealant; patch the full depth if the edges have broken away.",
    },
    {
        "id": 1,
        "code": "D10",
        "key": "transverse_crack",
        "label": "Transverse crack",
        "category": "Crack",
        "risk": "A crack across the lane, usually from temperature movement or a weak joint, that lets water in and starts to ravel at the edges.",
        "repair": "Rout and seal the crack; cut out and patch the section if it has opened wider than about 20 mm.",
    },
    {
        "id": 2,
        "code": "D20",
        "key": "alligator_crack",
        "label": "Alligator crack",
        "category": "Crack",
        "risk": "Interconnected fatigue cracking that shows the pavement structure is failing under load and will break out into potholes.",
        "repair": "Remove the cracked area and rebuild it with a full-depth patch, or mill and overlay the stretch if the cracking is widespread.",
    },
    {
        "id": 3,
        "code": "D40",
        "key": "pothole",
        "label": "Pothole",
        "category": "Pothole",
        "risk": "A hole in the surface that damages vehicles, makes two-wheelers swerve and grows quickly with traffic and rain.",
        "repair": "Cut the edges square, clean and tack-coat the hole, then fill and compact it with hot-mix asphalt (cold mix as a temporary fix in rain).",
    },
]

BY_CODE: dict[str, dict] = {c["code"]: c for c in CLASSES}
BY_KEY: dict[str, dict] = {c["key"]: c for c in CLASSES}
CRACK_CODES = frozenset({"D00", "D10", "D20"})


def _squash(name: str) -> str:
    """Lower-case and drop spaces, underscores, hyphens and slashes."""
    return re.sub(r"[\s_\-/]+", "", str(name).strip().lower())


_ALIASES: dict[str, str] = {}
for _c in CLASSES:
    for _alias in (_c["code"], _c["key"], _c["label"]):
        _ALIASES[_squash(_alias)] = _c["code"]
_ALIASES.update({
    _squash("potholes"): "D40",
    _squash("pot hole"): "D40",
    _squash("longitudinal"): "D00",
    _squash("longitudinal cracks"): "D00",
    _squash("transverse"): "D10",
    _squash("transverse cracks"): "D10",
    _squash("alligator"): "D20",
    _squash("alligator cracks"): "D20",
    _squash("fatigue crack"): "D20",
})


def normalize(name) -> Optional[dict]:
    """Return the registry entry for any spelling of a class name, or None."""
    if name is None:
        return None
    if isinstance(name, int):
        return CLASSES[name] if 0 <= name < len(CLASSES) else None
    code = _ALIASES.get(_squash(name))
    return BY_CODE.get(code) if code else None


def code_of(name, default: str = "D00") -> str:
    entry = normalize(name)
    return entry["code"] if entry else default


def public_classes() -> list[dict]:
    return [{"id": c["id"], "code": c["code"], "key": c["key"], "label": c["label"]} for c in CLASSES]
