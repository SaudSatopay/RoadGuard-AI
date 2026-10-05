"""
Model loading and inference for RoadGuard AI.

- Detector: `roadguard_det.pt` when present, else the legacy `best.pt`.
  On CPU, `roadguard_det.onnx` is preferred (Ultralytics + onnxruntime).
- Segmenter: `crack_seg.pt`, run once per photo and only when a crack class
  (D00/D10/D20) was detected; its mask measures crack geometry.
- Device: env ROADGUARD_DEVICE = auto | cuda | cpu (default auto).

No external inference API is used. If no local detector exists the backend
refuses to start with a clear message.
"""

from __future__ import annotations

import json
import re
import threading
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont

import config
from classes import CRACK_CODES, normalize, public_classes
from config import log
from geometry import crack_geometry


SEG_CONFIDENCE = 0.05


class ModelNotFoundError(RuntimeError):
    pass


# ---------------------------------------------------------------- helpers

_SCALE_BY_MULTIPLES = {
    (0.33, 0.25): "n", (0.33, 0.5): "s", (0.67, 0.75): "m", (1.0, 1.0): "l", (1.0, 1.25): "x",
    (0.5, 0.25): "n", (0.5, 0.5): "s", (0.5, 1.0): "m",
}


def _format_family(raw: str) -> str:
    raw = raw.lower()
    m = re.match(r"yolov(\d+)", raw)
    if m:
        return f"YOLOv{m.group(1)}"
    m = re.match(r"yolo(\d+)", raw)
    return f"YOLO{m.group(1)}" if m else raw.upper()


def architecture_from_checkpoint(ckpt: dict | None, model=None) -> str | None:
    """Best-effort architecture name such as 'YOLOv8s' or 'YOLO26s-seg'."""
    ckpt = ckpt or {}
    yaml = {}
    if model is not None:
        yaml = getattr(model, "yaml", None) or {}
    candidates = [yaml.get("yaml_file"), (ckpt.get("train_args") or {}).get("model")]
    for cand in candidates:
        if not cand:
            continue
        for part in reversed(Path(str(cand)).as_posix().lower().split("/")):
            m = re.search(r"(yolov?\d+)([nslmx])?[a-z]*(-seg)?", part)
            if m:
                return f"{_format_family(m.group(1))}{m.group(2) or ''}{m.group(3) or ''}"
    dm, wm = yaml.get("depth_multiple"), yaml.get("width_multiple")
    if dm is not None and wm is not None:
        scale = _SCALE_BY_MULTIPLES.get((round(float(dm), 2), round(float(wm), 2)), "")
        return f"YOLO{scale}" if scale else "YOLO"
    return None


def _resolve_device(pref: str) -> str:
    try:
        import torch
        has_cuda = torch.cuda.is_available()
    except Exception:  # pragma: no cover - torch missing
        has_cuda = False
    if pref == "cpu":
        return "cpu"
    if pref == "cuda" and not has_cuda:
        log("ROADGUARD_DEVICE=cuda but no CUDA device is available; using CPU.")
        return "cpu"
    return "cuda:0" if has_cuda else "cpu"


def _runtime_string(device: str, runtime: str) -> str:
    if runtime == "onnxruntime":
        try:
            import onnxruntime
            return f"cpu · onnxruntime {onnxruntime.__version__}"
        except Exception:
            return "cpu · onnxruntime"
    import torch
    ver = torch.__version__.split("+")[0]
    ver = ".".join(ver.split(".")[:2])
    return f"{device} · torch {ver}"


def _load_ckpt(path: Path) -> dict | None:
    try:
        import torch
        return torch.load(str(path), map_location="cpu", weights_only=False)
    except Exception as e:  # pragma: no cover
        log(f"Could not read checkpoint metadata from {path.name}: {e}")
        return None


def _params_m(model) -> float | None:
    try:
        return round(sum(p.numel() for p in model.parameters()) / 1e6, 1)
    except Exception:
        return None


