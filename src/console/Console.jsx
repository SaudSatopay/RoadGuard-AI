import { lazy, Suspense, useEffect, useState } from "react";
import { BarChart3, Camera, ClipboardList, Cpu, LogOut, Map as MapIcon, Menu, Moon, Settings as SettingsIcon, Sun, X } from "lucide-react";
import { Link, navigate } from "@shared/lib/router.js";
import { useApi } from "@shared/lib/api.js";
import { Wordmark } from "@shared/ui/marks.jsx";
import { setTheme, signOut, useSession } from "./session.js";
import { ServerStatus } from "./status.js";
import { Loading } from "./ui.jsx";

const Today = lazy(() => import("./views/Today.jsx"));
const Scan = lazy(() => import("./views/Scan.jsx"));
const Hazards = lazy(() => import("./views/Hazards.jsx"));
const Accountability = lazy(() => import("./views/Accountability.jsx"));
const ModelCard = lazy(() => import("./views/ModelCard.jsx"));
const Settings = lazy(() => import("./views/Settings.jsx"));

const NAV = [
  { to: "/console", label: "Today", icon: ClipboardList, view: Today, title: "Today" },
  { to: "/console/scan", label: "Scan a photo", icon: Camera, view: Scan, title: "Scan" },
  { to: "/console/hazards", label: "Hazards", icon: MapIcon, view: Hazards, title: "Hazards" },
  { to: "/console/accountability", label: "Accountability", icon: BarChart3, view: Accountability, title: "Accountability" },
  { to: "/console/model", label: "Model card", icon: Cpu, view: ModelCard, title: "Model card" },
  { to: "/console/settings", label: "Settings", icon: SettingsIcon, view: Settings, title: "Settings" },
];

