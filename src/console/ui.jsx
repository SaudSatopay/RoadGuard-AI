// Console building blocks: section heads, segmented controls, states, buttons. Tokens only.
import { AlertTriangle, LoaderCircle, RefreshCw } from "lucide-react";

export function PageHead({ title, sub, children }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 border-b border-line pb-4">
      <div className="min-w-0">
        <h1 className="font-display text-4xl font-extrabold leading-none sm:text-5xl">{title}</h1>
        {sub && <p className="mt-2 text-sm text-ink-2">{sub}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}

export function SectionHead({ title, note, children, className = "" }) {
  return (
    <div className={`flex items-end justify-between gap-3 border-b-[3px] border-ink pb-1.5 ${className}`}>
      <h2 className="sign text-lg leading-none">{title}</h2>
      <div className="flex items-center gap-2 font-mono text-2xs text-ink-3">
        {note}
        {children}
      </div>
    </div>
  );
}

export function Button({ variant = "ghost", size = "md", className = "", children, ...props }) {
  const base = "inline-flex items-center justify-center gap-2 rounded-sm font-medium transition-[background-color,color,border-color,transform] duration-150 ease-out active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50";
  const sizes = { sm: "h-8 px-2.5 text-sm", md: "h-10 px-3.5 text-sm", lg: "h-12 px-5 text-base" };
  const variants = {
    paint: "bg-paint text-paint-ink [@media(hover:hover)]:hover:brightness-[0.97]",
    ink: "bg-ink text-paper [@media(hover:hover)]:hover:bg-ink-2",
    outline: "border border-line-strong bg-sheet text-ink [@media(hover:hover)]:hover:border-ink",
    ghost: "text-ink-2 [@media(hover:hover)]:hover:bg-paper-3 [@media(hover:hover)]:hover:text-ink",
    danger: "border border-crit text-crit [@media(hover:hover)]:hover:bg-crit [@media(hover:hover)]:hover:text-white",
  };
  return (
    <button type="button" className={`${base} ${sizes[size]} ${variants[variant]} ${className}`} {...props}>
      {children}
    </button>
  );
}

export function Segmented({ label, value, options, onChange, size = "md", className = "" }) {
  return (
    <div role="radiogroup" aria-label={label} className={`inline-flex rounded-sm border border-line-strong bg-sheet p-0.5 ${className}`}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={`rounded-xs px-2.5 font-medium transition-colors duration-150 ${size === "sm" ? "h-7 text-xs" : "h-8 text-sm"} ${active ? "bg-ink text-paper" : "text-ink-2 [@media(hover:hover)]:hover:text-ink"}`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function Loading({ label = "Loading", rows = 4 }) {
  return (
    <div role="status" aria-label={label} className="space-y-2 py-3">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="h-10 animate-pulse bg-paper-3" style={{ opacity: 1 - i * 0.15 }} />
      ))}
      <span className="sr-only">{label}…</span>
    </div>
  );
}

export function Spinner({ className = "h-4 w-4" }) {
  return <LoaderCircle className={`animate-spin ${className}`} aria-hidden="true" />;
}

export function ErrorState({ error, onRetry, title = "Couldn't load this" }) {
  return (
    <div role="alert" className="border-l-[3px] border-crit bg-crit-wash px-4 py-3">
      <p className="flex items-center gap-2 font-medium text-ink">
        <AlertTriangle className="h-4 w-4 text-crit" aria-hidden="true" /> {title}
      </p>
      <p className="mt-1 text-sm text-ink-2">{error?.message || String(error)}</p>
      {onRetry && (
        <Button variant="outline" size="sm" className="mt-3" onClick={onRetry}>
          <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" /> Try again
        </Button>
      )}
    </div>
  );
}

export function Empty({ title, children, action }) {
  return (
    <div className="border border-dashed border-line-strong px-5 py-8">
      <p className="sign text-xl">{title}</p>
      {children && <div className="mt-1.5 max-w-[56ch] text-sm text-ink-2">{children}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Stat({ label, value, sub, tone = "ink", className = "" }) {
  const tones = { ink: "text-ink", crit: "text-crit", ok: "text-ok" };
  return (
    <div className={`min-w-0 px-4 py-3 ${className}`}>
      <p className="label text-ink-3">{label}</p>
      <p className={`mt-1 font-display text-4xl font-bold leading-none num ${tones[tone]}`}>{value}</p>
      {sub && <p className="mt-1 truncate text-xs text-ink-3">{sub}</p>}
    </div>
  );
}

/** Horizontal bar 0..1 with a value label. */
export function Meter({ value, tone = "paint", label }) {
  const pct = value == null ? 0 : Math.max(0, Math.min(1, value)) * 100;
  const fill = { paint: "bg-paint", crit: "bg-crit", ok: "bg-ok", ink: "bg-ink" }[tone];
  return (
    <div className="flex items-center gap-2" aria-label={label}>
      <div className="relative h-2 flex-1 bg-paper-3">
        <div className={`absolute inset-y-0 left-0 ${fill}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
