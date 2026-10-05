// Field-note placement for MarkedPhoto. The worst defect picks first; each note takes the first slot around its
// box that stays inside the frame and clear of notes already placed. A note with no free slot is left off, the
// way a map drops colliding place names: the ring is still drawn and the legend still lists the defect.

const GAP = 8; // px between the box edge and its note (matches the CSS translate in FieldNote)
const PAD = 4; // px of air required between two notes
const RANK = { S1: 1, S2: 2, S3: 3, S4: 4 };

/** Rough rendered size of a note in CSS px (condensed sign face for the head, mono for the detail line). */
export function noteSize(m, compact) {
  const head = `${m.code} ${compact ? m.level : m.label}`.length;
  if (compact) return { w: head * 7 + 12, h: 22 };
  const detail = 18; // "0.67 · S3 · ₹6.7k"
  return { w: Math.max(head * 7, detail * 6.6) + 12, h: 36 };
}

/** The slot a note uses when decluttering is not needed: above the box, below it near the top edge. */
export function defaultSlot(m, width, height) {
  return { y: m.bbox[1] / height < 0.14 ? "below" : "above", right: m.bbox[0] / width > 0.62 };
}

function rectFor(slot, box, size) {
  const [x1, y1, x2, y2] = box;
  const left = slot.right ? x2 - size.w : x1;
  const top = slot.y === "above" ? y1 - GAP - size.h : slot.y === "below" ? y2 + GAP : y1 + GAP;
  return [left, top, left + size.w, top + size.h];
}

const overlaps = (a, b) => a[0] < b[2] + PAD && b[0] < a[2] + PAD && a[1] < b[3] + PAD && b[1] < a[3] + PAD;

/**
 * @param {Array<{id: string, bbox: number[], level: string, confidence?: number, code: string, label: string}>} marks
 * @param {number} width natural photo width (bbox space)
 * @param {number} height natural photo height
 * @param {number} boxWidth rendered width in CSS px (0 before layout; a typical width is assumed)
 * @param {boolean} compact one-line notes
 * @param {number} [visibleFrom] 0..1: in compare mode the marks left of the resting split are hidden, so notes
 *   prefer slots right of it and fall back to any slot
 * @returns {Record<string, {y: "above"|"below"|"inside", right: boolean, rect: number[]}>} placed notes by mark id
 */
export function placeNotes(marks, width, height, boxWidth, compact, visibleFrom = 0) {
  const bw = boxWidth || 640;
  const bh = bw * (height / width);
  const s = bw / width;
  const placed = [];
  const out = {};
  const order = [...marks].sort((a, b) => (RANK[b.level] || 0) - (RANK[a.level] || 0) || (b.confidence ?? 0) - (a.confidence ?? 0));
  for (const m of order) {
    const box = m.bbox.map((v) => v * s);
    const size = noteSize(m, compact);
    const first = defaultSlot(m, width, height);
    const slots = [first, { ...first, right: !first.right }];
    const other = first.y === "above" ? "below" : "above";
    slots.push({ y: other, right: first.right }, { y: other, right: !first.right });
    slots.push({ y: "inside", right: first.right }, { y: "inside", right: !first.right });
    for (const minX of visibleFrom > 0 ? [visibleFrom * bw, 0] : [0]) {
      const slot = slots.find((sl) => {
        const r = rectFor(sl, box, size);
        return r[0] >= minX && r[1] >= 0 && r[2] <= bw && r[3] <= bh && !placed.some((p) => overlaps(p, r));
      });
      if (slot) {
        const r = rectFor(slot, box, size);
        placed.push(r);
        out[m.id] = { ...slot, rect: r };
        break;
      }
    }
  }
  return out;
}
