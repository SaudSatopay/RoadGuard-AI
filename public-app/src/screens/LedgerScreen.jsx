import { mediaUrl, useApi } from "@shared/lib/api.js";
import { ago, number, rupees } from "@shared/lib/format.js";
import { defectOf, wardLabel } from "@shared/lib/roadguard.js";
import { CodeBadge, StatusStamp } from "@shared/ui/marks.jsx";
import { ErrorNote, ScreenHead, Skeleton } from "../ui.jsx";

export default function LedgerScreen() {
  const stats = useApi("/public/stats", { refreshMs: 30000 });
  const wards = useApi("/analytics/wards", { refreshMs: 60000 });
  const feed = useApi("/public/feed?limit=8", { refreshMs: 30000 });
  const s = stats.data;
  const worst = (wards.data?.wards || []).filter((w) => w.open > 0).sort((a, b) => a.health_score - b.health_score).slice(0, 5);

  return (
    <div className="space-y-8 pb-10">
      <ScreenHead title="Public ledger" sub="Every report, its ward and how long it has been open." />
      <section className="px-4" aria-label="City totals">
        {stats.error && !s ? <ErrorNote error={stats.error} onRetry={stats.reload} /> : (
          <dl className="grid grid-cols-2 gap-px border-y border-line bg-line [&>div]:bg-paper [&>div]:px-1 [&>div]:py-3">
            <div><dt className="label text-ink-3">Reports</dt><dd className="font-display text-4xl font-bold num">{s ? number(s.total_reports) : "—"}</dd></div>
            <div className="!pl-4"><dt className="label text-ink-3">Fixed</dt><dd className="font-display text-4xl font-bold num text-ok">{s ? number(s.fixed) : "—"}</dd></div>
            <div><dt className="label text-ink-3">Reports acted on</dt><dd className="font-display text-4xl font-bold num">{s ? `${Math.round(s.performance_score)}%` : "—"}</dd></div>
            <div className="!pl-4"><dt className="label text-ink-3">Open repair backlog</dt><dd className="font-display text-4xl font-bold num">{s ? rupees(s.backlog_cost ?? s.total_estimated_cost, { compact: true }) : "—"}</dd></div>
          </dl>
        )}
      </section>

      <section className="px-4" aria-labelledby="slow-h">
        <h2 id="slow-h" className="sign border-b-[3px] border-ink pb-1 text-lg">Slowest wards</h2>
        {wards.loading && !wards.data ? <Skeleton rows={3} /> : (
          <ol className="divide-y divide-line">
            {worst.map((w, i) => (
              <li key={w.code + w.name} className="grid grid-cols-[1.5rem_1fr_auto] items-center gap-2 py-2.5">
                <span className="font-mono text-xs text-ink-3">{i + 1}</span>
                <span className="min-w-0"><span className="block truncate text-sm font-medium">{w.name}</span><span className="block text-xs text-ink-3">{w.authority} · {w.open} open · avg {w.avg_days_open != null ? Math.round(w.avg_days_open) : "—"} days</span></span>
                <span className={`font-mono text-sm num ${w.health_score < 50 ? "text-crit" : ""}`}>{Math.round(w.health_score)}</span>
              </li>
            ))}
          </ol>
        )}
        <p className="mt-2 text-xs text-ink-3">Ward health, 0–100, from open hazards, their severity and how long they've waited.</p>
      </section>

      <section className="px-4" aria-labelledby="latest-h">
        <h2 id="latest-h" className="sign border-b-[3px] border-ink pb-1 text-lg">Latest</h2>
        {feed.loading && !feed.data ? <Skeleton rows={4} /> : (
          <ul className="divide-y divide-line">
            {(feed.data?.items || []).map((it) => {
              const d = defectOf(it.damage_type);
              return (
                <li key={it.id} className="grid grid-cols-[52px_1fr_auto] items-center gap-3 py-2.5">
                  <span className="h-[52px] w-[52px] overflow-hidden rounded-xs bg-asphalt">{it.image_url && <img src={mediaUrl(it.image_url)} alt="" loading="lazy" className="h-full w-full object-cover" />}</span>
                  <span className="min-w-0">
                    <span className="flex items-center gap-2"><CodeBadge code={d?.code} /><span className="text-xs text-ink-3">{ago(it.timestamp)} ago</span></span>
                    <span className="mt-0.5 block truncate text-sm">{it.location_name}{wardLabel(it.ward) ? ` · ${wardLabel(it.ward)}` : ""}</span>
                  </span>
                  <StatusStamp status={it.status} />
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
