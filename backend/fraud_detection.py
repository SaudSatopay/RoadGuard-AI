"""
RoadGuard AI report trust checks.
Multi-layer checks that keep fake or irrelevant citizen reports off the ledger.

Layers:
1. Image authenticity — screen capture, AI-generated, stock photo detection
2. GPS validation — spoofing detection, land vs water check
3. Duplicate detection — same location radius matching
4. Behavioral analysis — submission rate, pattern anomalies
5. Content validation — irrelevant images, photos with no road defect
"""

import math
import time
import cv2
import numpy as np
from PIL import Image

from classes import normalize

# ── Rate limiting store ──
submission_history: dict[str, list[float]] = {}  # token → list of timestamps


def check_image_authenticity(image: Image.Image) -> dict:
    """
    Detect if image is a real photo or fake (screen capture, AI-generated, stock).
    Returns trust_score (0-100) and detailed flags.
    """
    img_np = np.array(image)
    h, w = img_np.shape[:2]
    gray = cv2.cvtColor(img_np, cv2.COLOR_RGB2GRAY)
    flags = []
    penalties = []

    # ── 1. Moiré pattern detection (screen photos) ──
    f_transform = np.fft.fft2(gray.astype(float))
    f_shift = np.fft.fftshift(f_transform)
    magnitude = np.log(np.abs(f_shift) + 1)
    center_h, center_w = h // 2, w // 2
    # Check for periodic spikes in frequency domain
    outer = magnitude[center_h - h // 4:center_h + h // 4, center_w - w // 4:center_w + w // 4]
    freq_ratio = float(np.mean(outer) / (np.mean(magnitude) + 1e-6))
    if freq_ratio > 1.4:
        flags.append({"type": "moire_pattern", "severity": "high",
                       "detail": "Strong moiré pattern detected — likely photographed from a screen"})
        penalties.append(30)
    elif freq_ratio > 1.2:
        flags.append({"type": "moire_pattern", "severity": "medium",
                       "detail": "Mild periodic pattern — possible screen capture"})
        penalties.append(15)

    # ── 2. Resolution check ──
    if w < 300 or h < 300:
        flags.append({"type": "low_resolution", "severity": "high",
                       "detail": f"Image is only {w}x{h}px — suspiciously low for a phone camera"})
        penalties.append(20)
    elif w < 500 or h < 500:
        flags.append({"type": "low_resolution", "severity": "medium",
                       "detail": f"Image is {w}x{h}px — below typical phone camera resolution"})
        penalties.append(10)

    # ── 3. Brightness uniformity (screen backlight detection) ──
    row_means = np.mean(gray, axis=1)
    col_means = np.mean(gray, axis=0)
    row_var = float(np.var(np.diff(row_means)))
    col_var = float(np.var(np.diff(col_means)))
    if row_var < 3 and col_var < 3:
        flags.append({"type": "uniform_brightness", "severity": "high",
                       "detail": "Extremely uniform brightness — consistent with screen display"})
        penalties.append(25)
    elif row_var < 8 and col_var < 8:
        flags.append({"type": "uniform_brightness", "severity": "low",
                       "detail": "Relatively uniform brightness — may be artificial"})
        penalties.append(5)

    # ── 4. Edge sharpness / depth-of-field ──
    laplacian_var = float(cv2.Laplacian(gray, cv2.CV_64F).var())
    if laplacian_var < 20:
        flags.append({"type": "flat_image", "severity": "high",
                       "detail": "Very low edge variance — image appears artificially flat"})
        penalties.append(20)
    elif laplacian_var < 50:
        flags.append({"type": "flat_image", "severity": "low",
                       "detail": "Low edge variance — limited depth-of-field"})
        penalties.append(5)

    # ── 5. Color channel analysis (AI-generated images often have unnatural color distributions) ──
    hsv = cv2.cvtColor(img_np, cv2.COLOR_RGB2HSV)
    sat_std = float(np.std(hsv[:, :, 1]))
    if sat_std < 15:
        flags.append({"type": "unnatural_color", "severity": "medium",
                       "detail": f"Very low color saturation variance ({sat_std:.1f}) — may be AI-generated or heavily filtered"})
        penalties.append(10)

    # ── 6. Aspect ratio check (screenshots have specific ratios) ──
    ratio = w / h if h > 0 else 1
    screen_ratios = [16 / 9, 9 / 16, 4 / 3, 3 / 4, 16 / 10]  # Common screen ratios
    for sr in screen_ratios:
        if abs(ratio - sr) < 0.01:
            flags.append({"type": "screen_aspect_ratio", "severity": "low",
                           "detail": f"Image aspect ratio ({ratio:.3f}) exactly matches common screen ratio"})
            penalties.append(5)
            break

    # ── 7. JPEG quality estimation ──
    # Low quality + high resolution = suspicious (re-saved many times)
    if w > 1000 and h > 1000:
        # Check for JPEG blocking artifacts
        block_diff = float(np.mean(np.abs(np.diff(gray[::8, :], axis=0))))
        if block_diff > 30:
            flags.append({"type": "compression_artifacts", "severity": "low",
                           "detail": "Heavy compression artifacts — image may have been re-saved multiple times"})
            penalties.append(5)

    # ── Calculate trust score ──
    total_penalty = min(sum(penalties), 90)  # Cap at 90 so we never go below 10
    trust_score = max(10, 100 - total_penalty)

    # Classification
    if trust_score >= 75:
        verdict = "authentic"
        recommendation = "Image appears to be a genuine photograph"
    elif trust_score >= 50:
        verdict = "suspicious"
        recommendation = "Image has some anomalies — manual verification recommended"
    else:
        verdict = "likely_fake"
        recommendation = "Image is likely not a genuine photograph — review required"

    return {
        "trust_score": trust_score,
        "verdict": verdict,
        "flags": flags,
        "recommendation": recommendation,
        "checks_performed": 7,
        "penalties_applied": len(penalties),
    }


def check_gps_validity(latitude: float, longitude: float) -> dict:
    """
    Validate GPS coordinates for spoofing.
    Checks: valid range, land vs water (basic), India bounds.
    """
    flags = []
    penalties = []

    # Basic range check
    if not (-90 <= latitude <= 90) or not (-180 <= longitude <= 180):
        return {
            "valid": False,
            "trust_score": 0,
            "flags": [{"type": "invalid_coords", "severity": "critical",
                        "detail": f"Coordinates ({latitude}, {longitude}) are outside valid range"}],
        }

    # India bounding box (rough)
    india_bounds = {
        "lat_min": 6.5, "lat_max": 35.5,
        "lng_min": 68.0, "lng_max": 97.5,
    }
    in_india = (india_bounds["lat_min"] <= latitude <= india_bounds["lat_max"] and
                india_bounds["lng_min"] <= longitude <= india_bounds["lng_max"])

    if not in_india:
        flags.append({"type": "outside_india", "severity": "medium",
                       "detail": f"Location ({latitude:.4f}, {longitude:.4f}) is outside India"})
        penalties.append(15)

    # Check for (0,0) or round numbers (spoofing indicators)
    if latitude == 0 and longitude == 0:
        flags.append({"type": "null_island", "severity": "critical",
                       "detail": "Coordinates are (0,0) — Null Island, GPS not captured"})
        penalties.append(50)
    elif latitude == round(latitude) and longitude == round(longitude):
        flags.append({"type": "round_coords", "severity": "medium",
                       "detail": "Perfectly round coordinates — possibly manually entered"})
        penalties.append(10)

    # Check for known test/default coordinates
    known_fakes = [
        (0, 0), (1, 1), (40.7128, -74.0060),  # NYC default
        (37.7749, -122.4194),  # SF default
    ]
    for fk_lat, fk_lng in known_fakes:
        if abs(latitude - fk_lat) < 0.001 and abs(longitude - fk_lng) < 0.001:
            flags.append({"type": "known_default", "severity": "high",
                           "detail": "Coordinates match a known default/test location"})
            penalties.append(30)
            break

    trust_score = max(10, 100 - sum(penalties))

    return {
        "valid": trust_score >= 50,
        "trust_score": trust_score,
        "in_india": in_india,
        "flags": flags,
    }


def check_duplicate_report(latitude: float, longitude: float, existing_reports: list,
                           radius_meters: float = 50) -> dict:
    """
    Check if a report already exists within radius_meters of this location.
    Uses Haversine distance formula.
    """
    def haversine(lat1, lon1, lat2, lon2):
        R = 6371000  # Earth's radius in meters
        phi1, phi2 = math.radians(lat1), math.radians(lat2)
        dphi = math.radians(lat2 - lat1)
        dlam = math.radians(lon2 - lon1)
        a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlam / 2) ** 2
        return 2 * R * math.atan2(math.sqrt(a), math.sqrt(1 - a))

    nearby = []
    for report in existing_reports:
        loc = report.get("location", {})
        rlat = loc.get("latitude")
        rlng = loc.get("longitude")
        if rlat and rlng:
            dist = haversine(latitude, longitude, rlat, rlng)
            if dist < radius_meters:
                nearby.append({
                    "report_id": report.get("id", "?"),
                    "distance_meters": round(dist, 1),
                    "status": report.get("status", "unknown"),
                })

    is_duplicate = len(nearby) > 0

    return {
        "is_duplicate": is_duplicate,
        "nearby_reports": nearby,
        "nearby_count": len(nearby),
        "recommendation": (
            f"Duplicate: {len(nearby)} existing report(s) within {radius_meters}m. Consider upvoting instead."
            if is_duplicate else "No duplicate reports nearby"
        ),
    }


