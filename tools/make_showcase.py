"""
Regenerate the landing-page showcase from the running RoadGuard API.

    python tools/make_showcase.py                 # API at http://127.0.0.1:8000
    python tools/make_showcase.py http://127.0.0.1:8010

Sends each photo in public/showcase/ to POST /detect and writes src/landing/showcase.json with
exactly what the detector returned, so every mark on the landing page is real model output.
Photos are RDD2022 India test-split images (CC BY 4.0) that the detector never trained on.
"""

import json
import sys
import urllib.request
import uuid
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PHOTOS = ROOT / "public" / "showcase"
OUT = ROOT / "src" / "landing" / "showcase.json"
ORDER = ["india-003976.jpg", "india-004459.jpg", "india-008636.jpg", "india-000537.jpg", "india-006316.jpg"]
KEEP = ("id", "code", "class_key", "label", "confidence", "bbox", "bbox_norm", "area_ratio", "geometry",
        "severity", "severity_level", "severity_name", "severity_factors")


def level(score: float) -> str:
    return "S4" if score >= 70 else "S3" if score >= 55 else "S2" if score >= 40 else "S1"


def post_detect(api: str, photo: Path) -> dict:
    boundary = uuid.uuid4().hex
    parts = [
        f"--{boundary}\r\nContent-Disposition: form-data; name=\"road_class\"\r\n\r\narterial\r\n".encode(),
        f"--{boundary}\r\nContent-Disposition: form-data; name=\"confidence\"\r\n\r\n0.3\r\n".encode(),
        f"--{boundary}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"{photo.name}\"\r\n"
        f"Content-Type: image/jpeg\r\n\r\n".encode() + photo.read_bytes() + b"\r\n",
        f"--{boundary}--\r\n".encode(),
    ]
    req = urllib.request.Request(f"{api}/detect", data=b"".join(parts), method="POST",
                                 headers={"Content-Type": f"multipart/form-data; boundary={boundary}"})
    with urllib.request.urlopen(req, timeout=120) as resp:
        return json.loads(resp.read())


def main(api: str) -> None:
    items = []
    for name in ORDER:
        photo = PHOTOS / name
        res = post_detect(api, photo)
        dets = []
        for i, d in enumerate(res["detections"]):
            item = {k: d[k] for k in KEEP if k in d}
            item.setdefault("id", f"d{i + 1}")
            item.setdefault("code", d.get("class_name", ""))
            item.setdefault("label", d.get("display_name", ""))
            item.setdefault("severity_level", level(d.get("severity", 0)))
            item["cost_estimated"] = (d.get("cost") or {}).get("cost_estimated")
            item["repair_method"] = (d.get("cost") or {}).get("repair_method")
            dets.append(item)
        image = res.get("image") or {"width": res.get("image_width"), "height": res.get("image_height")}
        model = res.get("model") or {"name": "legacy YOLOv8s", "runtime": "unknown"}
        items.append({
            "file": name,
            "src": f"/showcase/{name}",
            "source": f"RDD2022 India test split · {name.replace('india-', 'India_').replace('.jpg', '')}",
            "width": image["width"],
            "height": image["height"],
            "road_class": res.get("road_class", "arterial"),
            "model": model.get("name"),
            "runtime": model.get("runtime"),
            "inference_ms": res.get("inference_ms", res.get("inference_time_ms")),
            "summary": res.get("summary"),
            "detections": dets,
        })
        print(f"{name}: {len(dets)} detections, {items[-1]['inference_ms']} ms")
    OUT.write_text(json.dumps({"generated": date.today().isoformat(), "items": items}, indent=1), encoding="utf-8")
    print(f"wrote {OUT}")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8000")
