import { lazy, Suspense, useEffect } from "react";
import { navigate, usePath } from "@shared/lib/router.js";
import Landing from "./landing/Landing.jsx";
import { useSession } from "./console/session.js";

const Console = lazy(() => import("./console/Console.jsx"));
const Login = lazy(() => import("./console/Login.jsx"));

function Loading() {
  return (
    <div className="flex min-h-dvh items-center justify-center" role="status">
      <span className="label text-ink-3">Loading RoadGuard…</span>
    </div>
  );
}

function NotFound() {
  useEffect(() => {
    document.title = "Not found · RoadGuard AI";
  }, []);
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center px-6">
      <p className="label text-ink-3">404</p>
      <h1 className="mt-3 font-display text-5xl font-extrabold">This road isn't on our map</h1>
      <p className="mt-4 text-ink-2">The page you asked for doesn't exist. The landing page and the inspector console do.</p>
      <div className="mt-8 flex gap-3">
        <a href="/" className="inline-flex h-11 items-center rounded-sm bg-paint px-4 font-display text-lg font-bold uppercase text-paint-ink">Home</a>
        <a href="/console" className="inline-flex h-11 items-center rounded-sm border-[1.5px] border-ink px-4 font-display text-lg font-bold uppercase">Console</a>
      </div>
    </main>
  );
}

export default function App() {
  const path = usePath();
  const { user } = useSession();
  const isConsole = path === "/console" || path.startsWith("/console/");

  useEffect(() => {
    if (isConsole && !user) navigate(`/login?next=${encodeURIComponent(path)}`, { replace: true });
  }, [isConsole, user, path]);

  if (path === "/") return <Landing />;
  if (path === "/login") return <Suspense fallback={<Loading />}><Login /></Suspense>;
  if (isConsole) return user ? <Suspense fallback={<Loading />}><Console path={path} /></Suspense> : <Loading />;
  return <NotFound />;
}
