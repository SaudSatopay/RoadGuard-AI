import { useApi } from "@shared/lib/api.js";
import { number } from "@shared/lib/format.js";
import { DefectGlyph } from "@shared/ui/marks.jsx";
import { ErrorState, Loading, PageHead, SectionHead } from "../ui.jsx";

const CLASS_ORDER = ["longitudinal_crack", "transverse_crack", "alligator_crack", "pothole"];
const COUNTRY = { India: "India", Japan: "Japan", Czech: "Czech Republic", United_States: "United States", China_MotorBike: "China (motorbike)" };
// The only test photos neither model could have trained on: RoadGuard saw no test photo, and the previous model
// saw no photo at all from these countries (RoadGuard did train on other photos from them).
const CLEAN = ["Czech", "United_States", "China_MotorBike"];

function cleanMean(card) {
  const v = CLEAN.map((k) => card.per_country?.[k]?.map50 ?? card.per_country_map50?.[k]).filter((x) => x != null);
  return v.length === CLEAN.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}

function Compare({ label, ours, base }) {
  return (
    <div className="grid grid-cols-[minmax(0,10rem)_1fr] items-center gap-3 py-2 sm:grid-cols-[13rem_1fr]">
      <span className="min-w-0 text-sm leading-snug">{label}</span>
      <div className="space-y-1">
        {[["ours", ours], ["base", base]].map(([k, v]) => (
          <div key={k} className="flex items-center gap-2">
            <div className="relative h-2.5 flex-1 bg-paper-3">
              <div className={`absolute inset-y-0 left-0 ${k === "ours" ? "bg-paint-deep" : "border border-ink-3"}`} style={{ width: `${(v ?? 0) * 100}%` }} />
            </div>
            <span className={`w-11 text-right font-mono text-xs num ${k === "ours" ? "" : "text-ink-3"}`}>{v == null ? "—" : v.toFixed(3)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ModelCard() {
  const { data, error, loading, reload } = useApi("/model");
  if (loading && !data) return <Loading label="Loading model card" rows={6} />;
  if (error && !data) return <ErrorState error={error} onRetry={reload} title="Couldn't load the model card" />;
  const det = data?.detector || {};
  const m = det.metrics || {};
  const b = det.baseline || {};
  const test = m.test || m;
  const baseTest = b.test || b.metrics?.test || {};
  const fair = cleanMean(m);
  const fairBase = cleanMean(b);
  const countryMap50 = (k) => m.per_country?.[k]?.map50 ?? m.per_country_map50?.[k];
  const india = countryMap50("India");
  const lowerThanIndia = Object.keys(COUNTRY)
    .filter((k) => k !== "India" && countryMap50(k) != null && countryMap50(k) < india)
    .map((k) => `${COUNTRY[k]} (${countryMap50(k).toFixed(2)})`);
  const fmt = (v, d = 3) => (v != null ? v.toFixed(d) : "—");
  return (
    <div className="space-y-8">
      <PageHead title="Model card" sub={`${det.name || "Detector"} · ${det.runtime || ""}`} />
      <div>
        <div className="grid gap-px border-y border-line bg-line sm:grid-cols-2 lg:grid-cols-4 [&>div]:bg-paper [&>div]:px-4 [&>div]:py-4">
          <div><p className="label text-ink-3">mAP@0.5 · photos neither model saw</p><p className="mt-1 font-display text-5xl font-bold leading-none num">{fmt(fair)}</p><p className="mt-1 text-xs text-ink-3">previous model {fmt(fairBase)} · Czech, US and China test photos</p></div>
          <div><p className="label text-ink-3">mAP@0.5 · all test photos</p><p className="mt-1 font-display text-5xl font-bold leading-none num">{fmt(test.map50)}</p><p className="mt-1 text-xs text-ink-3">mAP@0.5:0.95 {fmt(test.map50_95)} · previous {fmt(baseTest.map50)}*</p></div>
          <div><p className="label text-ink-3">Precision · recall</p><p className="mt-1 font-display text-5xl font-bold leading-none num">{test.precision != null ? `${test.precision.toFixed(2)} · ${test.recall.toFixed(2)}` : "—"}</p><p className="mt-1 text-xs text-ink-3">F1 {fmt(test.f1)}</p></div>
          <div><p className="label text-ink-3">Per photo</p><p className="mt-1 font-display text-5xl font-bold leading-none num">{det.latency_ms != null ? Math.round(det.latency_ms) : "—"}<span className="text-xl"> ms</span></p><p className="mt-1 text-xs text-ink-3">{det.params_m ? `${det.params_m} M parameters · ${det.imgsz}px` : ""}{det.cpu_onnx_latency_ms ? ` · ${Math.round(det.cpu_onnx_latency_ms)} ms on CPU` : ""}</p></div>
        </div>
        {baseTest.map50 != null && (
          <p className="mt-2 max-w-[78ch] text-xs text-ink-3">* The previous model trained on RDD2022 India and Japan photos from the same pool as this test split, so its all-photo, India and Japan scores are likely inflated. Czech, US and China test photos are the only ones neither model could have trained on; RoadGuard trained on other photos from those countries, the previous model on none.</p>
        )}
      </div>

      <div className="grid gap-10 lg:grid-cols-2">
        <section aria-labelledby="class-h">
          <SectionHead title={<span id="class-h">AP@0.5 by defect</span>}>
            <span className="flex items-center gap-1.5"><span className="h-2 w-4 bg-paint-deep" /> RoadGuard</span>
            <span className="flex items-center gap-1.5"><span className="h-2 w-4 border border-ink-3" /> previous</span>
          </SectionHead>
          <div className="mt-2 divide-y divide-line">
            {CLASS_ORDER.map((k) => {
              const c = (det.classes || []).find((x) => x.key === k);
              return <Compare key={k} label={<span className="inline-flex items-center gap-2"><DefectGlyph code={c?.code || k} />{c ? `${c.code} · ${c.label}` : k}</span>} ours={test.per_class_ap50?.[k]} base={baseTest.per_class_ap50?.[k]} />;
            })}
          </div>
        </section>
        <section aria-labelledby="country-h">
          <SectionHead title={<span id="country-h">mAP@0.5 by country</span>} />
          <div className="mt-2 divide-y divide-line">
            {Object.keys(COUNTRY).map((k) => <Compare key={k} label={COUNTRY[k]} ours={m.per_country?.[k]?.map50 ?? m.per_country_map50?.[k]} base={b.per_country?.[k]?.map50 ?? b.per_country_map50?.[k]} />)}
          </div>
          <p className="mt-3 text-xs text-ink-3">The previous model trained on RDD2022 Japan and India; this split's Japan and India photos may overlap its training data, which would inflate its scores there.</p>
        </section>
      </div>

      <div className="grid gap-10 lg:grid-cols-2">
        <section aria-labelledby="data-h">
          <SectionHead title={<span id="data-h">Training data</span>} />
          {det.trained_on ? (
            <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
              <div><dt className="label text-ink-3">Dataset</dt><dd>{det.trained_on.dataset}</dd></div>
              <div><dt className="label text-ink-3">License</dt><dd>{det.trained_on.license}</dd></div>
              <div className="col-span-2"><dt className="label text-ink-3">Countries</dt><dd>{(det.trained_on.countries || []).join(", ")}</dd></div>
              <div><dt className="label text-ink-3">Train / val / test</dt><dd className="font-mono num">{number(det.trained_on.train_images)} / {number(det.trained_on.val_images)} / {number(det.trained_on.test_images)}</dd></div>
              <div><dt className="label text-ink-3">Recipe</dt><dd>{det.trained_on.recipe || "—"}</dd></div>
            </dl>
          ) : <p className="mt-3 text-sm text-ink-2">The evaluation for this detector hasn't been published yet; <span className="font-mono text-xs">training/export.py</span> writes it after training.</p>}
        </section>
        <section aria-labelledby="pipe-h">
          <SectionHead title={<span id="pipe-h">Pipeline</span>} />
          <ol className="mt-3 space-y-2 text-sm">
            {(data?.pipeline || []).map((p, i) => (
              <li key={p} className="grid grid-cols-[2rem_1fr] gap-2"><span className="font-mono text-xs num text-ink-3">{String(i + 1).padStart(2, "0")}</span><span>{p}</span></li>
            ))}
          </ol>
          {data?.segmenter && <p className="mt-4 text-xs text-ink-3">Crack geometry: {data.segmenter.name} ({data.segmenter.file}), mask mAP@0.5 {data.segmenter.metrics?.mask_map50 ?? "—"}.</p>}
        </section>
      </div>

      <section aria-labelledby="limits-h">
        <SectionHead title={<span id="limits-h">Limits</span>} />
        <ul className="mt-3 max-w-[78ch] list-disc space-y-1.5 pl-5 text-sm text-ink-2">
          {india != null && (
            <li>India, where RoadGuard matters most, scores {fmt(india, 2)} mAP@0.5 on held-out photos, {lowerThanIndia.length ? `below every country except ${lowerThanIndia.join(" and ")}` : "its lowest country"}; expect more misses on Mumbai photos than the overall figure suggests.</li>
          )}
          <li>RDD2022 is mostly dashcam footage in daylight. Night, rain and close-up phone photos are under-represented, so expect lower recall there.</li>
          <li>Crack length in metres assumes the photo spans one 3.6 m lane; treat it as an estimate, not a survey measurement.</li>
          <li>Rupee estimates come from typical municipal repair rates, not a tender. Deterioration forecasts are rule-based, not learned.</li>
          <li>Severity uses the road class the reporter chose. A wrong road class shifts the score by up to 9 points.</li>
        </ul>
      </section>
    </div>
  );
}
