import { lazy, Suspense } from "react";
import { ArrowRight, Camera } from "lucide-react";
import { Link } from "@shared/lib/router.js";
import { mediaUrl, useApi } from "@shared/lib/api.js";
import { dateLabel, number, rupees } from "@shared/lib/format.js";
import { defectOf, wardLabel } from "@shared/lib/roadguard.js";
import { CodeBadge, SeverityChip, StatusStamp } from "@shared/ui/marks.jsx";
import { useHazards } from "../data.js";
import TimelineChart from "../TimelineChart.jsx";
import ErrorBoundary from "@shared/ui/ErrorBoundary.jsx";
import { Empty, ErrorState, Loading, PageHead, SectionHead, Stat } from "../ui.jsx";

const RoadMap = lazy(() => import("@shared/ui/RoadMap.jsx"));

function SummaryStrip({ s }) {
  return (
    <div className="grid grid-cols-2 gap-px border-y border-line bg-line sm:grid-cols-3 lg:grid-cols-5 [&>*]:bg-paper">
      <Stat label="Open hazards" value={s ? number(s.open_hazards) : "—"} sub={s ? `${number(s.open_reports)} citizen reports` : " "} />
      <Stat label="Critical open" value={s ? number(s.critical_open) : "—"} tone={s?.critical_open ? "crit" : "ink"} sub="S4 · fix within 7 days" />
      <Stat label="Median days open" value={s?.median_days_open != null ? number(s.median_days_open, 1) : "—"} sub="across open hazards" />
      <Stat label="Open repair backlog" value={s ? rupees(s.backlog_cost, { compact: true }) : "—"} sub="estimate for open hazards" />
      <Stat className="col-span-2 lg:col-span-1" label="Fixed on time" value={s?.sla ? `${Math.round(s.sla.on_time_pct)}%` : "—"} tone={s?.sla?.breaches ? "ink" : "ok"} sub={s?.sla ? `${number(s.sla.breaches)} past RoadGuard target` : " "}>
        {/* Where this cell spans the full row, the bar uses the width */}
        {s?.sla && (
          <div className="mt-2.5 h-1.5 bg-paper-3 lg:hidden" aria-hidden="true">
            <div className="h-full bg-ok" style={{ width: `${Math.min(100, Math.max(0, s.sla.on_time_pct))}%` }} />
          </div>
        )}
      </Stat>
    </div>
  );
}

function Worklist({ hazards }) {
  const open = hazards.filter((h) => h.status !== "fixed").sort((a, b) => b.priority - a.priority).slice(0, 8);
  if (!open.length) return <Empty title="Nothing open">Every reported hazard is fixed. New citizen reports will be ranked here.</Empty>;
  return (
    <ol className="divide-y divide-line border-b border-line">
      {open.map((h, i) => {
        const r = h.worst;
        const d = defectOf(r?.class_key || r?.damage_type || h.damage_types?.[0]);
        return (
          <li key={h.hazard_id}>
            <Link
              to={`/console/hazards?h=${encodeURIComponent(h.hazard_id)}`}
              className="grid grid-cols-[28px_52px_minmax(0,1fr)_auto] items-center gap-x-3 py-2.5 transition-colors duration-150 [@media(hover:hover)]:hover:bg-paper-2 sm:grid-cols-[28px_56px_minmax(0,1fr)_auto_auto]"
            >
              <span className="font-mono text-sm num text-ink-3">{String(i + 1).padStart(2, "0")}</span>
              <span className="h-[52px] w-[52px] overflow-hidden rounded-xs bg-asphalt sm:h-14 sm:w-14">
                {h.image_url && <img src={mediaUrl(h.image_url)} alt="" width="56" height="56" loading="lazy" className="h-full w-full object-cover" />}
              </span>
              <span className="min-w-0">
                {/* Three fixed lines on a phone (name, place, code · days · cost) so every row is the same height */}
                <span className="flex min-w-0 items-center gap-2">
                  <span className="hidden shrink-0 sm:inline-flex"><CodeBadge code={d?.code} /></span>
                  <span className="truncate font-medium">{d?.label || "Road damage"}</span>
                </span>
                <span className="mt-0.5 block truncate text-sm text-ink-2">
                  {h.report_count > 1 && <span className="font-mono text-2xs text-ink-3">×{h.report_count} · </span>}
                  {r?.location_name || "Reported location"}
                  {wardLabel(h.ward) ? ` · ${wardLabel(h.ward)}` : ""}
                </span>
                <span className="mt-0.5 block truncate font-mono text-2xs num text-ink-3 sm:hidden">
                  {[d?.code, h.days_open != null ? `${Math.floor(h.days_open)} d` : null, h.cost ? rupees(h.cost, { compact: true }) : null].filter(Boolean).join(" · ")}
                </span>
              </span>
              <span className="hidden text-right sm:block">
                <span className="block font-mono text-sm num">{h.days_open != null ? `${Math.floor(h.days_open)} d` : "—"}</span>
                <span className="block font-mono text-2xs num text-ink-3">{h.cost ? rupees(h.cost, { compact: true }) : ""}</span>
              </span>
              <span className="flex flex-col items-end gap-1">
                <SeverityChip level={h.worst_level} score={h.worst_severity} showName={false} />
                <StatusStamp status={h.status} />
              </span>
            </Link>
          </li>
        );
      })}
    </ol>
  );
}

