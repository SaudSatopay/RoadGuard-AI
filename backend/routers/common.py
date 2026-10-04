"""Request helpers shared by the routers."""

from __future__ import annotations

from fastapi import HTTPException, UploadFile
from PIL import Image

from pipeline import BadImageError, load_image
from severity import normalize_road_class

UPLOAD_HINT = "Upload a JPEG or PNG photo of the road."
MAX_UPLOAD_BYTES = 25 * 1024 * 1024


def road_class_or_400(value) -> str:
    try:
        return normalize_road_class(value)
    except ValueError as e:
        raise HTTPException(400, f"{e}. Pick expressway, arterial, collector or local.")


def confidence_or_400(value: float) -> float:
    if value is None or not (0.0 < float(value) < 1.0):
        raise HTTPException(400, "confidence must be between 0 and 1 (for example 0.25).")
    return float(value)


async def read_image_or_400(file: UploadFile) -> tuple[Image.Image, bytes]:
    ctype = (file.content_type or "").lower()
    if ctype and not (ctype.startswith("image/") or ctype == "application/octet-stream"):
        raise HTTPException(400, f"That file is not a photo ({ctype}). {UPLOAD_HINT}")
    data = await file.read()
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(400, f"The photo is larger than 25 MB. {UPLOAD_HINT}")
    try:
        return load_image(data), data
    except BadImageError as e:
        raise HTTPException(400, str(e))


def coords_or_400(lat, lng) -> None:
    if not (-90 <= float(lat) <= 90 and -180 <= float(lng) <= 180):
        raise HTTPException(400, "The location is not valid. Turn on location or pick the spot on the map.")
