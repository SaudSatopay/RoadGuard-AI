import { useMemo, useState } from "react";
import { useApi } from "@shared/lib/api.js";
import { number } from "@shared/lib/format.js";
import { ErrorState, Loading, PageHead, SectionHead, Segmented } from "../ui.jsx";

function HealthBar({ value }) {
  const v = Math.max(0, Math.min(100, value ?? 0));
  const tone = v >= 70 ? "bg-ok" : v >= 45 ? "bg-paint-deep" : "bg-crit";
  return (
    <div className="flex items-center gap-2">
      <div className="relative h-2 w-24 bg-paper-3" aria-hidden="true"><div className={`absolute inset-y-0 left-0 ${tone}`} style={{ width: `${v}%` }} /></div>
      <span className="w-8 text-right font-mono text-xs num">{Math.round(v)}</span>
    </div>
  );
}

function Wards() {
  const { data, error, loading, reload } = useApi("/analytics/wards", { refreshMs: 60000 });
  const [sort, setSort] = useState("worst");
  const rows = useMemo(() => {
    const list = [...(data?.wards || [])];
    if (sort === "worst") list.sort((a, b) => a.health_score - b.health_score);
    if (sort === "open") list.sort((a, b) => b.open - a.open);
    if (sort === "slow") list.sort((a, b) => (b.avg_days_open ?? 0) - (a.avg_days_open ?? 0));
    return list;
  }, [data, sort]);
  if (loading && !data) return <Loading label="Loading wards" rows={6} />;
  if (error && !data) return <ErrorState error={error} onRetry={reload} />;
  return (
    <div>
      <div className="mb-3 flex justify-end">
        <Segmented label="Sort wards" value={sort} onChange={setSort} size="sm" options={[{ value: "worst", label: "Worst health" }, { value: "open", label: "Most open" }, { value: "slow", label: "Slowest" }]} />
      </div>
      <ul className="divide-y divide-line border-y border-line sm:hidden">
        {rows.map((w) => (
          <li key={w.code + w.name} className="py-3">
            <div className="flex items-baseline justify-between gap-3">
              <span className="min-w-0 truncate font-medium"><span className="font-mono text-xs num text-ink-3">{w.code}</span> {w.name}</span>
              <span className="text-xs text-ink-3">{w.authority}</span>
            </div>
            <div className="mt-1.5 grid grid-cols-[1fr_auto] items-center gap-3">
              {/* Each figure stays whole, so a narrow screen wraps between figures, never inside one */}
              <span className="flex flex-wrap gap-x-2 font-mono text-xs num text-ink-2 [&>span]:whitespace-nowrap">
                <span>{number(w.open)} open</span>
                <span className={w.critical_open ? "text-crit" : ""}>{number(w.critical_open)} S4</span>
                <span>{w.avg_days_open != null ? `${number(w.avg_days_open, 1)} d avg` : "no age"}</span>
                <span>{number(w.sla_breaches)} late</span>
              </span>
              <HealthBar value={w.health_score} />
            </div>
          </li>
        ))}
      </ul>
      <div className="hidden overflow-x-auto sm:block">
        <table className="w-full min-w-[640px] border-collapse text-sm">
          <caption className="sr-only">Ward scorecard computed from the public ledger</caption>
          <thead>
            <tr className="border-b border-ink text-left">
              {["Ward", "Authority", "Open", "S4 open", "Avg days open", "Past target", "Health"].map((h) => (
                <th key={h} scope="col" className="label py-2 pr-3 font-medium text-ink-3">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((w) => (
              <tr key={w.code + w.name} className="border-b border-line">
                <td className="py-2.5 pr-3"><span className="font-mono text-xs num text-ink-3">{w.code}</span> <span className="font-medium">{w.name}</span></td>
                <td className="py-2.5 pr-3 text-ink-2">{w.authority}</td>
                <td className="py-2.5 pr-3 font-mono num">{number(w.open)}</td>
                <td className={`py-2.5 pr-3 font-mono num ${w.critical_open ? "text-crit" : ""}`}>{number(w.critical_open)}</td>
                <td className="py-2.5 pr-3 font-mono num">{w.avg_days_open != null ? number(w.avg_days_open, 1) : "—"}</td>
                <td className="py-2.5 pr-3 font-mono num">{number(w.sla_breaches)}</td>
                <td className="py-2.5"><HealthBar value={w.health_score} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-ink-3">Wards are assigned to the nearest ward centroid (approximate). Targets are RoadGuard's: acknowledge in 48 h; fix S4 in 7 days, S3 in 15, S2 in 30, S1 in 60.</p>
    </div>
  );
}

function Contractors() {
  const { data, error, loading, reload } = useApi("/analytics/wall-of-shame", { refreshMs: 60000 });
  if (loading && !data) return <Loading rows={5} />;
  if (error && !data) return <ErrorState error={error} onRetry={reload} />;
  const rows = (data?.leaderboard || []).filter((c) => c.negligence_score > 0).slice(0, 8);
  return (
    <ol className="divide-y divide-line border-b border-line">
      {rows.map((c) => (
        <li key={c.contractor_id} className="grid grid-cols-[2.25rem_minmax(0,1fr)_auto] items-center gap-3 py-3">
          <span className={`font-display text-2xl font-bold num ${c.rank === 1 ? "text-crit" : "text-ink-3"}`}>{c.rank}</span>
          <span className="min-w-0">
            <span className="block truncate font-medium">{c.contractor_name}</span>
            <span className="block truncate text-xs text-ink-3">{c.area}, {c.city} · {c.fixed} fixed of {c.total_reports} · {c.unfixed} open</span>
          </span>
          <span className="text-right">
            <span className="block font-mono text-sm num">{number(c.negligence_score)}</span>
            <span className="block text-2xs text-ink-3">negligence</span>
          </span>
        </li>
      ))}
    </ol>
  );
}

function Forecast() {
  const { data, error, loading } = useApi("/analytics/forecast", { refreshMs: 120000 });
  if (loading && !data) return <Loading rows={4} />;
  if (error && !data) return <ErrorState error={error} />;
  // Soonest first; roads already failing are told apart by their risk score, then by how much is open.
  const zones = [...(data?.zones || [])]
    .sort((a, b) => a.earliest_failure_days - b.earliest_failure_days || b.risk_score - a.risk_score || b.active_issues - a.active_issues)
    .slice(0, 6);
  return (
    <ol className="divide-y divide-line border-b border-line">
      {zones.map((z, i) => (
        <li key={z.zone} className="grid grid-cols-[2rem_minmax(0,1fr)_auto] items-baseline gap-x-3 py-3">
          <span className="font-mono text-sm num text-ink-3">{String(i + 1).padStart(2, "0")}</span>
          <span className="min-w-0">
            <span className="block truncate font-medium">{z.zone}</span>
            <span className="block text-xs text-ink-3">
              {z.active_issues} open · severity {number(z.avg_severity)} · risk {number(z.risk_score)}/100
            </span>
          </span>
          <span className={`whitespace-nowrap font-mono text-sm num ${z.earliest_failure_days < 14 ? "text-crit" : "text-ink"}`}>
            {z.earliest_failure_days <= 0 ? "failing now" : z.earliest_failure_days < 999 ? `${z.earliest_failure_days} d` : "—"}
          </span>
        </li>
      ))}
    </ol>
  );
}

export default function Accountability() {
  return (
    <div className="space-y-8">
      <PageHead title="Accountability" sub="Computed from the public ledger: who has open hazards, for how long, and who is likely to fail next." />
      <section aria-labelledby="wards-h">
        <SectionHead title={<span id="wards-h">Ward scorecard</span>} note="health 0–100, higher is better" />
        <div className="mt-3"><Wards /></div>
      </section>
      <div className="grid gap-8 lg:grid-cols-2">
        <section aria-labelledby="shame-h">
          <SectionHead title={<span id="shame-h">Wall of shame</span>} note="ward offices, worst first" />
          <div className="mt-1"><Contractors /></div>
          <p className="mt-2 text-xs text-ink-3">Negligence = severity × days each hazard has stayed open, summed per ward office. Offices with nothing open are left off.</p>
        </section>
        <section aria-labelledby="forecast-h">
          <SectionHead title={<span id="forecast-h">Likely to fail next</span>} note="days to a pothole" />
          <div className="mt-1"><Forecast /></div>
          <p className="mt-2 text-xs text-ink-3">Rule-based deterioration rates per defect type, 2.5× faster June to September.</p>
        </section>
      </div>
    </div>
  );
}
