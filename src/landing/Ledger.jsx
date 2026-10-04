import { RefreshCw } from "lucide-react";
import { mediaUrl, useApi } from "@shared/lib/api.js";
import { ago, number, rupees } from "@shared/lib/format.js";
import { defectOf, wardLabel } from "@shared/lib/roadguard.js";
import { CodeBadge, SeverityChip, StatusStamp } from "@shared/ui/marks.jsx";

function Row({ item }) {
  const d = defectOf(item.damage_type);
  return (
    <li className="grid grid-cols-[56px_minmax(0,1fr)_auto] items-center gap-x-4 py-3 sm:grid-cols-[64px_minmax(0,1fr)_auto_auto]">
      <div className="h-14 w-14 overflow-hidden rounded-xs bg-asphalt sm:h-16 sm:w-16">
        {item.image_url && <img src={mediaUrl(item.image_url)} alt="" width="64" height="64" loading="lazy" className="h-full w-full object-cover" />}
      </div>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <CodeBadge code={d?.code || item.damage_type} />
          <span className="truncate text-sm font-medium text-ink">{d?.label || item.damage_type}</span>
          <SeverityChip level={item.severity_level} showName={false} />
        </div>
        <p className="mt-1 truncate text-sm text-ink-2">
          {item.location_name || "Location shared"}
          {wardLabel(item.ward) ? <span className="text-ink-3"> · {wardLabel(item.ward)}</span> : null}
        </p>
      </div>
      <span className="hidden font-mono text-xs num text-ink-3 sm:block">{ago(item.timestamp)} ago</span>
      <StatusStamp status={item.status} />
    </li>
  );
}

function Skeleton() {
  return (
    <ul aria-hidden="true" className="divide-y divide-line">
      {Array.from({ length: 5 }, (_, i) => (
        <li key={i} className="grid grid-cols-[64px_1fr] items-center gap-4 py-3">
          <div className="h-16 w-16 animate-pulse rounded-xs bg-paper-3" />
          <div className="space-y-2">
            <div className="h-3 w-2/5 animate-pulse bg-paper-3" />
            <div className="h-3 w-3/5 animate-pulse bg-paper-3" />
          </div>
        </li>
      ))}
    </ul>
  );
}

export default function Ledger() {
  const feed = useApi("/public/feed?limit=6", { refreshMs: 30000 });
  const stats = useApi("/public/stats", { refreshMs: 30000 });
  const s = stats.data;
  const offline = feed.error && !feed.data;

  return (
    <section id="ledger" className="scroll-mt-6 border-t border-line bg-paper-2" aria-labelledby="ledger-title">
      <div className="mx-auto max-w-[1240px] px-4 py-24 sm:px-6 lg:py-32">
        <div className="grid gap-12 lg:grid-cols-12">
          <div className="lg:col-span-4">
            <p className="label text-ink-3">CH 0+750 · The public ledger</p>
            <h2 id="ledger-title" className="mt-6 font-display text-5xl font-extrabold leading-[0.95] sm:text-6xl">Nothing quietly closes</h2>
            <p className="mt-5 text-lg text-ink-2">
              Every report stays on this ledger with its photo, its ward and how long it has been open. The same list feeds the
              inspector's worklist.
            </p>
            <dl className="mt-10 grid grid-cols-2 gap-x-6 gap-y-6 border-t border-line pt-6">
              <div>
                <dt className="label text-ink-3">Reports</dt>
                <dd className="mt-1 font-display text-4xl font-bold num">{s ? number(s.total_reports) : "—"}</dd>
              </div>
              <div>
                <dt className="label text-ink-3">Fixed</dt>
                <dd className="mt-1 font-display text-4xl font-bold num">{s ? number(s.fixed) : "—"}</dd>
              </div>
              <div>
                <dt className="label text-ink-3">Reports acted on</dt>
                <dd className="mt-1 font-display text-4xl font-bold num">{s ? `${Math.round(s.performance_score)}%` : "—"}</dd>
              </div>
              <div>
                <dt className="label text-ink-3">Open repair backlog</dt>
                <dd className="mt-1 font-display text-4xl font-bold num">{s ? rupees(s.backlog_cost ?? s.total_estimated_cost, { compact: true }) : "—"}</dd>
              </div>
            </dl>
          </div>

          <div className="lg:col-span-8">
            <div className="flex items-end justify-between border-b-[3px] border-ink pb-2">
              <h3 className="sign text-xl">Latest reports</h3>
              <span className="font-mono text-xs text-ink-3">{offline ? "offline" : feed.loading ? "loading" : "live · refreshes every 30 s"}</span>
            </div>
            {feed.loading && !feed.data ? (
              <Skeleton />
            ) : offline ? (
              <div className="border-b border-line py-10">
                <p className="sign text-2xl">The ledger is offline</p>
                <p className="mt-2 max-w-[52ch] text-sm text-ink-2">
                  The RoadGuard server isn't answering, so there are no live reports to show. Start everything with
                  <span className="mx-1 rounded-xs bg-paper-3 px-1.5 py-0.5 font-mono text-xs">RoadGuard.bat</span>
                  and this list fills in.
                </p>
                <button type="button" onClick={feed.reload} className="mt-5 inline-flex h-10 items-center gap-2 rounded-sm border border-line-strong px-3 text-sm hover:border-ink">
                  <RefreshCw className="h-4 w-4" aria-hidden="true" /> Try again
                </button>
              </div>
            ) : feed.data?.items?.length ? (
              <ul className="divide-y divide-line border-b border-line">
                {feed.data.items.map((item) => <Row key={item.id} item={item} />)}
              </ul>
            ) : (
              <p className="border-b border-line py-10 text-ink-2">No reports yet. The first one you file will appear here.</p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
