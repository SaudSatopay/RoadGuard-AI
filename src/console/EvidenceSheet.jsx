// The evidence sheet: what the detector found, why each defect scored what it did, and what it costs.
import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { conf, number, rupees } from "@shared/lib/format.js";
import { CodeBadge, SeverityChip } from "@shared/ui/marks.jsx";

function FactorBars({ factors = [] }) {
  if (!factors.length) return null;
  return (
    <div className="space-y-1.5">
      {factors.map((f) => (
        <div key={f.key || f.label} className="grid grid-cols-[7.5rem_1fr_3.5rem] items-center gap-2 text-xs">
          <span className="truncate text-ink-2" title={f.detail}>{f.label}</span>
          <span className="relative h-2 bg-paper-3" aria-hidden="true">
            <span className="absolute inset-y-0 left-0 bg-ink-3" style={{ width: `${(f.weight || 0) * 100 * 2.5}%` }} />
            <span className="absolute inset-y-0 left-0 bg-ink" style={{ width: `${(f.points || 0) * 2.5}%` }} />
          </span>
          <span className="text-right font-mono num text-ink">{number(f.points, 1)}<span className="text-ink-3">/{Math.round((f.weight || 0) * 100)}</span></span>
        </div>
      ))}
    </div>
  );
}

function DefectRow({ d, open, onToggle, active, onHover }) {
  const g = d.geometry;
  const c = d.cost || {};
  const f = d.forecast?.prediction;
  return (
    <li className={`border-b border-line ${active ? "bg-paper-2" : ""}`} onPointerEnter={() => onHover?.(d.id)} onPointerLeave={() => onHover?.(null)}>
      <button type="button" onClick={onToggle} aria-expanded={open}
        className="grid w-full grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-x-3 py-2.5 text-left">
        <CodeBadge code={d.code} />
        <span className="min-w-0 truncate text-sm">
          <span className="font-medium">{d.label}</span>
          <span className="ml-2 font-mono text-xs num text-ink-3">conf {conf(d.confidence)}</span>
        </span>
        <SeverityChip level={d.severity_level} score={d.severity} showName={false} />
        <ChevronDown className={`h-4 w-4 text-ink-3 transition-transform duration-200 ${open ? "rotate-180" : ""}`} aria-hidden="true" />
      </button>
      {open && (
        <div className="space-y-4 pb-4 pl-1">
          <div>
            <p className="label mb-2 text-ink-3">Severity {number(d.severity, 1)} / 100 · {d.severity_name || d.severity_level}</p>
            <FactorBars factors={d.severity_factors} />
            {d.explanation?.recommendation && <p className="mt-2 text-xs text-ink-2">{d.explanation.recommendation}</p>}
          </div>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            {g && (
              <>
                <div><dt className="label text-ink-3">Crack length</dt><dd className="font-mono num">≈ {number(g.length_m, 1)} m <span className="text-xs text-ink-3">({number(g.length_px)} px)</span></dd></div>
                <div><dt className="label text-ink-3">Crack coverage</dt><dd className="font-mono num">{number(g.mask_coverage_pct, 1)}% of box</dd></div>
              </>
            )}
            <div><dt className="label text-ink-3">Repair</dt><dd>{c.repair_method || d.repair || "—"}</dd></div>
            <div><dt className="label text-ink-3">Crew · time</dt><dd className="font-mono num">{c.crew_size ? `${c.crew_size} people` : "—"} · {c.repair_time || "—"}</dd></div>
            <div><dt className="label text-ink-3">Fix now</dt><dd className="font-mono num">{rupees(c.cost_estimated)}</dd></div>
            <div><dt className="label text-ink-3">If left 6 months</dt><dd className="font-mono num text-crit">{rupees(c.cost_if_ignored)}</dd></div>
            {f && (
              <div className="col-span-2">
                <dt className="label text-ink-3">Forecast</dt>
                <dd className="text-ink-2">
                  {f.days_to_pothole > 0 ? `Likely to break into a pothole in about ${f.days_to_pothole} days` : "Already a pothole; it widens with traffic and rain"}
                  {f.monsoon_active ? " (monsoon rate)" : ""}. Worsens ≈ {number(f.worsen_per_week, 1)} points a week untreated.
                </dd>
              </div>
            )}
          </dl>
          {g?.length_basis && <p className="text-2xs text-ink-3">{g.length_basis}</p>}
        </div>
      )}
    </li>
  );
}

export default function EvidenceSheet({ result, active, onHover, header }) {
  const [openId, setOpenId] = useState(result?.detections?.[0]?.id ?? null);
  if (!result) return null;
  const s = result.summary || {};
  return (
    <div className="rounded-sm bg-sheet p-4 shadow-sheet sm:p-5 print:shadow-none">
      <div className="flex items-start justify-between gap-3 border-b-[3px] border-ink pb-2">
        <div>
          <p className="sign text-xl leading-none">Evidence sheet</p>
          <p className="mt-1 font-mono text-2xs num text-ink-3">{result.id}{result.timestamp ? ` · ${new Date(result.timestamp).toLocaleString("en-IN")}` : ""}</p>
        </div>
        {header}
      </div>
      <dl className="grid grid-cols-3 gap-px border-b border-line bg-line [&>div]:bg-sheet">
        <div className="py-3 pr-3">
          <dt className="label text-ink-3">Road condition</dt>
          <dd className="mt-1 font-display text-4xl font-bold leading-none num">{s.road_condition_index != null ? Math.round(s.road_condition_index) : "—"}<span className="text-base text-ink-3">/100</span></dd>
        </div>
        <div className="px-3 py-3">
          <dt className="label text-ink-3">Worst</dt>
          <dd className="mt-2">{s.worst_level ? <SeverityChip level={s.worst_level} /> : <span className="text-sm text-ink-3">none</span>}</dd>
        </div>
        <div className="py-3 pl-3">
          <dt className="label text-ink-3">Repair estimate</dt>
          <dd className="mt-1 font-display text-3xl font-bold leading-none num">{rupees(s.total_cost, { compact: true })}</dd>
        </div>
      </dl>
      {s.recommended_action && <p className="border-b border-line py-2.5 text-sm text-ink-2">{s.recommended_action}</p>}
      {result.detections?.length ? (
        <ol>
          {result.detections.map((d) => (
            <DefectRow key={d.id} d={d} open={openId === d.id} active={active === d.id} onHover={onHover}
              onToggle={() => setOpenId((v) => (v === d.id ? null : d.id))} />
          ))}
        </ol>
      ) : (
        <p className="py-6 text-sm text-ink-2">No potholes or cracks found at this confidence. Try a photo taken closer to the surface, or lower the threshold.</p>
      )}
      <p className="mt-3 font-mono text-2xs num text-ink-3">
        {result.model?.name} · {result.model?.runtime} · {result.inference_ms != null ? `${Math.round(result.inference_ms)} ms` : ""} · road class {result.road_class}
      </p>
    </div>
  );
}
