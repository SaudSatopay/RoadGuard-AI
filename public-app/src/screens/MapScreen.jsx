import { lazy, Suspense, useMemo, useState } from "react";
import { ThumbsUp, X } from "lucide-react";
import { CodeBadge, SeverityChip, StatusStamp } from "@shared/ui/marks.jsx";
import { api, mediaUrl, useApi } from "@shared/lib/api.js";
import { ago, number } from "@shared/lib/format.js";
import { defectOf, wardLabel } from "@shared/lib/roadguard.js";
import { hasVoted, rememberVote } from "../session.js";
import { ErrorNote } from "../ui.jsx";

const RoadMap = lazy(() => import("@shared/ui/RoadMap.jsx"));

const FILTERS = [["open", "Open"], ["fixed", "Fixed"], ["all", "All"]];

function Sheet({ report, onClose }) {
  const [votes, setVotes] = useState(report.upvotes);
  const [voted, setVoted] = useState(hasVoted(report.id));
  const [error, setError] = useState(null);
  const d = defectOf(report.class_key || report.damage_type);

  async function vote() {
    setError(null);
    setVoted(true);
    setVotes((v) => v + 1);
    try {
      const res = await api(`/public/reports/${encodeURIComponent(report.id)}/upvote`, { method: "POST" });
      setVotes(res.upvotes);
      rememberVote(report.id);
    } catch (err) {
      setVoted(false);
      setVotes((v) => v - 1);
      setError(err);
    }
  }

  return (
    <div className="absolute inset-x-0 bottom-0 z-[1100] rounded-t-md border-t border-line bg-sheet p-4 shadow-sheet" role="dialog" aria-label={`Report ${report.id}`}>
      <div className="flex items-start gap-3">
        <div className="h-20 w-20 shrink-0 overflow-hidden rounded-xs bg-asphalt">
          {report.image_url && <img src={mediaUrl(report.image_url)} alt="" className="h-full w-full object-cover" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2"><CodeBadge code={d?.code} /><SeverityChip level={report.severity_level} showName={false} /><StatusStamp status={report.status} /></div>
          <p className="mt-1.5 font-medium leading-snug">{report.location_name || "Reported location"}</p>
          <p className="text-xs text-ink-3">{[wardLabel(report.ward), `reported ${ago(report.timestamp)} ago`].filter(Boolean).join(" · ")}</p>
        </div>
        <button type="button" onClick={onClose} className="-mr-1 -mt-1 inline-flex h-10 w-10 items-center justify-center rounded-sm active:bg-paper-3" aria-label="Close">
          <X className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>
      {report.description && <p className="mt-3 text-sm text-ink-2">{report.description}</p>}
      <div className="mt-4 flex items-center justify-between gap-3">
        <p className="text-sm text-ink-2"><b className="font-mono num text-ink">{number(votes)}</b> {votes === 1 ? "person has" : "people have"} seen this</p>
        {report.status !== "fixed" && (
          <button type="button" onClick={vote} disabled={voted} aria-pressed={voted}
            className={`inline-flex h-11 items-center gap-2 rounded-sm px-4 text-sm font-medium ${voted ? "border border-line-strong text-ink-3" : "bg-ink text-paper"}`}>
            <ThumbsUp className="h-4 w-4" aria-hidden="true" /> {voted ? "Counted" : "I've seen this too"}
          </button>
        )}
      </div>
      {error && <div className="mt-3"><ErrorNote error={error} title="Your vote didn't go through" /></div>}
    </div>
  );
}

export default function MapScreen() {
  const { data, error, loading, reload } = useApi("/public/reports/map", { refreshMs: 30000 });
  const [filter, setFilter] = useState("open");
  const [selected, setSelected] = useState(null);
  const reports = useMemo(() => (data?.reports || []).filter((r) => (filter === "all" ? true : filter === "fixed" ? r.status === "fixed" : r.status !== "fixed")), [data, filter]);
  const points = reports.map((r) => ({ id: r.id, lat: r.latitude, lng: r.longitude, level: r.severity_level, status: r.status, label: r.location_name }));
  const sel = reports.find((r) => r.id === selected);

  return (
    <div className="relative h-[calc(100dvh-54px-64px)]">
      <div className="absolute inset-x-0 top-0 z-[1050] flex items-center justify-between gap-2 bg-gradient-to-b from-paper via-paper/90 to-transparent px-4 pb-6 pt-3">
        <div role="radiogroup" aria-label="Show" className="inline-flex rounded-sm border border-line-strong bg-sheet p-0.5">
          {FILTERS.map(([k, l]) => (
            <button key={k} type="button" role="radio" aria-checked={filter === k} onClick={() => { setFilter(k); setSelected(null); }}
              className={`h-9 rounded-xs px-3 text-sm ${filter === k ? "bg-ink text-paper" : "text-ink-2"}`}>{l}</button>
          ))}
        </div>
        <span className="font-mono text-xs num text-ink-3">{loading && !data ? "loading" : `${reports.length} shown`}</span>
      </div>
      {error && !data ? (
        <div className="px-4 pt-20"><ErrorNote error={error} onRetry={reload} title="The map couldn't load reports" /></div>
      ) : (
        <Suspense fallback={<div className="h-full animate-pulse bg-paper-3" />}>
          <RoadMap className="h-full rounded-none border-0" zoomControl={false} points={points} selected={selected} onSelect={setSelected} label="Reported road damage near you" />
        </Suspense>
      )}
      {sel && <Sheet key={sel.id} report={sel} onClose={() => setSelected(null)} />}
    </div>
  );
}
