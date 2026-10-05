import { Link } from "@shared/lib/router.js";
import { number } from "@shared/lib/format.js";
import facts from "./facts.json";

const FAIR = [
  ["Czech", "Czech Republic"],
  ["United_States", "United States"],
  ["China_MotorBike", "China (motorbike camera)"],
];
const OVERLAP = [
  ["India", "India"],
  ["Japan", "Japan"],
];
const CLASS_LABEL = {
  longitudinal_crack: "D00 · Longitudinal crack",
  transverse_crack: "D10 · Transverse crack",
  alligator_crack: "D20 · Alligator crack",
  pothole: "D40 · Pothole",
};

function Bar({ value, tone }) {
  const w = value == null ? 0 : Math.max(2, value * 100);
  const fill = tone === "ours" ? "bg-paint-deep" : tone === "suspect" ? "hatch-soft border border-ink-3" : "border border-ink-3";
  return (
    <div className="flex items-center gap-2">
      <div className="relative h-3 flex-1 bg-paper-3">
        <div className={`absolute inset-y-0 left-0 ${fill}`} style={{ width: `${w}%` }} />
      </div>
      <span className={`w-10 text-right font-mono text-xs num ${tone === "ours" ? "text-ink" : "text-ink-3"}`}>
        {value == null ? "—" : value.toFixed(2)}
      </span>
    </div>
  );
}

function PairBar({ label, ours, theirs, suspect = false }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)] items-center gap-x-4 py-2.5 sm:grid-cols-[13rem_1fr]">
      <div className="min-w-0 text-sm text-ink">{label}</div>
      <div className="space-y-1">
        <Bar value={ours} tone="ours" />
        <Bar value={theirs} tone={suspect ? "suspect" : "theirs"} />
      </div>
    </div>
  );
}

function mean(values) {
  const v = values.filter((x) => x != null);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}

export default function ModelFacts() {
  const rg = facts.roadguard;
  const old = facts.legacy;
  const fairOurs = mean(FAIR.map(([k]) => rg?.per_country_map50?.[k]));
  const fairOld = mean(FAIR.map(([k]) => old.per_country_map50?.[k]));

  return (
    <section id="model" className="scroll-mt-6 border-t border-line" aria-labelledby="model-title">
      <div className="mx-auto max-w-[1240px] px-4 py-24 sm:px-6 lg:py-32">
        <div className="grid gap-6 lg:grid-cols-12">
          <p className="label text-ink-3 lg:col-span-3 lg:pt-3">CH 0+500 · The model</p>
          <div className="lg:col-span-8">
            <h2 id="model-title" className="font-display text-5xl font-extrabold leading-[0.95] sm:text-6xl">Measured, not claimed</h2>
            <p className="mt-5 max-w-[60ch] text-lg text-ink-2">
              Both detectors scored on the same {number(facts.dataset.test_images)} RDD2022 photos, none of which RoadGuard
              trained on. Mean average precision at 0.5 overlap: higher is better, 1.0 is perfect.
            </p>
          </div>
        </div>

        <div className="mt-14 grid gap-12 lg:grid-cols-12">
          <div className="lg:col-span-4">
            <div className="border-t-[3px] border-ink pt-4">
              <p className="label text-ink-3">Photos neither model has seen</p>
              <p className="mt-2 font-display text-7xl font-extrabold leading-none num">{fairOurs != null ? fairOurs.toFixed(2) : "—"}</p>
              <p className="mt-2 text-sm text-ink-2">
                RoadGuard, mean mAP@0.5 over Czech, United States and China test photos. The hackathon model it replaces scores
                <b className="mx-1 font-mono num text-ink">{fairOld != null ? fairOld.toFixed(2) : "—"}</b>on the same photos. It
                never saw a photo from these countries; RoadGuard trained on other photos from them.
              </p>
            </div>
            <dl className="mt-8 grid grid-cols-2 gap-x-6 gap-y-5 border-t border-line pt-4">
              <div>
                <dt className="label text-ink-3">All test photos</dt>
                <dd className="mt-1 font-display text-4xl font-bold num">{rg ? rg.test.map50.toFixed(3) : "—"}</dd>
                <dd className="text-xs text-ink-3">RoadGuard mAP@0.5</dd>
              </div>
              <div>
                <dt className="label text-ink-3">Model</dt>
                <dd className="mt-1 font-display text-4xl font-bold num">{rg ? `${rg.params_m}M` : "—"}</dd>
                <dd className="text-xs text-ink-3">YOLO26s parameters</dd>
              </div>
              <div>
                <dt className="label text-ink-3">GPU</dt>
                <dd className="mt-1 font-display text-4xl font-bold num">{rg?.latency_ms ? `${Math.round(rg.latency_ms)} ms` : "—"}</dd>
                <dd className="text-xs text-ink-3">per photo, RTX 5060 Ti</dd>
              </div>
              <div>
                <dt className="label text-ink-3">CPU only</dt>
                <dd className="mt-1 font-display text-4xl font-bold num">{rg?.cpu_onnx_latency_ms ? `${Math.round(rg.cpu_onnx_latency_ms)} ms` : "—"}</dd>
                <dd className="text-xs text-ink-3">per photo, ONNX Runtime</dd>
              </div>
            </dl>
            <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-ink-2">
              <span className="flex items-center gap-2"><span className="h-3 w-6 bg-paint-deep" /> RoadGuard</span>
              <span className="flex items-center gap-2"><span className="h-3 w-6 border border-ink-3" /> Hackathon model</span>
              <span className="flex items-center gap-2"><span className="hatch-soft h-3 w-6 border border-ink-3" /> may have trained on these photos</span>
            </div>
          </div>

          <div className="lg:col-span-8">
            <h3 className="label text-ink-3">Test photos neither model has seen</h3>
            <div className="mt-2 divide-y divide-line border-y border-line">
              {FAIR.map(([k, label]) => (
                <PairBar key={k} label={label} ours={rg?.per_country_map50?.[k] ?? null} theirs={old.per_country_map50?.[k] ?? null} />
              ))}
            </div>
            <h3 className="label mt-8 text-ink-3">India and Japan</h3>
            <div className="mt-2 divide-y divide-line border-y border-line">
              {OVERLAP.map(([k, label]) => (
                <PairBar key={k} label={label} suspect ours={rg?.per_country_map50?.[k] ?? null} theirs={old.per_country_map50?.[k] ?? null} />
              ))}
            </div>
            <h3 className="label mt-8 text-ink-3">By defect class, all test photos (AP@0.5)</h3>
            <div className="mt-2 divide-y divide-line border-y border-line">
              {Object.keys(CLASS_LABEL).map((k) => (
                <PairBar key={k} label={CLASS_LABEL[k]} suspect ours={rg?.per_class_ap50?.[k] ?? null} theirs={old.per_class_ap50?.[k] ?? null} />
              ))}
            </div>
            <p className="mt-5 max-w-[70ch] text-xs leading-relaxed text-ink-3">
              The hackathon model was trained on RDD2022 Japan and India photos from the same pool this test split was drawn
              from, so its India, Japan and all-photo scores are likely inflated. RoadGuard trained on all five countries'
              training splits and never saw a test photo. Method and per-class detail in <Link to="/console/model" className="underline decoration-line-strong underline-offset-2 hover:text-ink">the model card</Link>.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
