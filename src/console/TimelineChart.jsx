// Reported vs fixed per day, drawn to scale. Ink bars for new reports, paint bars for repairs.
import { useMemo, useState } from "react";

export default function TimelineChart({ days = [], height = 150 }) {
  const [hover, setHover] = useState(null);
  const max = useMemo(() => Math.max(1, ...days.map((d) => Math.max(d.reported || 0, d.fixed || 0))), [days]);
  if (!days.length) return null;
  const W = 600;
  const H = height;
  const pad = { l: 22, r: 4, t: 8, b: 22 };
  const slot = (W - pad.l - pad.r) / days.length;
  const bw = Math.max(2, slot * 0.34);
  const y = (v) => H - pad.b - (v / max) * (H - pad.t - pad.b);
  const ticks = max <= 4 ? Array.from({ length: max + 1 }, (_, i) => i) : [0, Math.round(max / 2), max];
  const totals = days.reduce((a, d) => ({ reported: a.reported + (d.reported || 0), fixed: a.fixed + (d.fixed || 0) }), { reported: 0, fixed: 0 });
  const h = hover != null ? days[hover] : null;

  return (
    <figure className="m-0">
      <div className="mb-2 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-ink-2">
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 bg-ink" aria-hidden="true" /> Reported <b className="font-mono num">{totals.reported}</b></span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 bg-paint-deep" aria-hidden="true" /> Fixed <b className="font-mono num">{totals.fixed}</b></span>
        <span className="ml-auto font-mono text-2xs text-ink-3">{h ? `${h.date}: ${h.reported} reported, ${h.fixed} fixed` : `${days.length} days`}</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label={`Last ${days.length} days: ${totals.reported} reports filed, ${totals.fixed} repairs completed.`}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke="var(--color-line)" strokeWidth="1" />
            <text x={pad.l - 6} y={y(t) + 3} textAnchor="end" fontSize="9" fontFamily="var(--font-mono)" fill="var(--color-ink-3)">{t}</text>
          </g>
        ))}
        {days.map((d, i) => {
          const x = pad.l + i * slot + slot / 2;
          return (
            <g key={d.date} onPointerEnter={() => setHover(i)} onPointerLeave={() => setHover(null)}>
              <rect x={x - slot / 2} y={pad.t} width={slot} height={H - pad.t - pad.b} fill={hover === i ? "var(--color-paper-3)" : "transparent"} />
              {d.reported > 0 && <rect x={x - bw - 0.5} y={y(d.reported)} width={bw} height={H - pad.b - y(d.reported)} fill="var(--color-ink)" />}
              {d.fixed > 0 && <rect x={x + 0.5} y={y(d.fixed)} width={bw} height={H - pad.b - y(d.fixed)} fill="var(--color-paint-deep)" />}
              {i % 7 === 0 && (
                <text x={x} y={H - 6} textAnchor="middle" fontSize="9" fontFamily="var(--font-mono)" fill="var(--color-ink-3)">
                  {new Date(d.date).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                </text>
              )}
            </g>
          );
        })}
        <line x1={pad.l} x2={W - pad.r} y1={H - pad.b} y2={H - pad.b} stroke="var(--color-ink)" strokeWidth="1.2" />
      </svg>
    </figure>
  );
}
