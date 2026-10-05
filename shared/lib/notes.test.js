import { describe, expect, it } from "vitest";
import { placeNotes } from "./notes.js";

const mark = (id, bbox, level = "S3", confidence = 0.6) => ({ id, bbox, level, confidence, code: "D40", label: "Pothole" });
const overlap = (a, b) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];

describe("placeNotes", () => {
  it("labels every defect when there is room", () => {
    const placed = placeNotes([mark("a", [60, 300, 200, 420]), mark("b", [460, 380, 640, 520])], 720, 720, 720, false);
    expect(Object.keys(placed).sort()).toEqual(["a", "b"]);
  });

  it("never stacks notes on a cluster, and the worst defect always keeps its note", () => {
    const cluster = [
      mark("s3a", [300, 420, 340, 450], "S3", 0.67),
      mark("s3b", [310, 430, 350, 460], "S3", 0.51),
      mark("s3c", [320, 425, 360, 455], "S3", 0.35),
      mark("s4", [250, 380, 420, 560], "S4", 0.62),
      mark("s3d", [330, 440, 370, 470], "S3", 0.32),
    ];
    const placed = placeNotes(cluster, 720, 720, 780, false);
    expect(placed.s4).toBeTruthy();
    expect(Object.keys(placed).length).toBeLessThan(cluster.length);
    const rects = Object.values(placed).map((p) => p.rect);
    rects.forEach((r, i) => rects.slice(i + 1).forEach((q) => expect(overlap(r, q)).toBe(false)));
  });

  it("keeps a note right of the compare split when the box straddles it", () => {
    const placed = placeNotes([mark("wide", [150, 300, 720, 700], "S4")], 720, 720, 720, false, 0.42);
    expect(placed.wide.right).toBe(true);
    expect(placed.wide.rect[0]).toBeGreaterThanOrEqual(0.42 * 720);
  });

  it("puts the note inside a box that fills the frame", () => {
    const placed = placeNotes([mark("big", [0, 0, 720, 720], "S4")], 720, 720, 720, false);
    expect(placed.big.y).toBe("inside");
  });
});
