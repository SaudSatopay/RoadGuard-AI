// API client. In development both apps proxy /api to the FastAPI backend (see vite.config.js),
// so no certificates, CORS or environment files are needed. VITE_API_URL overrides the base.
import { useCallback, useEffect, useRef, useState } from "react";

export const API_BASE = (import.meta.env.VITE_API_URL || "/api").replace(/\/$/, "");

export class ApiError extends Error {
  constructor(message, status, detail) {
    super(message);
    this.status = status;
    this.detail = detail;
  }
}

/** Backend media paths (/media/...) become proxied URLs; absolute, blob and data URLs pass through. */
export function mediaUrl(path) {
  if (!path) return null;
  if (/^(https?:|data:|blob:)/.test(path)) return path;
  if (path.startsWith("/showcase/")) return path;
  return `${API_BASE}${path.startsWith("/") ? "" : "/"}${path}`;
}

export async function api(path, { method = "GET", form, json, signal, timeout = 20000 } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(new DOMException("Timed out", "TimeoutError")), timeout);
  signal?.addEventListener("abort", () => ctrl.abort(signal.reason));
  let body;
  const headers = {};
  if (form) {
    body = new FormData();
    Object.entries(form).forEach(([k, v]) => {
      if (v !== undefined && v !== null) body.append(k, v);
    });
  } else if (json) {
    body = JSON.stringify(json);
    headers["Content-Type"] = "application/json";
  }
  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, { method, body, headers, signal: ctrl.signal });
  } catch (err) {
    clearTimeout(timer);
    if (err?.name === "AbortError" && signal?.aborted) throw err;
    throw new ApiError(
      err?.name === "TimeoutError" || ctrl.signal.reason?.name === "TimeoutError"
        ? "The RoadGuard server took too long to answer."
        : "Can't reach the RoadGuard server. Start it with RoadGuard.bat and try again.",
      0,
    );
  }
  clearTimeout(timer);
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    const detail = data && typeof data === "object" ? data.detail : data;
    throw new ApiError(typeof detail === "string" ? detail : `Request failed (${res.status})`, res.status, detail);
  }
  return data;
}

/** Fetch on mount (and every refreshMs if given). Returns { data, error, loading, reload }. */
export function useApi(path, { refreshMs, enabled = true, initial = null } = {}) {
  const [state, setState] = useState({ data: initial, error: null, loading: Boolean(path && enabled) });
  const alive = useRef(true);

  const load = useCallback(async (signal) => {
    if (!path || !enabled) return;
    try {
      const data = await api(path, { signal });
      if (alive.current) setState({ data, error: null, loading: false });
    } catch (error) {
      if (error?.name === "AbortError") return;
      if (alive.current) setState((s) => ({ data: s.data, error, loading: false }));
    }
  }, [path, enabled]);

  useEffect(() => {
    alive.current = true;
    const ctrl = new AbortController();
    load(ctrl.signal);
    let timer;
    if (refreshMs) timer = setInterval(() => load(), refreshMs);
    return () => {
      alive.current = false;
      ctrl.abort();
      clearInterval(timer);
    };
  }, [load, refreshMs]);

  return { ...state, reload: () => load() };
}
