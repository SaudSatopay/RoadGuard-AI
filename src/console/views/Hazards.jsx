import { lazy, Suspense, useMemo, useState } from "react";
import { ArrowLeft, Map as MapIcon, Search, ThumbsUp } from "lucide-react";
import MarkedPhoto from "@shared/ui/MarkedPhoto.jsx";
import { CodeBadge, SeverityChip, StatusStamp } from "@shared/ui/marks.jsx";
import { api, mediaUrl } from "@shared/lib/api.js";
import { ago, coords, dateLabel, dateTimeLabel, number, rupees } from "@shared/lib/format.js";
import { navigate, useSearchParams } from "@shared/lib/router.js";
import { defectOf, LEVELS, STATUS_FLOW, STATUSES, wardLabel } from "@shared/lib/roadguard.js";
import ComplaintLetter from "../ComplaintLetter.jsx";
import ErrorBoundary from "@shared/ui/ErrorBoundary.jsx";
import { nextStatus, useHazards } from "../data.js";
import { Button, Empty, ErrorState, Loading, PageHead, SectionHead, Segmented, Spinner } from "../ui.jsx";

const RoadMap = lazy(() => import("@shared/ui/RoadMap.jsx"));

const FILTERS = [
  { value: "open", label: "Open" },
  { value: "in_progress", label: "With crews" },
  { value: "fixed", label: "Fixed" },
  { value: "all", label: "All" },
];
const NEXT_LABEL = { acknowledged: "Acknowledge", in_progress: "Assign a crew", fixed: "Mark fixed" };

function select(id) {
  navigate(id ? `/console/hazards?h=${encodeURIComponent(id)}` : "/console/hazards", { scroll: false });
}

function HazardRow({ h, selected }) {
  const d = defectOf(h.worst?.class_key || h.damage_types?.[0]);
  return (
    <li>
      <button type="button" onClick={() => select(h.hazard_id)} aria-current={selected ? "true" : undefined}
        className={`grid w-full grid-cols-[48px_minmax(0,1fr)_auto] items-center gap-x-3 px-2 py-2.5 text-left transition-colors duration-150 ${selected ? "bg-paint-wash" : "[@media(hover:hover)]:hover:bg-paper-2"}`}>
        <span className="h-12 w-12 overflow-hidden rounded-xs bg-asphalt">
          {h.image_url && <img src={mediaUrl(h.image_url)} alt="" width="48" height="48" loading="lazy" className="h-full w-full object-cover" />}
        </span>
        <span className="min-w-0">
          <span className="flex items-center gap-2">
            <CodeBadge code={d?.code} />
            <span className="line-clamp-2 text-sm font-medium leading-snug">{h.worst?.location_name || h.hazard_id}</span>
          </span>
          <span className="mt-0.5 block truncate font-mono text-2xs text-ink-3">
            {h.hazard_id} · {wardLabel(h.ward) ? `${wardLabel(h.ward)} · ` : ""}{h.report_count} report{h.report_count === 1 ? "" : "s"}
          </span>
        </span>
        <span className="flex flex-col items-end gap-1">
          <SeverityChip level={h.worst_level} showName={false} />
          <StatusStamp status={h.status} />
          {h.days_open != null && <span className="font-mono text-2xs num text-ink-3">{Math.floor(h.days_open)} d open</span>}
        </span>
      </button>
    </li>
  );
}

function Stepper({ status }) {
  const step = STATUSES[status]?.step ?? 0;
  return (
    <ol className="grid grid-cols-4 gap-1" aria-label="Repair progress">
      {STATUS_FLOW.map((s, i) => (
        <li key={s} className="min-w-0">
          <div className={`h-1.5 ${i <= step ? (s === "fixed" && step === 3 ? "bg-ok" : "bg-ink") : "bg-paper-3"}`} />
          <p className={`mt-1 truncate text-2xs ${i === step ? "font-semibold text-ink" : "text-ink-3"}`} aria-current={i === step ? "step" : undefined}>{STATUSES[s].label}</p>
        </li>
      ))}
    </ol>
  );
}

