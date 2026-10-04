// Console data: hazards (DBSCAN-merged reports) joined with their reports, ranked the way the worklist needs.
import { useMemo } from "react";
import { useApi } from "@shared/lib/api.js";
import { daysSince } from "@shared/lib/format.js";
import { levelOf, STATUS_FLOW } from "@shared/lib/roadguard.js";

export function useReports(refreshMs = 20000) {
  return useApi("/admin/reports/map", { refreshMs });
}

export function useHazardList(refreshMs = 20000) {
  return useApi("/hazards", { refreshMs });
}

/** Priority for the worklist: worst severity, pushed up by days open (capped at 30) and by citizen votes. */
export function priorityOf(h) {
  const days = Math.min(h.days_open ?? 0, 30);
  const votes = Math.min((h.total_upvotes ?? 0) / 10, 2);
  return (h.worst_severity ?? 0) * (1 + days / 30) * (1 + votes);
}

export function joinHazards(hazardData, reportData) {
  const reports = reportData?.reports || [];
  const byId = new Map(reports.map((r) => [r.id, r]));
  const hazards = (hazardData?.hazards || []).map((h) => {
    const members = (h.report_ids || []).map((id) => byId.get(id)).filter(Boolean);
    const worst = members.reduce((a, b) => ((b.severity ?? 0) > (a?.severity ?? -1) ? b : a), null);
    const open = h.status !== "fixed";
    const days_open = open ? daysSince(h.first_reported) : null;
    const item = {
      ...h,
      worst_level: h.worst_level || levelOf(h.worst_severity),
      reports: members,
      worst,
      days_open,
      cost: members.reduce((s, r) => Math.max(s, r.cost_estimated || 0), 0),
    };
    item.priority = open ? priorityOf(item) : 0;
    return item;
  });
  return hazards;
}

export function useHazards(refreshMs = 20000) {
  const hz = useHazardList(refreshMs);
  const rp = useReports(refreshMs);
  const hazards = useMemo(() => joinHazards(hz.data, rp.data), [hz.data, rp.data]);
  return {
    hazards,
    reports: rp.data?.reports || [],
    meta: hz.data,
    loading: (hz.loading && !hz.data) || (rp.loading && !rp.data),
    error: hz.error || rp.error,
    reload: () => {
      hz.reload();
      rp.reload();
    },
  };
}

export function nextStatus(status) {
  const i = STATUS_FLOW.indexOf(status);
  return i >= 0 && i < STATUS_FLOW.length - 1 ? STATUS_FLOW[i + 1] : null;
}
