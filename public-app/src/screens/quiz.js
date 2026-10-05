export const CROP_ASPECT = 1.6;

/**
 * The "Spot the defect" crop: the marked box with room around it, never narrower than 45% of the photo, so a small
 * defect is shown near its real resolution instead of blown up into a blur. Returns the crop in photo pixels.
 */
export function quizCrop(bbox, w, h) {
  const [x1, y1, x2, y2] = bbox;
  let cw = Math.max((x2 - x1) * 1.5, (y2 - y1) * 1.5 * CROP_ASPECT, 0.45 * w);
  let ch = cw / CROP_ASPECT;
  if (ch > h) {
    ch = h;
    cw = h * CROP_ASPECT;
  }
  if (cw > w) {
    cw = w;
    ch = w / CROP_ASPECT;
  }
  const clamp = (v, max) => Math.min(Math.max(0, v), max);
  return { x: clamp((x1 + x2) / 2 - cw / 2, w - cw), y: clamp((y1 + y2) / 2 - ch / 2, h - ch), w: cw, h: ch };
}
