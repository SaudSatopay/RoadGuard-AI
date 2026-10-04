# RoadGuard AI roadmap

What is built is described in the [README](README.md). This is what comes next, in the order the Major Project needs it.

## Evaluation (the abstract's commitments)
- Benchmark the YOLO26s detector against RT-DETR on the same RDD2022 split, and report per-class F1 next to mAP@0.5.
- Score on the CRDDC'2022 protocol (F1 on the official test images) so the numbers are comparable with published baselines.
- Measure duplicate merging on synthetically duplicated reports (precision and recall of the 25 m DBSCAN rule).
- Have inspectors rate drafted complaint letters for correctness and tone.

## Model
- Train longer and at 800 px for hairline cracks; add night and monsoon photos from Indian roads.
- Retrain the crack-segmentation model on street-level photos so crack length is available for more detections.

## Product
- Real ward boundaries (polygons) instead of nearest-centroid assignment.
- Accounts and roles backed by a database; audit log for status changes.
- WhatsApp: send status updates back to the reporter.

## Operations
- Containerised API with ONNX inference for CPU-only deployment; hosted preview.
