import { Link } from "@shared/lib/router.js";
import { number } from "@shared/lib/format.js";
import facts from "./facts.json";

const COUNTRY_LABEL = {
  India: "India",
  Japan: "Japan",
  Czech: "Czech Republic",
  United_States: "United States",
  China_MotorBike: "China (motorbike camera)",
};
const CLASS_LABEL = {
  longitudinal_crack: "D00 · Longitudinal crack",
  transverse_crack: "D10 · Transverse crack",
  alligator_crack: "D20 · Alligator crack",
  pothole: "D40 · Pothole",
};

function PairBar({ label, ours, theirs, note }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)] items-center gap-x-4 py-2.5 sm:grid-cols-[13rem_1fr]">
      <div className="min-w-0 text-sm text-ink">
        {label}
        {note && <span className="ml-1 text-ink-3">{note}</span>}
      </div>
      <div className="space-y-1">
        <Bar value={ours} tone="ours" />
        <Bar value={theirs} tone="theirs" />
      </div>
    </div>
  );
}

function Bar({ value, tone }) {
  const w = value == null ? 0 : Math.max(2, value * 100);
  return (
    <div className="flex items-center gap-2">
      <div className="relative h-3 flex-1 bg-paper-3">
        <div
          className={`absolute inset-y-0 left-0 ${tone === "ours" ? "bg-paint-deep" : "border border-ink-3 bg-transparent"}`}
          style={{ width: `${w}%` }}
        />
      </div>
      <span className={`w-10 text-right font-mono text-xs num ${tone === "ours" ? "text-ink" : "text-ink-3"}`}>
        {value == null ? "—" : value.toFixed(2)}
      </span>
    </div>
  );
}

export default function ModelFacts() {
  const rg = facts.roadguard;
  const old = facts.legacy;
  const countries = Object.keys(COUNTRY_LABEL);
  return (
    <section id="model" className="scroll-mt-6 border-t border-line" aria-labelledby="model-title">
      <div className="mx-auto max-w-[1240px] px-4 py-24 sm:px-6 lg:py-32">
        <div className="grid gap-6 lg:grid-cols-12">
          <p className="label text-ink-3 lg:col-span-3 lg:pt-3">CH 0+500 · The model</p>
          <div className="lg:col-span-8">
            <h2 id="model-title" className="font-display text-5xl font-extrabold leading-[0.95] sm:text-6xl">Measured, not claimed</h2>
            <p className="mt-5 max-w-[60ch] text-lg text-ink-2">
              Scored on {number(facts.dataset.test_images)} RDD2022 photos that neither model was tuned on. Mean average
              precision at 0.5 IoU: higher is better, 1.0 is perfect.
            </p>
          </div>
        </div>

        <div className="mt-14 grid gap-12 lg:grid-cols-12">
          <div className="lg:col-span-4">
            <div className="border-t-[3px] border-ink pt-4">
              <p className="label text-ink-3">RoadGuard · {rg?.name || "YOLO26s"}</p>
              <p className="mt-2 font-display text-7xl font-extrabold leading-none num">{rg ? rg.test.map50.toFixed(3) : "—"}</p>
              <p className="mt-2 text-sm text-ink-2">
                mAP@0.5 on the full test split{rg ? ` · F1 ${rg.test.f1.toFixed(2)} · ${rg.params_m} M parameters` : ""}
              </p>
            </div>
            <div className="mt-8 border-t border-line pt-4">
              <p className="label text-ink-3">Replaced · {old.name}</p>
              <p className="mt-2 font-display text-5xl font-bold leading-none text-ink-3 num">{old.test.map50.toFixed(3)}</p>
              <p className="mt-2 text-sm text-ink-3">The hackathon model, trained on Japan and India only.</p>
            </div>
            <div className="mt-8 flex items-center gap-5 text-xs text-ink-2">
              <span className="flex items-center gap-2"><span className="h-3 w-6 bg-paint-deep" /> RoadGuard</span>
              <span className="flex items-center gap-2"><span className="h-3 w-6 border border-ink-3" /> Hackathon model</span>
            </div>
          </div>

          <div className="lg:col-span-8">
            <h3 className="label text-ink-3">By country</h3>
            <div className="mt-2 divide-y divide-line border-y border-line">
              {countries.map((c) => (
                <PairBar
                  key={c}
                  label={COUNTRY_LABEL[c]}
                  note={c === "India" || c === "Japan" ? "*" : undefined}
                  ours={rg?.per_country_map50?.[c] ?? null}
                  theirs={old.per_country_map50?.[c] ?? null}
                />
              ))}
            </div>
            <h3 className="label mt-10 text-ink-3">By defect class (AP@0.5)</h3>
            <div className="mt-2 divide-y divide-line border-y border-line">
              {Object.keys(CLASS_LABEL).map((k) => (
                <PairBar key={k} label={CLASS_LABEL[k]} ours={rg?.per_class_ap50?.[k] ?? null} theirs={old.per_class_ap50?.[k] ?? null} />
              ))}
            </div>
            <p className="mt-5 max-w-[70ch] text-xs leading-relaxed text-ink-3">
              * The hackathon model was trained on RDD2022 Japan and India photos; some of this test split's Japan and India
              images may have been in its training set, which would flatter its scores there. RoadGuard never saw any test
              photo. Full method in <Link to="/console/model" className="underline decoration-line-strong underline-offset-2 hover:text-ink">the model card</Link>.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