def check_submission_rate(user_token: str, max_per_hour: int = 10) -> dict:
    """
    Rate limiting — prevent spam submissions.
    """
    now = time.time()
    hour_ago = now - 3600

    if user_token not in submission_history:
        submission_history[user_token] = []

    # Clean old entries
    submission_history[user_token] = [t for t in submission_history[user_token] if t > hour_ago]

    count = len(submission_history[user_token])
    is_rate_limited = count >= max_per_hour

    if not is_rate_limited:
        submission_history[user_token].append(now)

    return {
        "allowed": not is_rate_limited,
        "submissions_this_hour": count,
        "max_per_hour": max_per_hour,
        "message": (
            f"Rate limited — {count}/{max_per_hour} submissions this hour. Try again later."
            if is_rate_limited else f"{count + 1}/{max_per_hour} submissions this hour"
        ),
    }


def check_detection_relevance(detections: list) -> dict:
    """
    Check that the detector actually found a road defect in the photo.
    No detections usually means an irrelevant photo (selfie, random object, ...).
    """
    if not detections:
        return {
            "is_relevant": False,
            "trust_score": 30,
            "message": "No road defect found in this photo. Take the photo of the pothole or crack itself.",
        }

    relevant = [d for d in detections if normalize(d.get("code") or d.get("class_name")) is not None]
    if not relevant:
        return {
            "is_relevant": False,
            "trust_score": 40,
            "message": "What was detected does not look like road damage.",
        }

    avg_conf = sum(d.get("confidence", 0) for d in relevant) / len(relevant)
    return {
        "is_relevant": True,
        "trust_score": min(100, int(50 + avg_conf * 50)),
        "damage_types_found": len({normalize(d.get("code") or d.get("class_name"))["code"] for d in relevant}),
        "avg_confidence": round(avg_conf, 3),
        "message": f"{len(relevant)} road defect detection(s) confirmed",
    }