function StatusActions({ hazard, onChanged }) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const next = nextStatus(hazard.status);
  const target = hazard.worst?.id || hazard.report_ids?.[0];

  async function update(status) {
    setBusy(status);
    setError(null);
    try {
      await api(`/admin/reports/${encodeURIComponent(target)}/status`, {
        method: "PATCH",
        form: { status, note: note || `${STATUSES[status].label} from the inspector console`, propagate: true },
      });
      setNote("");
      onChanged();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-3">
      <Stepper status={hazard.status} />
      <label className="block">
        <span className="sr-only">Note for the status history</span>
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional): crew, work order"
          className="h-10 w-full rounded-xs border border-line-strong bg-sheet px-3 text-sm placeholder:text-ink-3" />
      </label>
      <div className="flex flex-wrap gap-2">
        {next && (
          <Button variant={next === "fixed" ? "paint" : "ink"} onClick={() => update(next)} disabled={Boolean(busy)}>
            {busy === next ? <Spinner /> : null} {NEXT_LABEL[next]}
          </Button>
        )}
        {hazard.status !== "submitted" && (
          <Button variant="ghost" onClick={() => update("submitted")} disabled={Boolean(busy)}>{busy === "submitted" ? <Spinner /> : null} Reopen</Button>
        )}
      </div>
      {hazard.report_count > 1 && <p className="text-xs text-ink-3">Applies to all {hazard.report_count} merged reports.</p>}
      {error && <ErrorState error={error} title="Status not changed" />}
    </div>
  );
}

