import { describe, expect, it } from "vitest";
import { CROP_ASPECT, quizCrop } from "./quiz.js";

describe("quizCrop", () => {
  it("never zooms a small defect beyond 45% of the photo width", () => {
    const c = quizCrop([400, 300, 430, 320], 960, 720);
    expect(c.w).toBeGreaterThanOrEqual(0.45 * 960);
    expect(c.w / c.h).toBeCloseTo(CROP_ASPECT);
  });

  it("keeps the whole box in view and stays inside the photo", () => {
    const box = [700, 500, 950, 700];
    const c = quizCrop(box, 960, 720);
    expect(c.x).toBeGreaterThanOrEqual(0);
    expect(c.y).toBeGreaterThanOrEqual(0);
    expect(c.x + c.w).toBeLessThanOrEqual(960 + 1e-6);
    expect(c.y + c.h).toBeLessThanOrEqual(720 + 1e-6);
    expect(c.x).toBeLessThanOrEqual(box[0]);
    expect(c.x + c.w).toBeGreaterThanOrEqual(box[2]);
  });
});
