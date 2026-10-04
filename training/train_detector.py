"""
Fine-tune a YOLO detector on the prepared RDD2022 dataset (see prepare_rdd2022.py).

    python training/train_detector.py --model yolo26s.pt --epochs 80 --name roadguard_yolo26s
    python training/train_detector.py --model yolo26s.pt --bench          # 1 short epoch to measure speed

Weights land in training/runs/<name>/weights/best.pt. Evaluate them with evaluate.py, then
copy the winner to backend/model/roadguard_det.pt (export.py does that and writes the ONNX file).
"""

import argparse
import time
from pathlib import Path

from ultralytics import YOLO

import _patches  # noqa: F401  (disables pinned memory in Ultralytics dataloaders)

HERE = Path(__file__).parent
DATA = HERE / "data" / "rdd2022_yolo" / "data.yaml"


def lean_yaml() -> Path:
    """Write data_lean.yaml: every training image with damage plus every 4th empty-road image.
    Validation and the held-out test split are unchanged."""
    root = DATA.parent
    keep, background_seen = [], 0
    for img in sorted((root / "images" / "train").iterdir()):
        label = root / "labels" / "train" / (img.stem + ".txt")
        if label.exists() and label.read_text().strip():
            keep.append(img)
        else:
            if background_seen % 4 == 0:
                keep.append(img)
            background_seen += 1
    lst = root / "train_lean.txt"
    lst.write_text("
".join(p.resolve().as_posix() for p in keep))
    yml = root / "data_lean.yaml"
    yml.write_text(DATA.read_text().replace("train: images/train", f"train: {lst.resolve().as_posix()}"))
    print(f"lean training set: {len(keep)} images ({background_seen} empty-road images, 1 in 4 kept)")
    return yml


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", default="yolo26s.pt")
    ap.add_argument("--epochs", type=int, default=80)
    ap.add_argument("--batch", type=int, default=32)
    ap.add_argument("--imgsz", type=int, default=640)
    ap.add_argument("--workers", type=int, default=8)
    ap.add_argument("--name", default=None)
    ap.add_argument("--bench", action="store_true", help="one short epoch on 6%% of the data to time the setup")
    ap.add_argument("--resume", action="store_true")
    ap.add_argument("--lean", action="store_true", help="all damage images + 1 in 4 empty-road images (about 25%% faster per epoch)")
    ap.add_argument("--init", default=None, help="warm-start weights (a new schedule, not a resume)")
    args = ap.parse_args()

    name = args.name or Path(args.model).stem
    weights_dir = HERE / "weights"
    weights_dir.mkdir(exist_ok=True)
    model_path = args.model if Path(args.model).exists() else str(weights_dir / args.model)

    if args.resume:
        YOLO(str(HERE / "runs" / name / "weights" / "last.pt")).train(resume=True)
        return

    model = YOLO(args.init or model_path)
    t0 = time.time()
    model.train(
        data=str(lean_yaml() if args.lean else DATA),
        epochs=1 if args.bench else args.epochs,
        fraction=0.06 if args.bench else 1.0,
        val=not args.bench,
        imgsz=args.imgsz,
        batch=args.batch,
        workers=args.workers,
        project=str(HERE / "runs"),
        name=name + ("_bench" if args.bench else ""),
        exist_ok=True,
        # Road photos: keep geometry honest (no vertical flips, mild rotation) and lean on mosaic for small cracks.
        optimizer="AdamW",
        lr0=0.001,
        cos_lr=True,
        warmup_epochs=1 if args.init else 3,
        close_mosaic=max(2, min(10, args.epochs // 5)),
        mosaic=1.0,
        mixup=0.05,
        degrees=3.0,
        translate=0.1,
        scale=0.5,
        fliplr=0.5,
        flipud=0.0,
        hsv_h=0.015,
        hsv_s=0.6,
        hsv_v=0.4,
        patience=25,
        amp=True,
        cache=False,
        plots=not args.bench,
        seed=42,
        deterministic=False,
        verbose=True,
    )
    dt = time.time() - t0
    if args.bench:
        n = int(24482 * 0.06)
        print(f"BENCH {args.model}: {n} images in {dt:.0f}s incl. setup -> ~{n / dt:.0f} img/s; "
              f"full epoch ~{24482 / (n / dt) / 60:.1f} min")


if __name__ == "__main__":
    main()
