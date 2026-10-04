import { ArrowRight, ArrowUpRight } from "lucide-react";
import { Link } from "@shared/lib/router.js";
import { citizenAppUrl } from "./links.js";

export default function Doors() {
  return (
    <section className="border-t border-line" aria-label="Get started">
      <div className="grid lg:grid-cols-2">
        <div className="on-asphalt grain relative overflow-hidden bg-asphalt text-chalk">
          <div className="relative mx-auto flex h-full max-w-[620px] flex-col px-4 py-20 sm:px-8 lg:ml-auto lg:mr-0 lg:py-28 lg:pr-14">
            <p className="label text-chalk-2">For citizens</p>
            <h2 className="mt-5 font-display text-5xl font-extrabold leading-[0.95] sm:text-6xl">Report a road in three taps</h2>
            <p className="mt-5 max-w-[44ch] text-lg text-chalk-2">
              Take the photo, confirm where you are, send. You see what the detector found before you leave the spot, and you
              can follow the repair from your phone.
            </p>
            <div className="mt-auto pt-12">
              <a
                href={citizenAppUrl()}
                className="group inline-flex h-12 items-center gap-2 rounded-sm bg-paint px-5 font-display text-lg font-bold uppercase tracking-[0.02em] text-paint-ink transition-transform duration-150 active:scale-[0.98] [@media(hover:hover)]:hover:-translate-y-0.5"
              >
                Open the citizen app
                <ArrowUpRight className="h-5 w-5" aria-hidden="true" />
              </a>
            </div>
          </div>
        </div>
        <div className="bg-paper">
          <div className="mx-auto flex h-full max-w-[620px] flex-col px-4 py-20 sm:px-8 lg:ml-0 lg:py-28 lg:pl-14">
            <p className="label text-ink-3">For inspectors</p>
            <h2 className="mt-5 font-display text-5xl font-extrabold leading-[0.95] sm:text-6xl">Today's worklist, already ranked</h2>
            <p className="mt-5 max-w-[44ch] text-lg text-ink-2">
              Duplicates merged, severity weighed by road class, rupee estimates attached, complaint letters a click away. Mark
              a hazard fixed and the citizen who reported it sees it the same minute.
            </p>
            <ul className="mt-8 space-y-2 text-sm text-ink-2">
              <li className="flex gap-3"><span className="font-mono text-xs text-ink-3 num">01</span>Worklist, map and 30-day trend on one screen</li>
              <li className="flex gap-3"><span className="font-mono text-xs text-ink-3 num">02</span>Scan any photo and get a printable evidence sheet</li>
              <li className="flex gap-3"><span className="font-mono text-xs text-ink-3 num">03</span>Ward and contractor accountability from the ledger</li>
            </ul>
            <div className="mt-auto pt-12">
              <Link
                to="/console"
                className="group inline-flex h-12 items-center gap-2 rounded-sm bg-ink px-5 font-display text-lg font-bold uppercase tracking-[0.02em] text-paper transition-transform duration-150 active:scale-[0.98] [@media(hover:hover)]:hover:-translate-y-0.5"
              >
                Open the inspector console
                <ArrowRight className="h-5 w-5 transition-transform duration-150 group-hover:translate-x-0.5" aria-hidden="true" />
              </Link>
              <p className="mt-3 font-mono text-xs text-ink-3">Demo login: admin / admin123</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
