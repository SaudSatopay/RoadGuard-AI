// Geometry for spray-paint marks. Pure functions, shared by MarkedPhoto and the build-time hero poster.

/** Deterministic pseudo-random sequence, so a photo is always marked the same way. */
export function seeded(seed) {
  let s = (Math.abs(Math.floor(seed)) % 2147483646) + 1;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

/** Catmull-Rom through points, as a cubic Bezier path. */
export function smooth(points) {
  if (points.length < 2) return "";
  let d = `M${points[0][0].toFixed(1)} ${points[0][1].toFixed(1)}`;
  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[i - 1] || points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] || p2;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${c1[0].toFixed(1)} ${c1[1].toFixed(1)} ${c2[0].toFixed(1)} ${c2[1].toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  return d;
}

/** A hand-sprayed ring around a box: slightly more than one turn, a wobbling radius, an overlapping tail. */
export function ringPath([x1, y1, x2, y2], seed, shape = "ellipse") {
  const rand = seeded(seed * 9301 + 49297);
  const cx = (x1 + x2) / 2;
  const cy = (y1 + y2) / 2;
  const pad = 1.12;
  let rx = ((x2 - x1) / 2) * pad;
  let ry = ((y2 - y1) / 2) * pad;
  const minR = Math.max(rx, ry) * 0.28;
  rx = Math.max(rx, minR);
  ry = Math.max(ry, minR);
  const start = rand() * Math.PI * 2;
  const turns = 1.08 + rand() * 0.06;
  const steps = 34;
  const pts = [];
  for (let i = 0; i <= steps; i += 1) {
    const t = start + (i / steps) * turns * Math.PI * 2;
    const wobble = 1 + (rand() - 0.5) * 0.07 + (i / steps) * 0.035;
    let px = Math.cos(t);
    let py = Math.sin(t);
    if (shape === "capsule") {
      const n = 3.2; // superellipse: a squarer ring for cracks
      px = Math.sign(px) * Math.abs(px) ** (2 / n);
      py = Math.sign(py) * Math.abs(py) ** (2 / n);
    }
    pts.push([cx + px * rx * wobble, cy + py * ry * wobble]);
  }
  return smooth(pts);
}

/** Overspray: a scatter of small dots along the ring. */
export function overspray([x1, y1, x2, y2], seed, n = 14) {
  const rand = seeded(seed * 7919 + 104729);
  const cx = (x1 + x2) / 2;
  const cy = (y1 + y2) / 2;
  const rx = ((x2 - x1) / 2) * 1.12;
  const ry = ((y2 - y1) / 2) * 1.12;
  return Array.from({ length: n }, () => {
    const t = rand() * Math.PI * 2;
    const spread = 1 + (rand() - 0.3) * 0.16;
    return { x: cx + Math.cos(t) * rx * spread, y: cy + Math.sin(t) * ry * spread, r: 0.6 + rand() * 1.6 };
  });
}

/** Inspector's tick marks beside severe defects: one for S3, two for S4. */
export function ticks([x1, y1, x2], level) {
  const count = level === "S4" ? 2 : level === "S3" ? 1 : 0;
  const w = x2 - x1;
  const ox = x2 + Math.max(6, w * 0.04);
  const oy = y1 - 4;
  return Array.from({ length: count }, (_, i) => {
    const x = ox + i * 9;
    return `M${x} ${oy + 10} L${x + 4} ${oy + 15} L${x + 11} ${oy}`;
  });
}

export const SHAPE_BY_CODE = { D00: "capsule", D10: "capsule", D20: "capsule", D40: "ellipse" };

/** Very large areas (a whole carriageway) get four sprayed corner brackets instead of a ring. */
export function bracketPaths([x1, y1, x2, y2], seed) {
  const rand = seeded(seed * 31337 + 7);
  const w = x2 - x1;
  const h = y2 - y1;
  const arm = Math.min(w, h) * 0.18;
  const j = () => (rand() - 0.5) * arm * 0.12;
  const inset = Math.min(w, h) * 0.02;
  const corners = [
    [x1 + inset, y1 + inset, 1, 1],
    [x2 - inset, y1 + inset, -1, 1],
    [x2 - inset, y2 - inset, -1, -1],
    [x1 + inset, y2 - inset, 1, -1],
  ];
  return corners.map(([cx, cy, dx, dy]) =>
    smooth([
      [cx + j(), cy + dy * arm + j()],
      [cx + j() * 0.5, cy + dy * arm * 0.45 + j()],
      [cx, cy],
      [cx + dx * arm * 0.45 + j(), cy + j() * 0.5],
      [cx + dx * arm + j(), cy + j()],
    ]),
  );
}

/** True when a box covers so much of the frame that a ring would read as noise. */
export function isLargeArea([x1, y1, x2, y2], width, height) {
  return ((x2 - x1) * (y2 - y1)) / (width * height) > 0.22;
}
