import { describe, expect, it } from "vitest";
import { defectOf, levelOf, wardLabel } from "./roadguard.js";
import { ago, chainage, rupees } from "./format.js";
import { bracketPaths, isLargeArea, ringPath } from "./spray.js";

describe("defectOf", () => {
  it("resolves every backend spelling to the RDD code", () => {
    expect(defectOf("D40").code).toBe("D40");
    expect(defectOf("pothole").code).toBe("D40");
    expect(defectOf("Potholes").code).toBe("D40");
    expect(defectOf("Longitudinal Crack").code).toBe("D00");
    expect(defectOf("alligator_crack").code).toBe("D20");
    expect(defectOf("transverse crack").code).toBe("D10");
    expect(defectOf("building_crack")).toBeNull();
  });
});

describe("levelOf", () => {
  it("matches the backend thresholds", () => {
    expect(levelOf(39.9)).toBe("S1");
    expect(levelOf(40)).toBe("S2");
    expect(levelOf(55)).toBe("S3");
    expect(levelOf(70)).toBe("S4");
    expect(levelOf(undefined)).toBe("S1");
  });
});

describe("wardLabel", () => {
  it("reads MCGM wards by code and other corporations by node", () => {
    expect(wardLabel({ code: "K/E", name: "Andheri East", authority: "MCGM" })).toBe("Ward K/E");
    expect(wardLabel({ code: "NER", name: "Nerul", authority: "NMMC" })).toBe("Nerul · NMMC");
    expect(wardLabel({ code: "—", name: "Outside mapped wards" })).toBe("");
  });
});

describe("format", () => {
  it("groups rupees the Indian way and compacts lakh and crore", () => {
    expect(rupees(1234567)).toBe("₹12,34,567");
    expect(rupees(1457900, { compact: true })).toBe("₹14.6 L");
    expect(rupees(21800, { compact: true })).toBe("₹21.8k");
    expect(rupees(null)).toBe("—");
  });
  it("writes chainage as km+metres", () => {
    expect(chainage(250)).toBe("0+250");
    expect(chainage(12045)).toBe("12+045");
  });
  it("gives compact ages", () => {
    const now = Date.parse("2026-10-04T12:00:00Z");
    expect(ago("2026-10-04T11:59:30Z", now)).toBe("just now");
    expect(ago("2026-10-04T09:00:00Z", now)).toBe("3 h");
    expect(ago("2026-09-28T12:00:00Z", now)).toBe("6 d");
  });
});

describe("spray marks", () => {
  it("are deterministic for the same box and seed", () => {
    expect(ringPath([10, 10, 110, 60], 3)).toBe(ringPath([10, 10, 110, 60], 3));
    expect(ringPath([10, 10, 110, 60], 3)).not.toBe(ringPath([10, 10, 110, 60], 4));
  });
  it("switch to corner brackets for boxes covering most of the frame", () => {
    expect(isLargeArea([0, 300, 720, 720], 720, 720)).toBe(true);
    expect(isLargeArea([100, 100, 200, 200], 720, 720)).toBe(false);
    expect(bracketPaths([0, 300, 720, 720], 1)).toHaveLength(4);
  });
});
