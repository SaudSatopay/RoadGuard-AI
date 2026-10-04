"""
Evaluate road-damage detectors on the held-out RDD2022 test split, overall and per country.

    python training/evaluate.py backend/model/best.pt:legacy_yolov8s training/runs/yolo11s/weights/best.pt:roadguard_yolo11s

Writes one JSON per model to training/results/ and prints a comparison table. Class order must
match the dataset: 0 longitudinal_crack (D00), 1 transverse_crack (D10), 2 alligator_crack (D20), 3 pothole (D40).
"""

import json
import sys
import time
from pathlib import Path

from ultralytics import YOLO

import _patches  # noqa: F401  (disables pinned memory in Ultralytics dataloaders)

DATA = Path(__file__).parent / "data" / "rdd2022_yolo"
RESULTS = Path(__file__).parent / "results"
COUNTRIES = ["India", "Japan", "Czech", "United_States", "China_MotorBike"]
NAMES = ["longitudinal_crack", "transverse_crack", "alligator_crack", "pothole"]


def split_yaml(name: str, images: list[Path]) -> Path:
    lst = DATA / f"test_{name}.txt"
    lst.write_text("\n".join(p.resolve().as_posix() for p in images))
    yml = DATA / f"test_{name}.yaml"
    yml.write_text(
        f"path: {DATA.resolve().as_posix()}\ntrain: {lst.resolve().as_posix()}\nval: {lst.resolve().as_posix()}\n"
        "names:\n" + "".join(f"  {i}: {n}\n" for i, n in enumerate(NAMES))
    )
    return yml


def evaluate(weights: str, tag: str, imgsz: int = 640) -> dict:
    model = YOLO(weights)
    test_images = sorted((DATA / "images" / "test").iterdir())
    groups = {"all": test_images}
    for c in COUNTRIES:
        groups[c] = [p for p in test_images if p.name.startswith(c + "_")]

    out = {"weights": weights, "imgsz": imgsz, "params_m": round(sum(p.numel() for p in model.model.parameters()) / 1e6, 2), "splits": {}}
    for name, imgs in groups.items():
        if not imgs:
            continue
        m = model.val(data=str(split_yaml(name, imgs)), split="val", imgsz=imgsz, batch=32, conf=0.001, iou=0.6,
                      plots=name == "all", verbose=False, project=str(RESULTS / "val_runs"), name=f"{tag}_{name}", exist_ok=True)
        p, r = float(m.box.mp), float(m.box.mr)
        out["splits"][name] = {
            "images": len(imgs),
            "map50": round(float(m.box.map50), 4),
            "map50_95": round(float(m.box.map), 4),
            "precision": round(p, 4),
            "recall": round(r, 4),
            "f1": round(2 * p * r / (p + r + 1e-9), 4),
            "per_class_ap50": {NAMES[int(c)]: round(float(ap), 4) for c, ap in zip(m.box.ap_class_index, m.box.ap50)},
        }
        print(f"{tag:>20} {name:>16}: mAP50 {m.box.map50:.3f}  mAP50-95 {m.box.map:.3f}  P {p:.3f}  R {r:.3f}")

    # Latency on the GPU (or CPU), single image, after warm-up
    sample = str(test_images[0])
    for _ in range(5):
        model.predict(sample, imgsz=imgsz, verbose=False)
    t = time.perf_counter()
    for _ in range(30):
        model.predict(sample, imgsz=imgsz, verbose=False)
    out["latency_ms"] = round((time.perf_counter() - t) / 30 * 1000, 1)
    return out


def main(weights_list: list[str]):
    RESULTS.mkdir(exist_ok=True)
    results = []
    for arg in weights_list:
        w, _, tag = arg.partition(":") if not arg[1:3] == ":\\" else (arg, "", "")
        tag = tag or Path(w).stem
        res = evaluate(w, tag)
        (RESULTS / f"eval_{tag}.json").write_text(json.dumps(res, indent=2))
        results.append((tag, res))
    print("\nmodel                      split            mAP50   mAP50-95  F1")
    for tag, res in results:
        for name, s in res["splits"].items():
            print(f"{tag:26s} {name:16s} {s['map50']:.3f}   {s['map50_95']:.3f}    {s['f1']:.3f}")
        print(f"{tag:26s} latency {res['latency_ms']} ms, params {res['params_m']} M")


if __name__ == "__main__":
    main(sys.argv[1:] or ["backend/model/best.pt:legacy_yolov8s"])