/** "connecting" until the first health check answers, then "online" or "offline"; "no-network" when the browser is offline. */
function useServerStatus() {
  const { data, error } = useApi("/health", { refreshMs: 15000 });
  const [network, setNetwork] = useState(() => typeof navigator === "undefined" || navigator.onLine !== false);
  useEffect(() => {
    const on = () => setNetwork(true);
    const off = () => setNetwork(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  if (!network) return "no-network";
  if (error) return "offline";
  return data ? "online" : "connecting";
}

const STATUS_LABEL = { online: "Detector online", connecting: "Connecting…", offline: "Server offline", "no-network": "You're offline" };

function NavList({ path, counts, onNavigate }) {
  return (
    <ul className="space-y-0.5">
      {NAV.map((n) => {
        const active = n.to === "/console" ? path === "/console" : path.startsWith(n.to);
        const Icon = n.icon;
        const count = counts[n.to];
        return (
          <li key={n.to}>
            <Link
              to={n.to}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={`group relative flex h-11 items-center gap-3 rounded-sm pl-4 pr-3 text-[15px] transition-colors duration-150 ${active ? "bg-sheet font-semibold text-ink shadow-lift" : "text-ink-2 [@media(hover:hover)]:hover:bg-paper-3 [@media(hover:hover)]:hover:text-ink"}`}
            >
              {active && <span aria-hidden="true" className="absolute inset-y-1.5 left-0 w-1 rounded-r-xs bg-paint" />}
              <Icon className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
              <span className="flex-1">{n.label}</span>
              {count != null && (
                <span className="rounded-xs bg-paper-3 px-1.5 py-0.5 font-mono text-2xs num text-ink-2">{count}</span>
              )}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function RailFooter({ user, theme, status }) {
  const dot = status === "online" ? "bg-ok" : status === "connecting" ? "bg-ink-3" : "bg-crit";
  return (
    <div className="space-y-4 border-t border-line pt-4">
      <div className="flex items-center gap-2 px-1 text-xs text-ink-3">
        <span className={`h-2 w-2 rounded-full ${dot}`} aria-hidden="true" />
        {STATUS_LABEL[status]}
      </div>
      <div className="px-1">
        <p className="text-sm font-semibold leading-tight">{user?.name}</p>
        <p className="text-xs text-ink-3">{user?.department || "Municipal roads"}</p>
      </div>
      <div className="flex items-center justify-between gap-2">
        <div role="radiogroup" aria-label="Theme" className="inline-flex rounded-sm border border-line-strong p-0.5">
          {[["day", "Day", Sun], ["night", "Night shift", Moon]].map(([key, label, Icon]) => (
            <button key={key} type="button" role="radio" aria-checked={theme === key} onClick={() => setTheme(key)}
              className={`inline-flex h-7 items-center gap-1.5 rounded-xs px-2 text-xs ${theme === key ? "bg-ink text-paper" : "text-ink-2 hover:text-ink"}`}>
              <Icon className="h-3.5 w-3.5" aria-hidden="true" />{label}
            </button>
          ))}
        </div>
        <button type="button" onClick={() => { signOut(); navigate("/login", { replace: true }); }}
          className="inline-flex h-8 w-8 items-center justify-center rounded-sm text-ink-2 hover:bg-paper-3 hover:text-ink" aria-label="Sign out" title="Sign out">
          <LogOut className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

export default function Console({ path }) {
  const { user, theme } = useSession();
  const status = useServerStatus();
  const summary = useApi("/analytics/summary", { refreshMs: 30000 });
  const [drawer, setDrawer] = useState(false);
  const current = NAV.find((n) => (n.to === "/console" ? path === "/console" : path.startsWith(n.to))) || NAV[0];
  const View = current.view;
  const counts = { "/console/hazards": summary.data?.open_hazards };

  useEffect(() => {
    document.documentElement.dataset.theme = theme === "night" ? "night" : "day";
    return () => { delete document.documentElement.dataset.theme; };
  }, [theme]);

  useEffect(() => {
    document.title = `${current.title} · RoadGuard console`;
  }, [current.title]);

  useEffect(() => {
    if (!drawer) return undefined;
    const onKey = (e) => e.key === "Escape" && setDrawer(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawer]);

  return (
    <div className="min-h-dvh bg-paper text-ink">
      <a href="#console-main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:bg-paint focus:px-3 focus:py-2 focus:text-paint-ink">Skip to content</a>
      <div className="kerb fixed inset-x-0 top-0 z-40" aria-hidden="true" />

      {/* Desktop rail */}
      <aside className="fixed bottom-0 left-0 top-[6px] z-30 hidden w-[248px] flex-col border-r border-line bg-paper-2 px-3 pb-4 pt-5 lg:flex" aria-label="Console navigation">
        <Link to="/" className="mb-7 block px-2" aria-label="RoadGuard AI home"><Wordmark /></Link>
        <p className="label mb-2 px-4 text-ink-3">Inspector console</p>
        <nav className="flex-1"><NavList path={path} counts={counts} /></nav>
        <RailFooter user={user} theme={theme} status={status} />
      </aside>

      {/* Mobile bar */}
      <header className="sticky top-[6px] z-30 flex h-14 items-center justify-between border-b border-line bg-paper/95 px-3 backdrop-blur-sm lg:hidden">
        <button type="button" onClick={() => setDrawer(true)} className="inline-flex h-10 w-10 items-center justify-center rounded-sm border border-line-strong" aria-label="Open navigation" aria-expanded={drawer}>
          <Menu className="h-5 w-5" aria-hidden="true" />
        </button>
        <Link to="/console" aria-label="RoadGuard AI console home"><Wordmark size="sm" /></Link>
        <Link to="/console/scan" className="inline-flex h-10 items-center rounded-sm bg-paint px-3 font-display text-base font-bold uppercase text-paint-ink">Scan</Link>
      </header>

      {drawer && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <button type="button" className="absolute inset-0 bg-asphalt/50" aria-label="Close navigation" onClick={() => setDrawer(false)} />
          <div className="absolute inset-y-0 left-0 flex w-[min(86vw,320px)] flex-col bg-paper-2 px-3 pb-4 pt-4 shadow-sheet">
            <div className="mb-6 flex items-center justify-between px-2">
              <Wordmark size="sm" />
              <button type="button" onClick={() => setDrawer(false)} className="inline-flex h-10 w-10 items-center justify-center rounded-sm" aria-label="Close navigation">
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>
            <nav className="flex-1"><NavList path={path} counts={counts} onNavigate={() => setDrawer(false)} /></nav>
            <RailFooter user={user} theme={theme} status={status} />
          </div>
        </div>
      )}

      <main id="console-main" className="pt-[6px] lg:pl-[248px]">
        <div className="mx-auto max-w-[1500px] px-4 pb-16 pt-6 sm:px-6 lg:px-8 lg:pt-8">
          {status === "offline" && (
            <div role="status" className="mb-5 border-l-[3px] border-crit bg-crit-wash px-4 py-2.5 text-sm">
              <span className="font-medium">The RoadGuard server isn't answering.</span> Live data and scanning are paused. Start it with
              <span className="mx-1 rounded-xs bg-paper-3 px-1.5 py-0.5 font-mono text-xs">RoadGuard.bat</span>
              and this page reconnects on its own.
            </div>
          )}
          {status === "no-network" && (
            <div role="status" className="mb-5 border-l-[3px] border-ink bg-paper-3 px-4 py-2.5 text-sm">
              <span className="font-medium">You're offline.</span> What's on screen is what RoadGuard last loaded; it refreshes when your connection is back.
            </div>
          )}
          <ServerStatus.Provider value={status}>
            <Suspense fallback={<Loading label={`Loading ${current.title}`} rows={6} />}>
              <View path={path} summary={summary} />
            </Suspense>
          </ServerStatus.Provider>
        </div>
      </main>
    </div>
  );
}
