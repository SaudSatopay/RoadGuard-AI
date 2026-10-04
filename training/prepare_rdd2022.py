"""
Convert the downloaded RDD2022 country zips (Pascal VOC) into one YOLO dataset.

    python training/prepare_rdd2022.py

Keeps the four CRDDC'2022 classes and drops the rest (D43, D44, D50, Repair, ...):
    0 longitudinal_crack (D00)   1 transverse_crack (D10)   2 alligator_crack (D20)   3 pothole (D40)

Only the labelled `train` folders are used (the official `test` folders have no labels).
They are split per country into train / val / test (88 / 6 / 6) with a fixed seed, so the
held-out test split is never seen during training or model selection.
"""

import json
import random
import shutil
import xml.etree.ElementTree as ET
import zipfile
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).parent / "data"
RAW = ROOT / "raw"
OUT = ROOT / "rdd2022_yolo"
CLASSES = {"D00": 0, "D10": 1, "D20": 2, "D40": 3}
NAMES = ["longitudinal_crack", "transverse_crack", "alligator_crack", "pothole"]
SPLIT = (0.88, 0.06, 0.06)
SEED = 42


def parse_voc(xml_bytes: bytes):
    root = ET.fromstring(xml_bytes)
    size = root.find("size")
    w = float(size.findtext("width") or 0)
    h = float(size.findtext("height") or 0)
    boxes = []
    for obj in root.iter("object"):
        cls = (obj.findtext("name") or "").strip()
        if cls not in CLASSES:
            continue
        bb = obj.find("bndbox")
        x1, y1, x2, y2 = (float(bb.findtext(k)) for k in ("xmin", "ymin", "xmax", "ymax"))
        boxes.append((CLASSES[cls], x1, y1, x2, y2))
    return w, h, boxes


def to_yolo(w, h, boxes):
    lines = []
    for cls, x1, y1, x2, y2 in boxes:
        x1, x2 = max(0.0, min(x1, x2)), min(w, max(x1, x2))
        y1, y2 = max(0.0, min(y1, y2)), min(h, max(y1, y2))
        bw, bh = x2 - x1, y2 - y1
        if bw < 2 or bh < 2:
            continue
        lines.append(f"{cls} {(x1 + bw / 2) / w:.6f} {(y1 + bh / 2) / h:.6f} {bw / w:.6f} {bh / h:.6f}")
    return lines


def main():
    if OUT.exists():
        shutil.rmtree(OUT)
    for split in ("train", "val", "test"):
        (OUT / "images" / split).mkdir(parents=True)
        (OUT / "labels" / split).mkdir(parents=True)

    rng = random.Random(SEED)
    stats = defaultdict(Counter)
    for zpath in sorted(RAW.glob("*.zip")):
        country = zpath.stem
        with zipfile.ZipFile(zpath) as zf:
            names = zf.namelist()
            xmls = {Path(n).stem: n for n in names if "/train/annotations/xmls/" in n and n.endswith(".xml")}
            images = {Path(n).stem: n for n in names if "/train/images/" in n and n.lower().endswith((".jpg", ".jpeg", ".png"))}
            stems = sorted(set(xmls) & set(images))
            rng.shuffle(stems)
            n_train = int(len(stems) * SPLIT[0])
            n_val = int(len(stems) * SPLIT[1])
            for i, stem in enumerate(stems):
                split = "train" if i < n_train else "val" if i < n_train + n_val else "test"
                w, h, boxes = parse_voc(zf.read(xmls[stem]))
                if not w or not h:
                    continue
                lines = to_yolo(w, h, boxes)
                ext = Path(images[stem]).suffix.lower()
                (OUT / "images" / split / f"{stem}{ext}").write_bytes(zf.read(images[stem]))
                (OUT / "labels" / split / f"{stem}.txt").write_text("\n".join(lines))
                s = stats[f"{country}/{split}"]
                s["images"] += 1
                s["background"] += 0 if lines else 1
                for line in lines:
                    s[NAMES[int(line.split()[0])]] += 1
        print(f"{country}: {len(stems)} labelled images")

    (OUT / "data.yaml").write_text(
        f"path: {OUT.resolve().as_posix()}\ntrain: images/train\nval: images/val\ntest: images/test\n"
        f"names:\n" + "".join(f"  {i}: {n}\n" for i, n in enumerate(NAMES))
    )
    totals = defaultdict(Counter)
    for key, c in stats.items():
        totals[key.split("/")[1]].update(c)
    report = {"per_country_split": {k: dict(v) for k, v in sorted(stats.items())}, "per_split": {k: dict(v) for k, v in totals.items()}}
    (OUT / "stats.json").write_text(json.dumps(report, indent=2))
    for split, c in totals.items():
        print(split, dict(c))


if __name__ == "__main__":
    main()
