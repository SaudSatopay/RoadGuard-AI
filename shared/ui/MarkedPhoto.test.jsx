import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import MarkedPhoto from "./MarkedPhoto.jsx";

const detections = [
  { id: "d1", code: "D40", label: "Pothole", confidence: 0.91, bbox: [100, 400, 260, 520], severity: 76, severity_level: "S4", cost_estimated: 21800 },
  { id: "d2", code: "D00", label: "Longitudinal crack", confidence: 0.52, bbox: [400, 200, 440, 600], severity: 44, severity_level: "S2" },
];

afterEach(cleanup);

describe("MarkedPhoto", () => {
  it("draws a field note per detection and summarises them for screen readers", () => {
    render(<MarkedPhoto src="/x.jpg" width={720} height={720} detections={detections} notes="full" />);
    expect(screen.getByText("Pothole")).toBeTruthy();
    expect(screen.getByText("Longitudinal crack")).toBeTruthy();
    expect(screen.getByText(/2 defects marked: D40 Pothole \(S4\), D00 Longitudinal crack \(S2\)/)).toBeTruthy();
  });

  it("offers a keyboard-operable compare handle", () => {
    render(<MarkedPhoto src="/x.jpg" width={720} height={720} detections={detections} mode="compare" initialSplit={0.5} />);
    const handle = screen.getByRole("slider");
    expect(handle.getAttribute("aria-valuenow")).toBe("50");
    fireEvent.keyDown(handle, { key: "ArrowRight" });
    expect(Number(handle.getAttribute("aria-valuenow"))).toBeGreaterThan(50);
    fireEvent.keyDown(handle, { key: "Home" });
    expect(handle.getAttribute("aria-valuenow")).toBe("0");
  });

  it("says so when nothing was found", () => {
    render(<MarkedPhoto src="/x.jpg" width={720} height={720} detections={[]} />);
    expect(screen.getByText("No defects marked.")).toBeTruthy();
  });
});
