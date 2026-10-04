// A small History-API router: enough for a handful of routes without another dependency.
import { createElement, useSyncExternalStore } from "react";

const listeners = new Set();

function subscribe(fn) {
  listeners.add(fn);
  window.addEventListener("popstate", fn);
  return () => {
    listeners.delete(fn);
    window.removeEventListener("popstate", fn);
  };
}

const getPath = () => window.location.pathname;
const getSearch = () => window.location.search;

export function navigate(to, { replace = false, scroll = true } = {}) {
  const current = window.location.pathname + window.location.search + window.location.hash;
  if (to === current) return;
  window.history[replace ? "replaceState" : "pushState"]({}, "", to);
  listeners.forEach((fn) => fn());
  if (scroll && !to.includes("#")) window.scrollTo({ top: 0 });
}

export function usePath() {
  return useSyncExternalStore(subscribe, getPath, () => "/");
}

export function useSearchParams() {
  const search = useSyncExternalStore(subscribe, getSearch, () => "");
  return new URLSearchParams(search);
}

/** <Link to="/console">: client-side navigation that still works as a normal link. */
export function Link({ to, onClick, replace, ...props }) {
  return createElement("a", {
    href: to,
    ...props,
    onClick: (e) => {
      onClick?.(e);
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      if (props.target && props.target !== "_self") return;
      if (/^(https?:)?\/\//.test(to) || to.startsWith("#")) return;
      e.preventDefault();
      navigate(to, { replace });
    },
  });
}