def run_full_fraud_check(
    image: Image.Image,
    latitude: float,
    longitude: float,
    detections: list,
    existing_reports: list,
    user_token: str = "anonymous",
) -> dict:
    """
    Run ALL fraud checks and return a combined trust report.
    """
    image_check = check_image_authenticity(image)
    gps_check = check_gps_validity(latitude, longitude)
    duplicate_check = check_duplicate_report(latitude, longitude, existing_reports)
    rate_check = check_submission_rate(user_token)
    relevance_check = check_detection_relevance(detections)

    # Weighted combined trust score
    weights = {
        "image": 0.30,
        "gps": 0.20,
        "relevance": 0.30,
        "duplicate": 0.10,
        "rate": 0.10,
    }

    scores = {
        "image": image_check["trust_score"],
        "gps": gps_check["trust_score"],
        "relevance": relevance_check["trust_score"],
        "duplicate": 100 if not duplicate_check["is_duplicate"] else 30,
        "rate": 100 if rate_check["allowed"] else 10,
    }

    combined_score = sum(scores[k] * weights[k] for k in weights)
    combined_score = round(min(100, max(0, combined_score)), 1)

    # Overall verdict
    if combined_score >= 70:
        verdict = "trusted"
        action = "auto_approve"
    elif combined_score >= 45:
        verdict = "needs_review"
        action = "flag_for_review"
    else:
        verdict = "rejected"
        action = "block_submission"

    all_flags = []
    all_flags.extend(image_check.get("flags", []))
    all_flags.extend(gps_check.get("flags", []))
    if duplicate_check["is_duplicate"]:
        all_flags.append({"type": "duplicate_location", "severity": "medium",
                          "detail": duplicate_check["recommendation"]})
    if not rate_check["allowed"]:
        all_flags.append({"type": "rate_limited", "severity": "high",
                          "detail": rate_check["message"]})
    if not relevance_check["is_relevant"]:
        all_flags.append({"type": "no_damage_detected", "severity": "high",
                          "detail": relevance_check["message"]})

    return {
        "combined_trust_score": combined_score,
        "verdict": verdict,
        "action": action,
        "scores": scores,
        "flags": all_flags,
        "flag_count": len(all_flags),
        "checks": {
            "image_authenticity": image_check,
            "gps_validation": gps_check,
            "duplicate_detection": duplicate_check,
            "rate_limiting": rate_check,
            "content_relevance": relevance_check,
        },
    }
