"""
Ship a trained detector to the backend and publish its measured numbers.

    python training/export.py                       # runs/roadguard_yolo26s_v2/weights/best.pt
    python training/export.py --run roadguard_yolo26s_v2 --skip-eval

Steps
  1. strip optimizer state (89 MB checkpoint -> ~20 MB fp16 weights) -> backend/model/roadguard_det.pt
  2. evaluate RoadGuard and the legacy model on the held-out test split (evaluate.py)
  3. export ONNX for CPU-only machines                                  -> backend/model/roadguard_det.onnx
  4. write backend/model/model_card.json (served by GET /model) and src/landing/facts.json
"""

import argparse
import json
import shutil
import time
from datetime import date
from pathlib import Path

from ultralytics import YOLO
from ultralytics.utils.torch_utils import strip_optimizer

import _patches  # noqa: F401
import evaluate

HERE = Path(__file__).parent
ROOT = HERE.parent
MODEL_DIR = ROOT / "backend" / "model"
RESULTS = HERE / "results"
STATS = HERE / "data" / "rdd2022_yolo" / "stats.json"


def cpu_latency(onnx_path: Path, sample: Path, runs: int = 20) -> float:
    model = YOLO(str(onnx_path), task="detect")
    for _ in range(3):
        model.predict(str(sample), imgsz=640, device="cpu", verbose=False)
    t = time.perf_counter()
    for _ in range(runs):
        model.predict(str(sample), imgsz=640, device="cpu", verbose=False)
    return round((time.perf_counter() - t) / runs * 1000, 1)


def summarize(res: dict, name: str, file: str) -> dict:
    splits = res["splits"]
    return {
        "name": name,
        "file": file,
        "params_m": res["params_m"],
        "latency_ms": res["latency_ms"],
        "test": {k: splits["all"][k] for k in ("map50", "map50_95", "precision", "recall", "f1", "per_class_ap50")},
        "per_country": {c: {k: v for k, v in s.items() if k != "per_class_ap50"} for c, s in splits.items() if c != "all"},
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--run", default="roadguard_yolo26s_v2")
    ap.add_argument("--skip-eval", action="store_true")
    args = ap.parse_args()

    best = HERE / "runs" / args.run / "weights" / "best.pt"
    target = MODEL_DIR / "roadguard_det.pt"
    tmp = HERE / "runs" / args.run / "weights" / "best_stripped.pt"
    shutil.copy2(best, tmp)
    strip_optimizer(str(tmp))
    shutil.copy2(tmp, target)
    print(f"weights -> {target} ({target.stat().st_size / 1e6:.1f} MB)")

    # Evaluate on the GPU before the ONNX export: Ultralytics' CPU export sets CUDA_VISIBLE_DEVICES=-1 for the
    # rest of this process.
    RESULTS.mkdir(exist_ok=True)
    new_json = RESULTS / "eval_roadguard_yolo26s.json"
    old_json = RESULTS / "eval_legacy_yolov8s.json"
    if not args.skip_eval or not new_json.exists():
        new_json.write_text(json.dumps(evaluate.evaluate(str(target), "roadguard_yolo26s"), indent=2))
    if not old_json.exists():
        old_json.write_text(json.dumps(evaluate.evaluate(str(MODEL_DIR / "best.pt"), "legacy_yolov8s"), indent=2))
    new = json.loads(new_json.read_text())
    old = json.loads(old_json.read_text())

    onnx_src = YOLO(str(target)).export(format="onnx", imgsz=640, simplify=True, dynamic=False)
    onnx_target = MODEL_DIR / "roadguard_det.onnx"
    shutil.move(onnx_src, onnx_target)
    print(f"onnx -> {onnx_target} ({onnx_target.stat().st_size / 1e6:.1f} MB)")

    sample =sorted((HERE / "data" / "rdd2022_yolo" / "images" / "test").glob("India_*.jpg"))[0]
    onnx_ms = cpu_latency(onnx_target, sample)
    stats = json.loads(STATS.read_text())["per_split"]
    ckpt = getattr(YOLO(str(best)), "ckpt", None) or {}
    train_args = ckpt.get("train_args", {}) if isinstance(ckpt, dict) else {}

    trained_on = {
        "dataset": "RDD2022 (CRDDC'2022)",
        "license": "CC BY 4.0",
        "countries": ["India", "Japan", "Czech Republic", "United States", "China (motorbike camera)"],
        "train_images": stats["train"]["images"],
        "train_images_used": 18605,
        "val_images": stats["val"]["images"],
        "test_images": stats["test"]["images"],
        "recipe": f"YOLO26s from COCO weights, 3 + {train_args.get('epochs', 25)} epochs at 640 px, AdamW, cosine LR, mosaic; "
                  "all damage photos plus 1 in 4 empty-road photos",
    }
    ours = summarize(new, "RoadGuard YOLO26s", "roadguard_det.pt")
    legacy = summarize(old, "CrackWatch YOLOv8s (legacy)", "best.pt")
    card = {
        "detector_file": "roadguard_det.pt",
        "name": "RoadGuard YOLO26s",
        "trained_on": trained_on,
        "metrics": {"test": ours["test"], "per_country": ours["per_country"]},
        "baseline": {**legacy, "note": "Trained on RDD2022 Japan and India; its Japan and India test scores may include images it trained on."},
        "latency_ms": ours["latency_ms"],
        "cpu_onnx_latency_ms": onnx_ms,
        "evaluated_at": date.today().isoformat(),
    }
    (MODEL_DIR / "model_card.json").write_text(json.dumps(card, indent=2))
    print(f"model card -> {MODEL_DIR / 'model_card.json'}")

    facts_path = ROOT / "src" / "landing" / "facts.json"
    facts = json.loads(facts_path.read_text())
    facts["provisional"] = False
    facts["dataset"]["train_images"] = trained_on["train_images"]
    facts["roadguard"] = {
        "name": "YOLO26s",
        "params_m": ours["params_m"],
        "latency_ms": ours["latency_ms"],
        "cpu_onnx_latency_ms": onnx_ms,
        "test": {k: ours["test"][k] for k in ("map50", "map50_95", "f1")},
        "per_class_ap50": ours["test"]["per_class_ap50"],
        "per_country_map50": {c: v["map50"] for c, v in ours["per_country"].items()},
    }
    facts["legacy"] = {
        "name": "CrackWatch YOLOv8s",
        "params_m": legacy["params_m"],
        "latency_ms": legacy["latency_ms"],
        "test": {k: legacy["test"][k] for k in ("map50", "map50_95", "f1")},
        "per_class_ap50": legacy["test"]["per_class_ap50"],
        "per_country_map50": {c: v["map50"] for c, v in legacy["per_country"].items()},
    }
    facts_path.write_text(json.dumps(facts, indent=2))
    print(f"facts -> {facts_path}")
    print(json.dumps({"roadguard": facts["roadguard"]["test"], "legacy": facts["legacy"]["test"]}, indent=1))


if __name__ == "__main__":
    main()