# ---------------------------------------------------------------- detector

class RoadDetector:
    def __init__(self, model_dir: Path | None = None, device_pref: str | None = None):
        from ultralytics import YOLO

        self.model_dir = Path(model_dir or config.MODEL_DIR)
        self.device = _resolve_device((device_pref or config.DEVICE_PREF).lower())
        self._lock = threading.Lock()

        pt_new = self.model_dir / config.DETECTOR_PT
        onnx_new = self.model_dir / config.DETECTOR_ONNX
        pt_legacy = self.model_dir / config.LEGACY_DETECTOR_PT

        if self.device == "cpu" and onnx_new.exists():
            det_path, self.runtime = onnx_new, "onnxruntime"
        elif pt_new.exists():
            det_path, self.runtime = pt_new, "torch"
        elif pt_legacy.exists():
            det_path, self.runtime = pt_legacy, "torch"
        else:
            raise ModelNotFoundError(
                f"No road-damage detector found in {self.model_dir}. Put "
                f"'{config.DETECTOR_PT}' (or '{config.DETECTOR_ONNX}') or the legacy "
                f"'{config.LEGACY_DETECTOR_PT}' there and restart. RoadGuard does not "
                f"call any external inference service."
            )

        self.det_path = det_path
        log(f"Loading detector {det_path.name} on {self.device} ({self.runtime})")
        self.model = YOLO(str(det_path), task="detect")

        # Metadata comes from the .pt checkpoint (also when running the ONNX twin).
        meta_pt = pt_new if det_path.name.startswith("roadguard_det") and pt_new.exists() else (
            det_path if det_path.suffix == ".pt" else None)
        ckpt = _load_ckpt(meta_pt) if meta_pt else None
        torch_model = getattr(self.model, "model", None) if self.runtime == "torch" else None
        if ckpt is not None and torch_model is None:
            torch_model = ckpt.get("model") or ckpt.get("ema")
        self.architecture = architecture_from_checkpoint(ckpt, torch_model) or "YOLO"
        self.params_m = _params_m(torch_model) if torch_model is not None else None
        train_args = (ckpt or {}).get("train_args") or {}
        self.imgsz = int(train_args.get("imgsz") or self._onnx_imgsz() or 640)

        names = self.model.names or {}
        self.class_map: dict[int, dict] = {}
        for idx, name in (names.items() if isinstance(names, dict) else enumerate(names)):
            entry = normalize(name)
            if entry is None:
                log(f"WARNING: model class {idx} '{name}' is not a known road-defect class; it will be ignored.")
                continue
            self.class_map[int(idx)] = entry
        log(f"Detector classes: {[(k, v['code']) for k, v in self.class_map.items()]}")
        if not self.class_map:
            raise ModelNotFoundError(f"{det_path.name} has no recognisable road-defect classes: {names}")

        seg_path = self.model_dir / config.SEGMENTER_PT
        self.seg = None
        self.seg_path = seg_path
        self.seg_metrics = {"mask_map50": 0.634, "box_map50": 0.788}
        self.seg_architecture = "YOLOv8s-seg"
        if seg_path.exists():
            log(f"Loading crack segmenter {seg_path.name}")
            self.seg = YOLO(str(seg_path), task="segment")
            seg_ckpt = getattr(self.seg, "ckpt", None) or {}
            tm = seg_ckpt.get("train_metrics") or {}
            if "metrics/mAP50(M)" in tm:
                self.seg_metrics = {
                    "mask_map50": round(float(tm["metrics/mAP50(M)"]), 3),
                    "box_map50": round(float(tm.get("metrics/mAP50(B)", 0.0)), 3),
                }
            self.seg_architecture = architecture_from_checkpoint(seg_ckpt, getattr(self.seg, "model", None)) or "YOLO-seg"
        else:
            log("Crack segmenter not found; crack geometry will be unavailable.")
        self.runtime_string = _runtime_string(self.device, self.runtime)

    def _onnx_imgsz(self) -> int | None:
        if self.det_path.suffix != ".onnx":
            return None
        try:
            import onnxruntime
            sess = onnxruntime.InferenceSession(str(self.det_path), providers=["CPUExecutionProvider"])
            meta = sess.get_modelmeta().custom_metadata_map
            imgsz = json.loads(meta.get("imgsz", "null").replace("'", '"'))
            return int(imgsz[0] if isinstance(imgsz, list) else imgsz)
        except Exception:
            return None

    # -- inference -------------------------------------------------------

    def warmup(self) -> None:
        dummy = np.full((self.imgsz, self.imgsz, 3), 114, dtype=np.uint8)
        with self._lock:
            self.model.predict(dummy, imgsz=self.imgsz, device=self.device, verbose=False)
            if self.seg is not None:
                self.seg.predict(dummy, imgsz=640, device=self.device, verbose=False)
        log("Models warmed up.")

    def detect(self, rgb: np.ndarray, confidence: float = 0.25, tta: bool = False) -> list[dict]:
        """Raw detections: bbox in pixels, confidence, registry entry."""
        bgr = cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)
        kwargs = dict(conf=float(confidence), imgsz=self.imgsz, device=self.device, verbose=False)
        if tta and self.runtime == "torch":
            kwargs["augment"] = True
        with self._lock:
            result = self.model.predict(bgr, **kwargs)[0]
        out = []
        boxes = result.boxes
        if boxes is None:
            return out
        xyxy = boxes.xyxy.cpu().numpy()
        confs = boxes.conf.cpu().numpy()
        clss = boxes.cls.cpu().numpy().astype(int)
        for (x1, y1, x2, y2), conf, cls in zip(xyxy, confs, clss):
            entry = self.class_map.get(int(cls))
            if entry is None:
                continue
            out.append({"bbox": [float(x1), float(y1), float(x2), float(y2)],
                        "confidence": float(conf), "entry": entry})
        return out

    def crack_mask(self, rgb: np.ndarray) -> np.ndarray | None:
        """Union of all crack masks at full image resolution, or None."""
        if self.seg is None:
            return None
        h, w = rgb.shape[:2]
        bgr = cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)
        with self._lock:
            # The segmenter was trained on close-up crack photos; on street-level
            # photos it is under-confident, so a low threshold is used. Its mask
            # is only read inside boxes the detector already labelled as cracks.
            result = self.seg.predict(bgr, conf=SEG_CONFIDENCE, imgsz=640, device=self.device,
                                      retina_masks=True, max_det=50, verbose=False)[0]
        if result.masks is None or len(result.masks) == 0:
            return np.zeros((h, w), dtype=np.uint8)
        data = result.masks.data
        union = (data > 0.5).any(dim=0).cpu().numpy().astype(np.uint8)
        if union.shape != (h, w):
            union = cv2.resize(union, (w, h), interpolation=cv2.INTER_NEAREST)
        return union

    def geometry_for(self, detections: list[dict], rgb: np.ndarray) -> None:
        """Attach `geometry` to crack detections (in place).

        Potholes get None, and so does a crack whose box holds no segmented crack pixels.
        """
        for d in detections:
            d["geometry"] = None
        cracks = [d for d in detections if d["entry"]["code"] in CRACK_CODES]
        if not cracks:
            return
        mask = self.crack_mask(rgb)
        if mask is None:
            return
        h, w = mask.shape
        for d in cracks:
            x1, y1, x2, y2 = d["bbox"]
            xa, ya = max(0, int(np.floor(x1))), max(0, int(np.floor(y1)))
            xb, yb = min(w, int(np.ceil(x2))), min(h, int(np.ceil(y2)))
            if xb <= xa or yb <= ya:
                continue
            crop = mask[ya:yb, xa:xb]
            # No crack pixels inside the box: the crack could not be measured.
            d["geometry"] = crack_geometry(crop, w) if crop.any() else None

    # -- description -----------------------------------------------------

    def model_info(self) -> dict:
        is_new = self.det_path.name.startswith("roadguard_det")
        return {
            "name": "RoadGuard road-damage detector" if is_new else "Legacy RDD road-damage detector",
            "file": self.det_path.name,
            "architecture": self.architecture,
            "params_m": self.params_m,
            "imgsz": self.imgsz,
            "runtime": self.runtime_string,
            "classes": public_classes(),
        }

    def segmenter_info(self) -> dict:
        return {
            "name": "Crack segmenter",
            "file": self.seg_path.name if self.seg is not None else None,
            "architecture": self.seg_architecture,
            "use": "Runs only when a crack is detected; its mask gives crack coverage, length and mean width.",
            "metrics": self.seg_metrics,
        }