export default function Today({ summary }) {
  const { hazards, loading, error, reload } = useHazards();
  const timeline = useApi("/analytics/timeline?days=30", { refreshMs: 60000 });
  const s = summary?.data;
  const points = hazards.map((h) => ({
    id: h.hazard_id,
    lat: h.latitude,
    lng: h.longitude,
    level: h.worst_level,
    status: h.status,
    count: h.report_count,
    label: [h.hazard_id, h.worst?.location_name].filter(Boolean).join(" · "),
  }));

  return (
    <div className="space-y-8">
      <PageHead title="Today" sub={`${dateLabel(new Date().toISOString())} · all wards`}>
        <Link to="/console/scan" className="inline-flex h-10 items-center gap-2 rounded-sm bg-paint px-4 font-display text-base font-bold uppercase tracking-[0.02em] text-paint-ink">
          <Camera className="h-4 w-4" aria-hidden="true" /> Scan a photo
        </Link>
      </PageHead>

      {summary?.error && !s ? <ErrorState error={summary.error} onRetry={summary.reload} title="Couldn't load today's numbers" /> : <SummaryStrip s={s} />}

      <div className="grid gap-8 xl:grid-cols-12">
        <section className="xl:col-span-7" aria-labelledby="worklist-title">
          <SectionHead title={<span id="worklist-title">Fix in this order</span>} note="severity × days open × citizen votes" />
          {loading ? <Loading label="Loading worklist" rows={8} rowClassName="h-[72px] sm:h-[76px]" /> : error ? <ErrorState error={error} onRetry={reload} /> : <Worklist hazards={hazards} />}
          <Link to="/console/hazards" className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-ink-2 hover:text-ink">
            All hazards on the map <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </section>

        <div className="space-y-8 xl:col-span-5">
          <section aria-labelledby="map-title">
            <SectionHead title={<span id="map-title">Where</span>} note={`${points.length} hazards`} />
            <ErrorBoundary name="map" title="The map didn't load" className="mt-3">
            <Suspense fallback={<div className="mt-3 h-[300px] animate-pulse rounded-md bg-paper-3" />}>
              {/* An overview: on a 300 px map the pins overlap, so the whole map opens the full hazard map, whose list
                  is the precise way to pick one */}
              <div className="relative mt-3">
                <RoadMap className="h-[300px]" points={points} interactive={false} label="Map of open and fixed hazards" />
                <Link
                  to="/console/hazards"
                  aria-label={`Open the hazard map, ${points.length} hazards`}
                  className="group absolute inset-0 z-[500] flex items-start justify-end rounded-md p-3"
                >
                  <span className="inline-flex items-center gap-1.5 rounded-sm bg-paper/95 px-2.5 py-1.5 text-sm font-medium text-ink shadow-lift transition-transform duration-150 [@media(hover:hover)]:group-hover:-translate-y-0.5">
                    Open the hazard map <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </span>
                </Link>
              </div>
            </Suspense>
            </ErrorBoundary>
          </section>
          <section aria-labelledby="trend-title">
            <SectionHead title={<span id="trend-title">Last 30 days</span>} />
            <div className="mt-3">
              {timeline.data?.days ? <TimelineChart days={timeline.data.days} /> : timeline.error ? <ErrorState error={timeline.error} onRetry={timeline.reload} /> : <Loading rows={2} />}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
