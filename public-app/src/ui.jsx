// Citizen-app primitives on the shared tokens: big touch targets, plain states.
import { AlertTriangle, LoaderCircle, RefreshCw } from "lucide-react";

export function PrimaryButton({ children, className = "", ...props }) {
  return (
    <button type="button" className={`inline-flex h-14 w-full items-center justify-center gap-2 rounded-sm bg-paint px-5 font-display text-xl font-bold uppercase tracking-[0.02em] text-paint-ink transition-transform duration-150 active:scale-[0.98] disabled:opacity-50 ${className}`} {...props}>
      {children}
    </button>
  );
}

export function SecondaryButton({ children, className = "", ...props }) {
  return (
    <button type="button" className={`inline-flex h-12 items-center justify-center gap-2 rounded-sm border-[1.5px] border-ink px-4 text-base font-medium transition-colors duration-150 active:bg-paper-3 disabled:opacity-50 ${className}`} {...props}>
      {children}
    </button>
  );
}

export function Spinner({ className = "h-5 w-5" }) {
  return <LoaderCircle className={`animate-spin ${className}`} aria-hidden="true" />;
}

export function ScreenHead({ title, sub, right }) {
  return (
    <div className="flex items-end justify-between gap-3 px-4 pb-3 pt-5">
      <div className="min-w-0">
        <h1 className="font-display text-4xl font-extrabold leading-none">{title}</h1>
        {sub && <p className="mt-1.5 text-sm text-ink-2">{sub}</p>}
      </div>
      {right}
    </div>
  );
}

export function ErrorNote({ error, onRetry, title = "That didn't work" }) {
  return (
    <div role="alert" className="border-l-[3px] border-crit bg-crit-wash px-4 py-3">
      <p className="flex items-center gap-2 font-medium"><AlertTriangle className="h-4 w-4 text-crit" aria-hidden="true" />{title}</p>
      <p className="mt-1 text-sm text-ink-2">{error?.message || String(error)}</p>
      {onRetry && (
        <button type="button" onClick={onRetry} className="mt-3 inline-flex h-10 items-center gap-2 rounded-sm border border-line-strong bg-sheet px-3 text-sm">
          <RefreshCw className="h-4 w-4" aria-hidden="true" /> Try again
        </button>
      )}
    </div>
  );
}

export function Skeleton({ rows = 4 }) {
  return (
    <div role="status" aria-label="Loading" className="space-y-2 px-4">
      {Array.from({ length: rows }, (_, i) => <div key={i} className="h-16 animate-pulse bg-paper-3" />)}
    </div>
  );
}