# ---------------------------------------------------------------- annotation

YELLOW = (0xF2, 0xC2, 0x30)   # road-marking yellow, S1-S3
RED = (0xD9, 0x41, 0x2B)      # signal red, S4


def _font(size: int):
    for name in ("arialbd.ttf", "arial.ttf", "DejaVuSans-Bold.ttf", "DejaVuSans.ttf"):
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            continue
    return ImageFont.load_default()


def annotate(image: Image.Image, detections: list[dict]) -> Image.Image:
    """Draw boxes and labels: yellow for S1-S3, red for S4, black label text."""
    img = image.convert("RGB").copy()
    draw = ImageDraw.Draw(img)
    w = img.width
    line = 3 if w >= 640 else 2
    font = _font(max(13, int(w / 55)))
    for d in sorted(detections, key=lambda x: x.get("severity", 0)):
        x1, y1, x2, y2 = d["bbox"]
        color = RED if d.get("severity_level") == "S4" else YELLOW
        draw.rectangle([x1, y1, x2, y2], outline=color, width=line)
        label = f"{d.get('label', 'Defect')} {d.get('confidence', 0) * 100:.0f}%"
        if d.get("severity_level"):
            label += f" · {d['severity_level']}"
        tb = draw.textbbox((0, 0), label, font=font)
        tw, th = tb[2] - tb[0], tb[3] - tb[1]
        pad = 4
        ty = y1 - th - 2 * pad if y1 - th - 2 * pad >= 0 else y1
        draw.rectangle([x1, ty, x1 + tw + 2 * pad, ty + th + 2 * pad], fill=color)
        draw.text((x1 + pad, ty + pad - tb[1]), label, fill=(0, 0, 0), font=font)
    return img


def encode_jpeg_b64(image: Image.Image, quality: int = 85) -> str:
    import base64
    import io
    buf = io.BytesIO()
    image.convert("RGB").save(buf, format="JPEG", quality=quality)
    return base64.b64encode(buf.getvalue()).decode("ascii")


# ---------------------------------------------------------------- singleton

_detector: RoadDetector | None = None
_detector_lock = threading.Lock()


def get_detector() -> RoadDetector:
    global _detector
    if _detector is None:
        with _detector_lock:
            if _detector is None:
                _detector = RoadDetector()
    return _detector


def model_ready() -> bool:
    return _detector is not None


def load_model_card(detector_file: str) -> dict:
    """Card fields, used only when the card describes the loaded detector file."""
    empty = {"trained_on": None, "metrics": None, "baseline": None, "latency_ms": None, "cpu_onnx_latency_ms": None,
             "evaluated_at": None}
    path = config.MODEL_CARD_FILE
    if not path.exists():
        return empty
    try:
        card = json.loads(path.read_text(encoding="utf-8"))
    except Exception as e:
        log(f"model_card.json is not valid JSON: {e}")
        return empty
    if Path(str(card.get("detector_file", ""))).name != detector_file:
        return empty
    return {k: card.get(k) for k in empty}
