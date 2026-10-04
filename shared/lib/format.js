// Formatting helpers. Indian number grouping, compact rupees, relative time, chainage.

const inr = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

export function rupees(value, { compact = false } = {}) {
  if (value == null || Number.isNaN(Number(value))) return "—";
  const n = Number(value);
  if (compact) {
    if (Math.abs(n) >= 1e7) return `₹${trim(n / 1e7)} Cr`;
    if (Math.abs(n) >= 1e5) return `₹${trim(n / 1e5)} L`;
    if (Math.abs(n) >= 1e3) return `₹${trim(n / 1e3)}k`;
  }
  return `₹${inr.format(Math.round(n))}`;
}

function trim(x) {
  return x >= 100 ? Math.round(x).toString() : x.toFixed(1).replace(/\.0$/, "");
}

export function number(value, digits = 0) {
  if (value == null || Number.isNaN(Number(value))) return "—";
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(Number(value));
}

export function conf(value) {
  if (value == null) return "—";
  return Number(value).toFixed(2);
}

export function pct(value, digits = 0) {
  if (value == null || Number.isNaN(Number(value))) return "—";
  return `${Number(value).toFixed(digits)}%`;
}

/** "6 d", "3 h", "12 min" — compact for ledgers. */
export function ago(iso, now = Date.now()) {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "—";
  const s = Math.max(0, (now - t) / 1000);
  if (s < 90) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min`;
  if (s < 86400 * 2) return `${Math.round(s / 3600)} h`;
  if (s < 86400 * 60) return `${Math.round(s / 86400)} d`;
  return `${Math.round(s / (86400 * 30))} mo`;
}

export function daysSince(iso, now = Date.now()) {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return Math.max(0, (now - t) / 86400000);
}

export function dateLabel(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export function dateTimeLabel(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

/** Chainage in km+metres, the way Indian road engineers write positions: 0+250. */
export function chainage(metres) {
  const m = Math.max(0, Math.round(metres));
  return `${Math.floor(m / 1000)}+${String(m % 1000).padStart(3, "0")}`;
}

export function coords(lat, lng, digits = 5) {
  if (lat == null || lng == null) return "—";
  return `${Number(lat).toFixed(digits)}, ${Number(lng).toFixed(digits)}`;
}
