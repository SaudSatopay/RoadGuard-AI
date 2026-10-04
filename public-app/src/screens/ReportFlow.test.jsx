import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The pin map needs Leaflet and a real layout; the flow only cares that a location gets set.
vi.mock("./PinMap.jsx", () => ({ default: () => <div>pin map</div> }));

import ReportFlow from "./ReportFlow.jsx";

const filed = {
  id: "RPT-TEST01",
  status: "submitted",
  hazard_id: "HZ-TEST01",
  duplicate_of: null,
  ward: { code: "K/E", name: "Andheri East", authority: "MCGM" },
  image_url: null,
  image: { width: 720, height: 720 },
  detections: [
    { id: "d1", code: "D40", label: "Pothole", confidence: 0.88, bbox: [100, 400, 260, 520], severity: 72, severity_level: "S4" },
  ],
  gamification: { points_earned: 30, xp_earned: 150, coins_earned: 15, level: 2, new_achievements: [{ name: "First Report" }] },
};

describe("citizen report flow", () => {
  beforeEach(() => {
    globalThis.URL.createObjectURL = vi.fn(() => "blob:photo");
    globalThis.URL.revokeObjectURL = vi.fn();
    Object.defineProperty(globalThis.navigator, "geolocation", {
      configurable: true,
      value: { getCurrentPosition: (ok) => ok({ coords: { latitude: 19.1197, longitude: 72.8464, accuracy: 12 } }) },
    });
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify(filed), { status: 200, headers: { "Content-Type": "application/json" } }));
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("goes photo → where → send and shows the hazard it joined", async () => {
    const onTrack = vi.fn();
    render(<ReportFlow user={{ name: "Asha" }} onTrack={onTrack} />);

    const photo = new File(["jpeg-bytes"], "road.jpg", { type: "image/jpeg" });
    fireEvent.change(screen.getByLabelText("Take a photo"), { target: { files: [photo] } });
    fireEvent.click(await screen.findByRole("button", { name: "Next: where is it?" }));

    expect(await screen.findByText(/19\.11970, 72\.84640/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Next: check and send" }));
    fireEvent.click(screen.getByRole("button", { name: "Send report" }));

    expect(await screen.findByText("On the record")).toBeTruthy();
    expect(screen.getByText(/Hazard HZ-TEST01 is now on the Ward K\/E worklist/)).toBeTruthy();
    expect(screen.getByText("+150")).toBeTruthy();

    const [url, init] = globalThis.fetch.mock.calls[0];
    expect(url).toBe("/api/public/report");
    expect(init.method).toBe("POST");
    expect(init.body.get("latitude")).toBe("19.1197");
    expect(init.body.get("road_class")).toBe("arterial");
    expect(init.body.get("reporter_name")).toBe("Asha");

    fireEvent.click(screen.getByRole("button", { name: "Track it" }));
    await waitFor(() => expect(onTrack).toHaveBeenCalled());
  });

  it("explains a photo with no damage and offers another try", async () => {
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ id: null, status: "no_damage", message: "No infrastructure damage detected." }), { status: 200 }));
    render(<ReportFlow user={{ name: "Asha" }} onTrack={() => {}} />);
    fireEvent.change(screen.getByLabelText("Take a photo"), { target: { files: [new File(["x"], "wall.jpg", { type: "image/jpeg" })] } });
    fireEvent.click(await screen.findByRole("button", { name: "Next: where is it?" }));
    fireEvent.click(await screen.findByRole("button", { name: "Next: check and send" }));
    fireEvent.click(screen.getByRole("button", { name: "Send report" }));
    expect(await screen.findByText("No damage found in this photo")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Take another photo" })).toBeTruthy();
  });
});
