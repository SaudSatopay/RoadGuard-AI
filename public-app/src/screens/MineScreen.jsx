import { useMemo, useState } from "react";
import { ArrowLeft, Camera } from "lucide-react";
import MarkedPhoto from "@shared/ui/MarkedPhoto.jsx";
import { CodeBadge, SeverityChip, StatusStamp } from "@shared/ui/marks.jsx";
import { mediaUrl, useApi } from "@shared/lib/api.js";
import { ago, dateTimeLabel } from "@shared/lib/format.js";
import { defectOf, STATUS_FLOW, STATUSES, wardLabel } from "@shared/lib/roadguard.js";
import { ErrorNote, PrimaryButton, ScreenHead, Skeleton } from "../ui.jsx";

function Progress({ status }) {
  const step = STATUSES[status]?.step ?? 0;
  return (
    <div className="grid grid-cols-4 gap-1" aria-label={`Progress: ${STATUSES[status]?.label}`}>
      {STATUS_FLOW.map((s, i) => <div key={s} className={`h-1 ${i <= step ? (step === 3 ? "bg-ok" : "bg-ink") : "bg-paper-3"}`} />)}
    </div>
  );
}

function Detail({ id, onBack }) {
  const { data, error, loading } = useApi(`/public/reports/${encodeURIComponent(id)}`);
  const d = defectOf(data?.detections?.[0]?.code);
  const history = [...(data?.status_history || [])].sort((a, b) => new Date(b.time) - new Date(a.time));
  return (
    <div className="space-y-5 px-4 pb-8 pt-4">
      <button type="button" onClick={onBack} className="-ml-2 inline-flex h-10 items-center gap-1.5 rounded-sm px-2 text-sm text-ink-2 active:bg-paper-3">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> My reports
      </button>
      {loading && !data ? <Skeleton rows={3} /> : error ? <ErrorNote error={error} /> : data && (
        <>
          <div>
            <p className="font-mono text-xs text-ink-3">{data.id}{data.hazard_id ? ` · hazard ${data.hazard_id}` : ""}</p>
            <h2 className="mt-1 font-display text-4xl font-extrabold leading-none">{d?.label || "Road damage"}</h2>
            <p className="mt-1 text-sm text-ink-2">{[data.location?.name, wardLabel(data.ward)].filter(Boolean).join(" · ")}</p>
          </div>
          {data.image_url && data.image?.width ? (
            <MarkedPhoto src={mediaUrl(data.image_url)} width={data.image.width} height={data.image.height} detections={data.detections || []} mode="marks" notes="compact" alt="Your report photo with the damage marked" />
          ) : null}
          <div className="space-y-2">
            <div className="flex items-center justify-between"><StatusStamp status={data.status} /><span className="text-xs text-ink-3">{ago(data.timestamp)} ago</span></div>
            <Progress status={data.status} />
          </div>
          <ol className="space-y-2 border-t border-line pt-3">
            {history.map((h, i) => (
              <li key={`${h.time}-${i}`} className="grid grid-cols-[6.5rem_1fr] gap-2 text-sm">
                <span className="font-mono text-2xs num text-ink-3">{dateTimeLabel(h.time)}</span>
                <span><b className="font-medium">{STATUSES[h.status]?.label}</b> <span className="text-ink-2">{h.note}</span></span>
              </li>
            ))}
          </ol>
        </>
      )}
    </div>
  );
}

export default function MineScreen({ user, onReport }) {
  const { data, error, loading, reload } = useApi("/public/reports/map", { refreshMs: 30000 });
  const [open, setOpen] = useState(null);
  const mine = useMemo(() => (data?.reports || []).filter((r) => (r.reporter || "").trim().toLowerCase() === (user?.name || "").trim().toLowerCase())
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)), [data, user]);

  if (open) return <Detail id={open} onBack={() => setOpen(null)} />;
  return (
    <div className="pb-8">
      <ScreenHead title="My reports" sub={mine.length ? `${mine.length} filed · ${mine.filter((r) => r.status === "fixed").length} fixed` : undefined} />
      {loading && !data ? <Skeleton /> : error && !data ? (
        <div className="px-4"><ErrorNote error={error} onRetry={reload} title="Couldn't load your reports" /></div>
      ) : mine.length ? (
        <ul className="divide-y divide-line border-y border-line">
          {mine.map((r) => {
            const d = defectOf(r.class_key || r.damage_type);
            return (
              <li key={r.id}>
                <button type="button" onClick={() => setOpen(r.id)} className="grid w-full grid-cols-[64px_1fr] gap-3 px-4 py-3 text-left active:bg-paper-2">
                  <span className="h-16 w-16 overflow-hidden rounded-xs bg-asphalt">{r.image_url && <img src={mediaUrl(r.image_url)} alt="" className="h-full w-full object-cover" />}</span>
                  <span className="min-w-0 space-y-1.5">
                    <span className="flex items-center gap-2"><CodeBadge code={d?.code} /><SeverityChip level={r.severity_level} showName={false} /><span className="ml-auto text-xs text-ink-3">{ago(r.timestamp)}</span></span>
                    <span className="block truncate text-sm font-medium">{r.location_name || "Reported location"}</span>
                    <Progress status={r.status} />
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="space-y-4 px-4 pt-6">
          <p className="font-display text-3xl font-bold leading-none">Nothing reported yet</p>
          <p className="text-sm text-ink-2">Your reports show up here with their repair status, from Open to Fixed.</p>
          <PrimaryButton onClick={onReport}><Camera className="h-5 w-5" aria-hidden="true" /> Report a road</PrimaryButton>
        </div>
      )}
    </div>
  );
}
