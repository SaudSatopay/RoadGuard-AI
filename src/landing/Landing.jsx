import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";
import { Link } from "@shared/lib/router.js";
import { Wordmark } from "@shared/ui/marks.jsx";
import Hero from "./Hero.jsx";
import HowItWorks from "./HowItWorks.jsx";
import ModelFacts from "./ModelFacts.jsx";
import Ledger from "./Ledger.jsx";
import Doors from "./Doors.jsx";
import { PROJECT } from "./credits.js";
import { citizenAppUrl, REPO_URL } from "./links.js";

const NAV = [
  { href: "#how", label: "How it works" },
  { href: "#model", label: "The model" },
  { href: "#ledger", label: "Public ledger" },
];

function SiteHeader() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
  return (
    <header className="relative z-20">
      <div className="kerb" aria-hidden="true" />
      <div className="mx-auto flex max-w-[1240px] items-center justify-between gap-4 px-4 py-4 sm:px-6">
        <Link to="/" aria-label="RoadGuard AI home" className="rounded-xs">
          <Wordmark />
        </Link>
        <nav aria-label="Sections" className="hidden items-center gap-7 md:flex">
          {NAV.map((n) => (
            <a key={n.href} href={n.href} className="text-sm text-ink-2 transition-colors duration-150 hover:text-ink">{n.label}</a>
          ))}
          <Link to="/console" className="inline-flex h-9 items-center rounded-sm border-[1.5px] border-ink px-3 font-display text-base font-bold uppercase tracking-[0.02em] transition-colors duration-150 hover:bg-ink hover:text-paper">
            Console
          </Link>
        </nav>
        <button
          type="button"
          className="inline-flex h-10 w-10 items-center justify-center rounded-sm border border-line-strong md:hidden"
          aria-expanded={open}
          aria-controls="mobile-nav"
          aria-label={open ? "Close menu" : "Open menu"}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <X className="h-5 w-5" aria-hidden="true" /> : <Menu className="h-5 w-5" aria-hidden="true" />}
        </button>
      </div>
      {open && (
        <nav id="mobile-nav" aria-label="Sections" className="absolute inset-x-0 top-full border-y border-line bg-sheet shadow-sheet md:hidden">
          <ul className="mx-auto max-w-[1240px] px-4 py-2">
            {NAV.map((n) => (
              <li key={n.href}>
                <a href={n.href} onClick={() => setOpen(false)} className="flex h-12 items-center border-b border-line text-base">{n.label}</a>
              </li>
            ))}
            <li><a href={citizenAppUrl()} className="flex h-12 items-center border-b border-line text-base">Citizen app</a></li>
            <li><Link to="/console" className="flex h-12 items-center text-base font-medium">Inspector console</Link></li>
          </ul>
        </nav>
      )}
    </header>
  );
}

function SiteFooter() {
  return (
    <footer className="on-asphalt bg-asphalt text-chalk-2">
      <div className="kerb" aria-hidden="true" />
      <div className="mx-auto grid max-w-[1240px] gap-10 px-4 py-14 sm:px-6 lg:grid-cols-12">
        <div className="lg:col-span-5">
          <Wordmark tone="chalk" />
          <p className="mt-4 max-w-[46ch] text-sm leading-relaxed">{PROJECT.context}</p>
          <p className="mt-3 text-sm">{PROJECT.team.join(" · ")} — guided by {PROJECT.guide}.</p>
          <p className="mt-3 text-xs text-chalk-2/80">{PROJECT.origin}</p>
        </div>
        <div className="text-sm lg:col-span-4">
          <p className="label text-chalk">Data and credits</p>
          <ul className="mt-3 space-y-2 leading-relaxed">
            <li>Road photographs and labels: RDD2022 (Arya et al., CRDDC'2022), CC BY 4.0.</li>
            <li>Map tiles © OpenStreetMap contributors.</li>
            <li>Detector: Ultralytics YOLO26, fine-tuned for RoadGuard.</li>
          </ul>
        </div>
        <div className="text-sm lg:col-span-3">
          <p className="label text-chalk">Go to</p>
          <ul className="mt-3 space-y-2">
            <li><Link to="/console" className="hover:text-chalk">Inspector console</Link></li>
            <li><a href={citizenAppUrl()} className="hover:text-chalk">Citizen app</a></li>
            <li><Link to="/console/model" className="hover:text-chalk">Model card</Link></li>
            <li><a href={REPO_URL} className="hover:text-chalk">Source on GitHub</a></li>
          </ul>
        </div>
      </div>
    </footer>
  );
}

export default function Landing() {
  useEffect(() => {
    document.title = "RoadGuard AI · Every pothole, on the record";
  }, []);
  return (
    <>
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:bg-paint focus:px-3 focus:py-2 focus:text-paint-ink">Skip to content</a>
      <SiteHeader />
      <main id="main">
        <Hero />
        <HowItWorks />
        <ModelFacts />
        <Ledger />
        <Doors />
      </main>
      <SiteFooter />
    </>
  );
}
