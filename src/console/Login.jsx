import { useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";
import MarkedPhoto from "@shared/ui/MarkedPhoto.jsx";
import { Wordmark } from "@shared/ui/marks.jsx";
import { api } from "@shared/lib/api.js";
import { Link, navigate, useSearchParams } from "@shared/lib/router.js";
import showcase from "@shared/data/showcase.json";
import { signIn, useSession } from "./session.js";
import { Spinner } from "./ui.jsx";

const DEMO = [
  { username: "admin", password: "admin123", who: "Inspector Kumar · PWD Mumbai" },
  { username: "inspector", password: "inspect123", who: "Officer Sharma · Municipal Corp." },
  { username: "engineer", password: "eng123", who: "Er. Patel · NHAI" },
];

export default function Login() {
  const params = useSearchParams();
  const next = params.get("next") || "/console";
  const { user } = useSession();
  const [form, setForm] = useState({ username: "", password: "" });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const plate = showcase.items[1] || showcase.items[0];

  useEffect(() => {
    document.title = "Sign in · RoadGuard console";
    if (user) navigate(next.startsWith("/console") ? next : "/console", { replace: true });
  }, [user, next]);

  async function submit(e) {
    e.preventDefault();
    if (!form.username || !form.password) {
      setError("Enter your username and password.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const data = await api("/auth/login", { method: "POST", form });
      if (data.role !== "government") {
        setError("That is a citizen account. Citizens report through the citizen app; the console is for inspectors.");
        return;
      }
      signIn(data);
    } catch (err) {
      setError(err.status === 401 ? "Username or password doesn't match. The demo accounts are listed below." : err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[1.1fr_1fr]">
      <div className="on-asphalt grain relative hidden flex-col justify-between bg-asphalt px-10 py-10 text-chalk lg:flex">
        <Link to="/" aria-label="RoadGuard AI home"><Wordmark tone="chalk" /></Link>
        <div className="mx-auto w-full max-w-[560px]">
          <MarkedPhoto src={plate.src} width={plate.width} height={plate.height} detections={plate.detections} mode="marks" notes="compact" alt={`Sample survey: ${plate.source}`} />
          <p className="mt-3 font-mono text-2xs text-chalk-2">{plate.source} · {plate.detections.length} defects marked</p>
        </div>
        <p className="max-w-[40ch] text-sm text-chalk-2">The console ranks every open hazard in the city by what gets worse fastest, and keeps the paper trail.</p>
      </div>

      <main className="flex min-h-dvh flex-col">
        <div className="kerb lg:hidden" aria-hidden="true" />
        <div className="flex items-center justify-between px-5 py-5 lg:hidden">
          <Link to="/" aria-label="RoadGuard AI home"><Wordmark size="sm" /></Link>
        </div>
        <div className="mx-auto flex w-full max-w-[420px] flex-1 flex-col justify-center px-5 pb-16">
          <p className="label text-ink-3">Inspector console</p>
          <h1 className="mt-3 font-display text-5xl font-extrabold leading-none">Sign in</h1>
          <form onSubmit={submit} className="mt-8 space-y-4" noValidate>
            <label className="block">
              <span className="text-sm font-medium">Username</span>
              <input autoComplete="username" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })}
                className="mt-1.5 h-12 w-full rounded-xs border border-line-strong bg-sheet px-3 text-base" aria-invalid={Boolean(error) && !form.username} />
            </label>
            <label className="block">
              <span className="text-sm font-medium">Password</span>
              <input type="password" autoComplete="current-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })}
                className="mt-1.5 h-12 w-full rounded-xs border border-line-strong bg-sheet px-3 text-base" aria-invalid={Boolean(error) && !form.password} />
            </label>
            {error && <p role="alert" className="border-l-[3px] border-crit bg-crit-wash px-3 py-2 text-sm">{error}</p>}
            <button type="submit" disabled={busy}
              className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-sm bg-ink font-display text-lg font-bold uppercase tracking-[0.02em] text-paper transition-transform duration-150 active:scale-[0.99] disabled:opacity-60">
              {busy ? <Spinner /> : null} Sign in <ArrowRight className="h-5 w-5" aria-hidden="true" />
            </button>
          </form>
          <div className="mt-10 border-t border-line pt-5">
            <p className="label text-ink-3">Demo accounts</p>
            <ul className="mt-2 divide-y divide-line">
              {DEMO.map((d) => (
                <li key={d.username} className="flex items-center justify-between gap-3 py-2">
                  <span className="min-w-0 text-sm">
                    <span className="font-mono text-xs">{d.username} / {d.password}</span>
                    <span className="block truncate text-xs text-ink-3">{d.who}</span>
                  </span>
                  <button type="button" onClick={() => { setForm({ username: d.username, password: d.password }); setError(null); }}
                    className="h-8 shrink-0 rounded-xs border border-line-strong px-2.5 text-xs font-medium hover:border-ink">Use</button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </main>
    </div>
  );
}