function Detail({ hazard, onChanged }) {
  const r = hazard.worst;
  const d = defectOf(r?.class_key || hazard.damage_types?.[0]);
  const history = [...(r?.status_history || [])].sort((a, b) => new Date(b.time) - new Date(a.time));
  return (
    <div className="space-y-6">
      <button type="button" onClick={() => select(null)} className="inline-flex items-center gap-1.5 text-sm text-ink-2 hover:text-ink">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> All hazards
      </button>
      <div>
        <p className="font-mono text-xs num text-ink-3">{hazard.hazard_id} · first reported {dateLabel(hazard.first_reported)}</p>
        <h2 className="mt-1 font-display text-4xl font-extrabold leading-none">{d?.label || "Road damage"}</h2>
        <p className="mt-2 text-sm text-ink-2">
          {r?.location_name}
          {hazard.ward?.code && hazard.ward.code !== "—" ? ` · ${hazard.ward.authority === "MCGM" ? `Ward ${hazard.ward.code} (${hazard.ward.name})` : wardLabel(hazard.ward)}` : ""}
        </p>
        <p className="mt-1 font-mono text-2xs num text-ink-3">{coords(hazard.latitude, hazard.longitude)}{r?.authority ? ` · ${typeof r.authority === "string" ? r.authority : r.authority.name || ""}` : ""}</p>
      </div>
      {r?.image_url && r?.image?.width ? (
        <MarkedPhoto src={mediaUrl(r.image_url)} width={r.image.width} height={r.image.height} detections={r.detections || []} mode="marks" alt={`Report photo for ${hazard.hazard_id}`} />
      ) : r?.image_url ? (
        <img src={mediaUrl(r.image_url)} alt={`Report photo for ${hazard.hazard_id}`} className="w-full rounded-md" />
      ) : null}

      <dl className="grid grid-cols-3 gap-px border-y border-line bg-line [&>div]:bg-paper [&>div]:py-3">
        <div className="pr-3"><dt className="label text-ink-3">Severity</dt><dd className="mt-1.5"><SeverityChip level={hazard.worst_level} score={hazard.worst_severity} /></dd><dd className="mt-1 font-mono text-xs num text-ink-3">{number(hazard.worst_severity, 1)} / 100</dd></div>
        <div className="px-3"><dt className="label text-ink-3">Estimate</dt><dd className="mt-1 font-display text-2xl font-bold num">{rupees(r?.cost_estimated)}</dd><dd className="truncate text-xs text-ink-3">{r?.repair_method}</dd></div>
        <div className="pl-3"><dt className="label text-ink-3">Open for</dt><dd className="mt-1 font-display text-2xl font-bold num">{hazard.days_open != null ? `${Math.floor(hazard.days_open)} d` : "—"}</dd><dd className="text-xs text-ink-3">target {LEVELS[hazard.worst_level]?.fix_days} d</dd></div>
      </dl>

      <section aria-labelledby="status-h"><SectionHead title={<span id="status-h">Repair status</span>} /><div className="mt-3"><StatusActions hazard={hazard} onChanged={onChanged} /></div></section>

      <section aria-labelledby="reports-h">
        <SectionHead title={<span id="reports-h">Citizen reports</span>} note={hazard.report_count > 1 ? `merged within ${25} m` : undefined} />
        <ul className="divide-y divide-line">
          {hazard.reports.map((rep) => (
            <li key={rep.id} className="py-2.5 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{rep.reporter || "Citizen"}</span>
                <span className="flex items-center gap-3 font-mono text-2xs num text-ink-3"><span className="inline-flex items-center gap-1"><ThumbsUp className="h-3 w-3" aria-hidden="true" />{rep.upvotes}</span>{ago(rep.timestamp)} ago · {rep.id}</span>
              </div>
              {rep.description && <p className="mt-0.5 text-ink-2">{rep.description}</p>}
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="letter-h"><SectionHead title={<span id="letter-h">Complaint letter</span>} /><div className="mt-3"><ComplaintLetter key={r?.id} reportId={r?.id} /></div></section>

      {history.length > 0 && (
        <section aria-labelledby="history-h">
          <SectionHead title={<span id="history-h">History</span>} />
          <ol className="mt-2 space-y-2">
            {history.map((h, i) => (
              <li key={`${h.time}-${i}`} className="grid grid-cols-[7.5rem_1fr] gap-3 text-sm">
                <span className="font-mono text-2xs num text-ink-3">{dateTimeLabel(h.time)}</span>
                <span><StatusStamp status={h.status} /> <span className="ml-1 text-ink-2">{h.note}</span></span>
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}

export default function Hazards() {
  const params = useSearchParams();
  const selectedId = params.get("h");
  const { hazards, loading, error, reload, meta } = useHazards();
  const [filter, setFilter] = useState("open");
  const [query, setQuery] = useState("");
  const [showMap, setShowMap] = useState(false);

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return hazards
      .filter((h) => (filter === "all" ? true : filter === "open" ? h.status !== "fixed" : filter === "in_progress" ? h.status === "in_progress" || h.status === "acknowledged" : h.status === "fixed"))
      .filter((h) => !q || [h.hazard_id, h.worst?.location_name, h.ward?.code, h.ward?.name].some((v) => v && String(v).toLowerCase().includes(q)))
      .sort((a, b) => b.priority - a.priority || new Date(b.last_reported) - new Date(a.last_reported));
  }, [hazards, filter, query]);
  const selected = hazards.find((h) => h.hazard_id === selectedId);
  const points = hazards.map((h) => ({ id: h.hazard_id, lat: h.latitude, lng: h.longitude, level: h.worst_level, status: h.status, count: h.report_count, label: [h.hazard_id, h.worst?.location_name].filter(Boolean).join(" · ") }));

  return (
    <div className="space-y-6">
      <PageHead title="Hazards" sub={meta ? `${number(meta.total)} hazards from ${number(hazards.reduce((s, h) => s + h.report_count, 0))} reports · ${number(meta.duplicates_merged)} duplicates merged (DBSCAN, ${meta.eps_m} m)` : "Citizen reports merged into hazards"}>
        <Button variant="outline" className="xl:hidden" onClick={() => setShowMap((v) => !v)} aria-pressed={showMap}>
          <MapIcon className="h-4 w-4" aria-hidden="true" /> {showMap ? "Hide map" : "Show map"}
        </Button>
      </PageHead>
      {error && !hazards.length ? <ErrorState error={error} onRetry={reload} title="Couldn't load hazards" /> : null}
      <div className="grid gap-6 xl:grid-cols-12">
        <div className={`${showMap ? "block" : "hidden"} xl:col-span-7 xl:block`}>
          <div className="xl:sticky xl:top-8">
            <ErrorBoundary name="map" title="The map didn't load">
              <Suspense fallback={<div className="h-[60vh] animate-pulse rounded-md bg-paper-3" />}>
                <RoadMap className="h-[52vh] xl:h-[calc(100dvh-180px)]" points={points} selected={selectedId} onSelect={select} />
              </Suspense>
            </ErrorBoundary>
          </div>
        </div>
        <div className="xl:col-span-5">
          {selected ? (
            <ErrorBoundary key={selected.hazard_id} name="hazard detail" title="This hazard couldn't be shown">
              <Detail hazard={selected} onChanged={reload} />
            </ErrorBoundary>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Segmented label="Filter by status" value={filter} onChange={setFilter} options={FILTERS} size="sm" />
                <label className="relative ml-auto min-w-[12rem] flex-1">
                  <span className="sr-only">Search hazards</span>
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" aria-hidden="true" />
                  <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search place, ward or ID"
                    className="h-9 w-full rounded-xs border border-line-strong bg-sheet pl-8 pr-3 text-sm placeholder:text-ink-3" />
                </label>
              </div>
              {loading ? <Loading label="Loading hazards" rows={6} /> : list.length ? (
                <ul className="divide-y divide-line border-y border-line">{list.map((h) => <HazardRow key={h.hazard_id} h={h} selected={h.hazard_id === selectedId} />)}</ul>
              ) : (
                <Empty title={query ? "No match" : "Nothing here"}>{query ? `No hazard matches “${query}”.` : "No hazards in this view. Try another filter."}</Empty>
              )}
              {selectedId && !selected && !loading && <p className="text-sm text-ink-2">Hazard {selectedId} isn't in the current data.</p>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
