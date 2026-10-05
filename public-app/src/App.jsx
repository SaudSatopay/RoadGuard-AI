import { lazy, Suspense, useEffect, useState } from "react";
import { BarChart3, Camera, ListChecks, LogOut, Map as MapIcon, Trophy } from "lucide-react";
import { api } from "@shared/lib/api.js";
import { Wordmark } from "@shared/ui/marks.jsx";
import MarkedPhoto from "@shared/ui/MarkedPhoto.jsx";
import showcase from "@shared/data/showcase.json";
import { setCitizen, useCitizen } from "./session.js";
import { PrimaryButton, Skeleton, Spinner } from "./ui.jsx";

const MapScreen = lazy(() => import("./screens/MapScreen.jsx"));
const ReportFlow = lazy(() => import("./screens/ReportFlow.jsx"));
const MineScreen = lazy(() => import("./screens/MineScreen.jsx"));
const RewardsScreen = lazy(() => import("./screens/RewardsScreen.jsx"));
const LedgerScreen = lazy(() => import("./screens/LedgerScreen.jsx"));

const TABS = [
  { id: "map", label: "Map", icon: MapIcon },
  { id: "mine", label: "My reports", icon: ListChecks },
  { id: "report", label: "Report", icon: Camera, primary: true },
  { id: "rewards", label: "Rewards", icon: Trophy },
  { id: "ledger", label: "Ledger", icon: BarChart3 },
];

function initialTab() {
  const t = new URLSearchParams(window.location.search).get("tab");
  return TABS.some((x) => x.id === t) ? t : "map";
}

const SAMPLE = showcase.items.find((i) => i.file === "india-004459.webp") || showcase.items[0];

