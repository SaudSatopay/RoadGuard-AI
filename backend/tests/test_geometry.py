import math

import cv2
import numpy as np
import pytest

from geometry import LENGTH_BASIS, crack_geometry


@pytest.mark.parametrize("p0, p1, thickness", [
    ((20, 30), (380, 290), 5),    # diagonal, ~36 degrees
    ((10, 10), (300, 300), 3),    # 45 degrees
    ((15, 200), (390, 120), 7),   # shallow
])
def test_diagonal_crack_length_within_10pct(p0, p1, thickness):
    mask = np.zeros((320, 400), np.uint8)
    cv2.line(mask, p0, p1, 255, thickness)
    true_len = math.dist(p0, p1)
    g = crack_geometry(mask, image_width=1200)
    assert abs(g["length_px"] - true_len) / true_len < 0.10
    true_width = (mask > 0).sum() / true_len  # OpenCV draws slightly wider than `thickness`
    assert g["mean_width_px"] == pytest.approx(true_width, rel=0.15)
    assert g["length_m"] == round(g["length_px"] * 3.6 / 1200, 1)
    assert g["length_basis"] == LENGTH_BASIS
    coverage = (mask > 0).sum() / mask.size * 100
    assert g["mask_coverage_pct"] == pytest.approx(coverage, abs=0.1)


def test_empty_mask():
    g = crack_geometry(np.zeros((50, 50), np.uint8), image_width=640)
    assert g["length_px"] == 0 and g["mask_coverage_pct"] == 0.0
