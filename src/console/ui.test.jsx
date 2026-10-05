import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ServerStatus } from "./status.js";
import { ErrorState } from "./ui.jsx";

const unreachable = Object.assign(new Error("Can't reach RoadGuard right now."), { status: 0 });

afterEach(cleanup);

describe("ErrorState", () => {
  it("stays quiet under the outage banner, then reloads itself when the server answers", () => {
    const retry = vi.fn();
    const { rerender } = render(
      <ServerStatus.Provider value="offline"><ErrorState error={unreachable} onRetry={retry} /></ServerStatus.Provider>,
    );
    expect(screen.getByText(/Waiting for the server/)).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
    rerender(<ServerStatus.Provider value="online"><ErrorState error={unreachable} onRetry={retry} /></ServerStatus.Provider>);
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it("shows an error the server actually returned, outage or not", () => {
    const notFound = Object.assign(new Error("Hazard HZ-000000 not found."), { status: 404 });
    render(<ServerStatus.Provider value="offline"><ErrorState error={notFound} /></ServerStatus.Provider>);
    expect(screen.getByRole("alert").textContent).toContain("Hazard HZ-000000 not found.");
  });
});