function Onboarding() {
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [account, setAccount] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function start(e) {
    e.preventDefault();
    const n = name.trim();
    if (!n) return setError("Type the name you want on the public ledger.");
    setBusy(true);
    setError(null);
    try {
      if (account) {
        const data = await api("/auth/login", { method: "POST", form: { username: n, password } });
        setCitizen({ ...data, name: data.name || n });
      } else {
        const data = await api("/auth/register", { method: "POST", form: { name: n } });
        setCitizen(data);
      }
    } catch (err) {
      if (account && err.status === 401) setError("That name and password don't match. Leave the password empty to start fresh.");
      else if (err.status === 0) setError("Can't reach RoadGuard right now. Check your connection and try again.");
      else setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <div className="kerb" aria-hidden="true" />
      <div className="px-5 pt-6"><Wordmark size="sm" /></div>
      <div className="mx-5 mt-6 h-[34vh] max-h-[300px] overflow-hidden rounded-md" aria-hidden="true">
        <div className="-translate-y-[22%]">
          <MarkedPhoto src={SAMPLE.src} width={SAMPLE.width} height={SAMPLE.height} detections={SAMPLE.detections} mode="marks" notes="compact" alt="" />
        </div>
      </div>
      <main id="citizen-main" className="flex flex-1 flex-col justify-end px-5 pb-8 pt-8">
        <p className="label text-ink-3">For citizens</p>
        <h1 className="mt-3 font-display text-[3.4rem] font-extrabold leading-[0.9]">See a pothole? Put it on the record.</h1>
        <p className="mt-4 text-base text-ink-2">
          Photograph it, confirm where it is, send. You'll see what was found before you leave the spot, and you can follow the repair
          from here.
        </p>
        <form onSubmit={start} className="mt-8 space-y-4" noValidate>
          <label className="block">
            <span className="text-sm font-medium">Your name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" placeholder="As it should appear on the ledger"
              className="mt-1.5 h-13 w-full rounded-xs border border-line-strong bg-sheet px-3 py-3 placeholder:text-ink-3" />
          </label>
          {account && (
            <label className="block">
              <span className="text-sm font-medium">Password</span>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password"
                className="mt-1.5 w-full rounded-xs border border-line-strong bg-sheet px-3 py-3" />
            </label>
          )}
          {error && <p role="alert" className="border-l-[3px] border-crit bg-crit-wash px-3 py-2 text-sm">{error}</p>}
          <PrimaryButton type="submit" disabled={busy}>{busy ? <Spinner /> : null}{account ? "Sign in" : "Start reporting"}</PrimaryButton>
          <button type="button" onClick={() => { setAccount((v) => !v); setError(null); }} className="w-full py-2 text-sm text-ink-2 underline decoration-line-strong underline-offset-4">
            {account ? "I'm new here" : "I already have an account"}
          </button>
        </form>
        <p className="mt-6 text-xs text-ink-3">Only your name is shown publicly. RoadGuard never asks for your phone number. Demo account: saud / 123.</p>
      </main>
    </div>
  );
}

function TabBar({ tab, setTab }) {
  return (
    <nav aria-label="RoadGuard sections" className="pb-safe sticky bottom-0 z-[1000] border-t border-line bg-paper/95 backdrop-blur-sm">
      <ul className="grid grid-cols-5">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          if (t.primary) {
            return (
              <li key={t.id} className="flex justify-center">
                <button type="button" onClick={() => setTab(t.id)} aria-current={active ? "page" : undefined}
                  className={`-mt-5 flex h-16 w-16 flex-col items-center justify-center rounded-full border-4 border-paper bg-paint text-paint-ink shadow-lift transition-transform duration-150 active:scale-95`}>
                  <Icon className="h-6 w-6" aria-hidden="true" />
                  <span className="sr-only">{t.label}</span>
                </button>
              </li>
            );
          }
          return (
            <li key={t.id}>
              <button type="button" onClick={() => setTab(t.id)} aria-current={active ? "page" : undefined}
                className={`flex h-16 w-full flex-col items-center justify-center gap-1 text-[11px] transition-colors duration-150 ${active ? "font-semibold text-ink" : "text-ink-3"}`}>
                <span className="relative">
                  <Icon className="h-[22px] w-[22px]" aria-hidden="true" />
                  {active && <span aria-hidden="true" className="absolute -bottom-1.5 left-1/2 h-[3px] w-5 -translate-x-1/2 bg-paint-deep" />}
                </span>
                {t.label}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export default function App() {
  const user = useCitizen();
  const [tab, setTabState] = useState(initialTab);
  const setTab = (t) => {
    setTabState(t);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", t);
    window.history.replaceState({}, "", url);
  };

  useEffect(() => {
    const titles = { map: "Map", mine: "My reports", report: "Report a road", rewards: "Rewards", ledger: "Public ledger" };
    document.title = `${titles[tab]} · RoadGuard`;
  }, [tab]);

  return (
    <div className="min-h-dvh bg-asphalt sm:grain">
      <a href="#citizen-main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[1100] focus:bg-paint focus:px-3 focus:py-2 focus:text-paint-ink">Skip to content</a>
      <div className="mx-auto flex min-h-dvh max-w-[460px] flex-col bg-paper sm:border-x sm:border-asphalt-line">
        {!user ? (
          <Onboarding />
        ) : (
          <>
            <header className="sticky top-0 z-[1000] bg-paper/95 backdrop-blur-sm">
              <div className="kerb" aria-hidden="true" />
              <div className="flex h-12 items-center justify-between px-4">
                <Wordmark size="sm" />
                <div className="flex items-center gap-2">
                  <span className="max-w-[9rem] truncate text-sm text-ink-2">{user.name}</span>
                  <button type="button" onClick={() => setCitizen(null)} aria-label="Sign out" title="Sign out"
                    className="inline-flex h-9 w-9 items-center justify-center rounded-sm text-ink-3 active:bg-paper-3">
                    <LogOut className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              </div>
            </header>
            <main id="citizen-main" className="flex-1">
              <Suspense fallback={<div className="pt-6"><Skeleton /></div>}>
                {tab === "map" && <MapScreen user={user} onReport={() => setTab("report")} />}
                {tab === "report" && <ReportFlow user={user} onTrack={() => setTab("mine")} />}
                {tab === "mine" && <MineScreen user={user} onReport={() => setTab("report")} />}
                {tab === "rewards" && <RewardsScreen user={user} />}
                {tab === "ledger" && <LedgerScreen />}
              </Suspense>
            </main>
            <TabBar tab={tab} setTab={setTab} />
          </>
        )}
      </div>
    </div>
  );
}
