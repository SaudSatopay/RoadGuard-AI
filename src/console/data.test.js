import { describe, expect, it } from "vitest";
import { joinHazards, nextStatus, priorityOf } from "./data.js";

describe("worklist ranking", () => {
  it("pushes older and more-voted hazards up, capped at 30 days and 20 votes", () => {
    const base = { worst_severity: 60, days_open: 0, total_upvotes: 0 };
    expect(priorityOf(base)).toBe(60);
    expect(priorityOf({ ...base, days_open: 30 })).toBe(120);
    expect(priorityOf({ ...base, days_open: 300 })).toBe(120);
    expect(priorityOf({ ...base, total_upvotes: 20 })).toBe(180);
    expect(priorityOf({ ...base, total_upvotes: 200 })).toBe(180);
  });

  it("joins hazards to their reports and leaves fixed hazards out of the queue", () => {
    const hazards = {
      hazards: [
        { hazard_id: "HZ-1", report_ids: ["RPT-1", "RPT-2"], worst_severity: 80, status: "submitted", first_reported: new Date().toISOString(), total_upvotes: 3 },
        { hazard_id: "HZ-2", report_ids: ["RPT-3"], worst_severity: 90, status: "fixed", first_reported: new Date().toISOString(), total_upvotes: 9 },
      ],
    };
    const reports = { reports: [{ id: "RPT-1", severity: 50, cost_estimated: 1000 }, { id: "RPT-2", severity: 80, cost_estimated: 4000 }, { id: "RPT-3", severity: 90 }] };
    const [open, fixed] = joinHazards(hazards, reports);
    expect(open.worst.id).toBe("RPT-2");
    expect(open.cost).toBe(4000);
    expect(open.worst_level).toBe("S4");
    expect(open.priority).toBeGreaterThan(0);
    expect(fixed.priority).toBe(0);
    expect(fixed.days_open).toBeNull();
  });

  it("walks the repair workflow in order", () => {
    expect(nextStatus("submitted")).toBe("acknowledged");
    expect(nextStatus("acknowledged")).toBe("in_progress");
    expect(nextStatus("in_progress")).toBe("fixed");
    expect(nextStatus("fixed")).toBeNull();
  });
});
