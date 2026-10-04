// Small brand primitives: defect glyphs and code badges, severity chips, status stamps, the RoadGuard mark.
import { defectOf, LEVELS, STATUSES } from "../lib/roadguard.js";

const GLYPHS = {
  // Longitudinal crack: runs along the road
  D00: "M8 1.5 L7 4.5 L9 7 L7.2 10 L8.6 14.5",
  // Transverse crack: runs across the road
  D10: "M1.5 8 L4.5 7 L7 9 L10 7.2 L14.5 8.6",
  // Alligator crack: interconnected cells
  D20: "M2 5 L6 2.5 L10.5 4 L14 2.5 M2 5 L3 10 L7.5 8 L6 2.5 M7.5 8 L10.5 4 L13.5 8.5 L10 12.5 L7.5 8 M3 10 L5.5 14 L10 12.5",
  // Pothole: a bowl in the surface
  D40: "M2.5 9 C2.5 5.5 5.5 4 8.5 4.2 C11.8 4.4 13.8 6.3 13.4 9 C13 11.7 10.6 12.8 7.8 12.6 C4.8 12.4 2.5 11.6 2.5 9 Z M5.5 9.2 C6.6 8.1 9 7.9 10.5 9.1",
};

export function DefectGlyph({ code, size = 16, className = "", title }) {
  const d = defectOf(code);
  const path = d ? GLYPHS[d.code] : GLYPHS.D40;
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"
      strokeLinecap="round" strokeLinejoin="round" className={className} role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true} aria-label={title}>
      <path d={path} />
    </svg>
  );
}

export function CodeBadge({ code, withLabel = false, className = "" }) {
  const d = defectOf(code);
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap ${className}`}>
      <span className="inline-flex items-center gap-1 rounded-xs border border-line-strong px-1.5 py-0.5 font-mono text-2xs font-medium num text-ink-2">
        <DefectGlyph code={code} size={12} />
        {d ? d.code : "—"}
      </span>
      {withLabel && <span className="text-ink">{d ? d.label : "Unclassified"}</span>}
    </span>
  );
}

const CHIP = {
  S1: "border border-ink-3 text-ink",
  S2: "border border-paint-deep text-paint-ink bg-paint-wash hatch-soft",
  S3: "bg-paint text-paint-ink",
  S4: "bg-crit text-white",
};

export function SeverityChip({ level, score, showName = true, className = "" }) {
  const meta = LEVELS[level] || LEVELS.S1;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-xs px-1.5 py-0.5 font-mono text-2xs font-semibold num whitespace-nowrap ${CHIP[meta.level]} ${className}`}
      title={score != null ? `Severity ${Number(score).toFixed(1)} / 100` : undefined}
    >
      {meta.level}
      {showName && <span className="font-sans font-medium tracking-normal">{meta.name}</span>}
    </span>
  );
}

const STAMP = {
  submitted: "border-ink text-ink",
  acknowledged: "border-info text-info",
  in_progress: "border-info bg-info text-white",
  fixed: "border-ok bg-ok text-white",
};

export function StatusStamp({ status, className = "" }) {
  const meta = STATUSES[status] || STATUSES.submitted;
  return (
    <span className={`inline-flex items-center rounded-xs border-[1.5px] px-1.5 py-[1px] sign text-xs leading-tight whitespace-nowrap ${STAMP[meta.key]} ${className}`}>
      {meta.label}
    </span>
  );
}

/** The RoadGuard mark: an asphalt plate with an inspector's paint ring. */
export function RoadGuardMark({ size = 28, className = "" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" className={className} aria-hidden="true">
      <rect x="0.5" y="0.5" width="31" height="31" rx="5" fill="var(--color-asphalt)" />
      <path d="M2 26.5h28" stroke="var(--color-chalk)" strokeWidth="1.6" strokeDasharray="3.5 3" opacity="0.55" />
      <path
        d="M9.2 15.6c-.4-4.1 3.2-7.2 7.6-7.1 4.6.1 7.6 3 7.2 6.9-.4 3.8-3.9 6-8 5.9-4.1-.1-6.5-2.1-6.8-5.1 0-1.7.9-3.2 2.2-4.2"
        fill="none" stroke="var(--color-paint)" strokeWidth="2.6" strokeLinecap="round"
      />
      <path d="M22.8 6.2l1.6 2.6" stroke="var(--color-paint)" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function Wordmark({ size = "md", tone = "ink", className = "" }) {
  const text = size === "lg" ? "text-3xl" : size === "sm" ? "text-lg" : "text-xl";
  const mark = size === "lg" ? 38 : size === "sm" ? 22 : 28;
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <RoadGuardMark size={mark} />
      <span className={`sign ${text} leading-none tracking-[0.02em] ${tone === "chalk" ? "text-chalk" : "text-ink"}`}>
        RoadGuard{" "}
        <span className="ml-0.5 inline-block translate-y-[-0.08em] rounded-xs bg-paint px-1 text-[0.62em] leading-[1.25] text-paint-ink align-middle">AI</span>
      </span>
    </span>
  );
}
