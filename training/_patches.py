"""Work around 'CUDA error: resource already mapped' from pinned host memory in the dataloader
(seen on Windows with an RTX 50-series GPU and torch 2.11). Import before training or validating."""

import functools

import ultralytics.data.build as build
import ultralytics.models.yolo.detect.train as det_train
import ultralytics.models.yolo.detect.val as det_val

_original = build.build_dataloader


@functools.wraps(_original)
def _no_pin(*args, **kwargs):
    kwargs["pin_memory"] = False
    return _original(*args, **kwargs)


for module in (build, det_train, det_val):
    module.build_dataloader = _no_pin
