"""
Crack geometry from a binary segmentation mask.

`crack_geometry` measures one crack detection: how much of its box is crack
pixels, how long the crack is (skeleton length) and how wide it is on average.
Pure NumPy/OpenCV so it can be unit-tested without loading any model.
"""

from __future__ import annotations


import cv2
import numpy as np

LANE_WIDTH_M = 3.6
LENGTH_BASIS = "≈ assumes the photo spans one 3.6 m lane"
_KULPA_ORTH = 0.948
_KULPA_DIAG = 1.343


def _zhang_suen(binary: np.ndarray) -> np.ndarray:
    """Vectorised Zhang-Suen thinning. Input and output are 0/1 uint8 arrays."""
    img = np.pad((binary > 0).astype(np.uint8), 1)
    while True:
        changed = False
        for step in (0, 1):
            p2 = img[:-2, 1:-1]
            p3 = img[:-2, 2:]
            p4 = img[1:-1, 2:]
            p5 = img[2:, 2:]
            p6 = img[2:, 1:-1]
            p7 = img[2:, :-2]
            p8 = img[1:-1, :-2]
            p9 = img[:-2, :-2]
            centre = img[1:-1, 1:-1]
            neighbours = (p2.astype(np.int16) + p3 + p4 + p5 + p6 + p7 + p8 + p9)
            ring = (p2, p3, p4, p5, p6, p7, p8, p9, p2)
            transitions = np.zeros_like(neighbours)
            for a, b in zip(ring[:-1], ring[1:]):
                transitions += ((a == 0) & (b == 1))
            if step == 0:
                cond = ((p2 * p4 * p6) == 0) & ((p4 * p6 * p8) == 0)
            else:
                cond = ((p2 * p4 * p8) == 0) & ((p2 * p6 * p8) == 0)
            remove = (centre == 1) & (neighbours >= 2) & (neighbours <= 6) & (transitions == 1) & cond
            if remove.any():
                centre[remove] = 0
                changed = True
        if not changed:
            break
    return img[1:-1, 1:-1]


def _prune_staircase(skel: np.ndarray) -> np.ndarray:
    """Remove redundant pixels so the skeleton is minimally 8-connected.

    Thinning can leave 4-connected "staircase" corners, which add a detour of
    2 px where the crack really moves sqrt(2) px. A pixel is removed when it
    has at least two neighbours (so line ends survive) and its Yokoi
    8-connectivity number is 1, meaning its neighbours stay connected without
    it. Pixels of one (row, column) parity class are never 8-adjacent, so each
    class can be removed simultaneously without breaking the line.
    """
    s = np.pad((skel > 0).astype(np.uint8), 1)
    h, w = s.shape
    rows, cols = np.mgrid[0:h - 2, 0:w - 2]
    parity = [(rows % 2 == py) & (cols % 2 == px) for py in (0, 1) for px in (0, 1)]
    while True:
        changed = False
        for cls in parity:
            # x1=E, x2=NE, x3=N, x4=NW, x5=W, x6=SW, x7=S, x8=SE
            x = [
                s[1:-1, 2:], s[:-2, 2:], s[:-2, 1:-1], s[:-2, :-2],
                s[1:-1, :-2], s[2:, :-2], s[2:, 1:-1], s[2:, 2:],
            ]
            inv = [1 - v.astype(np.int16) for v in x]
            inv.append(inv[0])
            inv.append(inv[1])
            n8 = np.zeros(x[0].shape, dtype=np.int16)
            for k in (0, 2, 4, 6):
                n8 += inv[k] - inv[k] * inv[k + 1] * inv[k + 2]
            neighbours = sum(v.astype(np.int16) for v in x)
            centre = s[1:-1, 1:-1]
            remove = (centre == 1) & (n8 == 1) & (neighbours >= 2) & cls
            if remove.any():
                centre[remove] = 0
                changed = True
        if not changed:
            break
    return s[1:-1, 1:-1]


def skeletonize(binary: np.ndarray) -> np.ndarray:
    """One-pixel-wide skeleton of a binary mask (0/1 uint8)."""
    mask = (binary > 0).astype(np.uint8)
    if mask.sum() == 0:
        return mask
    ximgproc = getattr(cv2, "ximgproc", None)
    if ximgproc is not None and hasattr(ximgproc, "thinning"):
        skel = (ximgproc.thinning(mask * 255) > 0).astype(np.uint8)
    else:
        skel = _zhang_suen(mask)
    return _prune_staircase(skel)


def skeleton_length(skel: np.ndarray) -> float:
    """Length in pixels of an 8-connected skeleton.

    Counts orthogonal and diagonal links between skeleton pixels and weights
    them with Kulpa's chain-code coefficients (0.948 and 1.343), which remove
    the orientation bias of the naive 1 / sqrt(2) weighting (error under ~5%
    at any angle). A diagonal link is only counted when the two pixels are not
    already joined through an orthogonal neighbour.
    """
    s = skel > 0
    if not s.any():
        return 0.0
    n_orth = int((s[:, :-1] & s[:, 1:]).sum() + (s[:-1, :] & s[1:, :]).sum())
    d1 = s[:-1, :-1] & s[1:, 1:] & ~s[:-1, 1:] & ~s[1:, :-1]
    d2 = s[:-1, 1:] & s[1:, :-1] & ~s[:-1, :-1] & ~s[1:, 1:]
    n_diag = int(d1.sum() + d2.sum())
    length = _KULPA_ORTH * n_orth + _KULPA_DIAG * n_diag
    # An isolated pixel still has a length of one pixel.
    return max(length, 1.0)


def crack_geometry(mask_crop: np.ndarray, image_width: int) -> dict:
    """Geometry of the crack pixels inside one detection box.

    mask_crop: binary mask cropped to the detection box (any dtype, >0 = crack).
    image_width: width of the full photo in pixels (for the metre estimate).
    """
    mask = (np.asarray(mask_crop) > 0).astype(np.uint8)
    box_px = int(mask.shape[0] * mask.shape[1]) if mask.ndim == 2 else 0
    crack_px = int(mask.sum())
    if box_px == 0 or crack_px == 0:
        return {
            "mask_coverage_pct": 0.0,
            "length_px": 0,
            "mean_width_px": 0.0,
            "length_m": 0.0,
            "length_basis": LENGTH_BASIS,
        }
    length_px = skeleton_length(skeletonize(mask))
    width_px = crack_px / length_px if length_px > 0 else 0.0
    metres_per_px = LANE_WIDTH_M / float(image_width) if image_width else 0.0
    return {
        "mask_coverage_pct": round(crack_px / box_px * 100.0, 1),
        "length_px": int(round(length_px)),
        "mean_width_px": round(width_px, 1),
        "length_m": round(length_px * metres_per_px, 1),
        "length_basis": LENGTH_BASIS,
    }
