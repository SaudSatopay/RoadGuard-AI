import { useEffect, useRef, useState } from "react";
import { useEntrance } from "@shared/lib/motion.js";
import { ArrowRight, ArrowUpRight, Camera, LoaderCircle } from "lucide-react";
import MarkedPhoto from "@shared/ui/MarkedPhoto.jsx";
import { CodeBadge, SeverityChip } from "@shared/ui/marks.jsx";
import { api } from "@shared/lib/api.js";
import { conf, number, rupees } from "@shared/lib/format.js";
import { Link } from "@shared/lib/router.js";
import showcase from "@shared/data/showcase.json";
import facts from "./facts.json";
import { citizenAppUrl } from "./links.js";
import { thumbSrc } from "./showcase.js";

function Headline() {
  const reduce = !useEntrance();
  const lines = [["Every", "pothole,"], ["on", "the", "record."]];
  let k = 0;
  return (
    <h1 className="font-display text-[clamp(3.4rem,8.2vw,7.6rem)] font-extrabold leading-[0.88] tracking-[-0.01em] text-ink">
      {lines.map((words, li) => (
        <span key={li} className="block">
          {words.map((w) => {
            const i = k++;
            return (
              <span
                key={w}
                className={`mr-[0.18em] inline-block ${reduce ? "" : "rg-rise"}`}
                style={reduce ? undefined : { animationDelay: `${0.05 + i * 0.06}s` }}
              >
                {w === "record." ? (
                  <span className="relative inline-block">
                    record.
                    <span aria-hidden="true" className="absolute -bottom-[0.06em] left-0 right-[0.25em] h-[0.14em] bg-paint" />
                  </span>
                ) : w}
              </span>
            );
          })}
        </span>
      ))}
    </h1>
  );
}

// The compare handle comes to rest just left of the leftmost mark, so every mark is visible on load.
function restingSplit(item) {
  const left = Math.min(...item.detections.map((d) => d.bbox[0] / item.width));
  return Math.min(0.38, Math.max(0.15, left - 0.04));
}

function Legend({ item }) {
  return (
    <ol className="divide-y divide-line border-y border-line">
      {item.detections.map((d) => (
        <li key={d.id} className="grid grid-cols-[auto_1fr_auto] items-center gap-x-3 py-2 text-sm">
          <CodeBadge code={d.code} />
          <span className="min-w-0 truncate">
            <span className="text-ink">{d.label}</span>
            <span className="ml-2 font-mono text-xs num text-ink-3">conf {conf(d.confidence)}</span>
          </span>
          <span className="flex items-center gap-2">
            {d.cost_estimated ? <span className="hidden font-mono text-xs num text-ink-2 sm:inline">{rupees(d.cost_estimated)}</span> : null}
            <SeverityChip level={d.severity_level} score={d.severity} showName={false} />
          </span>
        </li>
      ))}
    </ol>
  );
}

export default function Hero() {
  const [index, setIndex] = useState(0);
  const [own, setOwn] = useState(null); // result for the visitor's own photo
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const fileRef = useRef(null);
  const items = showcase.items;
  const item = own || items[index];

  useEffect(() => () => { if (own?.src?.startsWith("blob:")) URL.revokeObjectURL(own.src); }, [own]);

  async function tryPhoto(file) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("That file isn't a photo. Choose a JPEG or PNG of a road.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await api("/detect", { method: "POST", form: { file, road_class: "arterial", confidence: 0.3 }, timeout: 60000 });
      setOwn({
        file: file.name,
        src: URL.createObjectURL(file),
        source: `Your photo · ${file.name}`,
        width: res.image?.width,
        height: res.image?.height,
        model: res.model?.name,
        runtime: res.model?.runtime,
        inference_ms: res.inference_ms,
        detections: res.detections.map((d) => ({ ...d, cost_estimated: d.cost?.cost_estimated })),
        live: true,
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const rg = facts.roadguard;
  const enter = useEntrance();
  return (
    <section className="relative overflow-x-clip" aria-labelledby="hero-title">
      <div className="mx-auto grid max-w-[1240px] grid-cols-1 gap-x-10 gap-y-8 px-4 pb-24 pt-8 sm:px-6 lg:grid-cols-12 lg:grid-rows-[auto_1fr] lg:gap-y-7 lg:pt-16">
        <div className="lg:col-span-5 lg:col-start-1 lg:row-start-1 lg:pt-6">
          <p className="label flex items-center gap-3 text-ink-3">
            <span className="whitespace-nowrap rounded-xs border border-line-strong px-1.5 py-0.5 text-ink-2">CH 0+000</span>
            Road hazard survey · Mumbai &amp; Navi Mumbai
          </p>
          <div id="hero-title" className="mt-6">
            <Headline />
          </div>
        </div>

        <div className="lg:col-span-7 lg:col-start-6 lg:row-span-2 lg:row-start-1">
          <div className="lg:-mr-6 xl:-mr-16">
            <MarkedPhoto
              key={item.src}
              src={item.src}
              width={item.width}
              height={item.height}
              detections={item.detections}
              mode="compare"
              sweep
              initialSplit={restingSplit(item)}
              ruler
              priority
              alt={`Road photograph: ${item.source}`}
            />
          </div>
          <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
            <p className="font-mono text-xs num text-ink-3">
              {item.source}
              <br />
              {item.detections.length} defect{item.detections.length === 1 ? "" : "s"} · {item.model}
              {item.inference_ms ? ` · analysed in ${Math.round(item.inference_ms)} ms` : ""}
              {item.live ? " · live" : ""}
            </p>
            <div className="flex items-center gap-2">
              <input ref={fileRef} type="file" accept="image/*" className="sr-only" tabIndex={-1} aria-hidden="true" onChange={(e) => tryPhoto(e.target.files?.[0])} />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={busy}
                className={`inline-flex h-10 items-center gap-2 rounded-sm border border-line-strong bg-sheet px-3 text-sm font-medium text-ink transition-colors duration-150 [@media(hover:hover)]:hover:border-ink ${busy ? "opacity-70" : ""}`}
              >
                {busy ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Camera className="h-4 w-4" aria-hidden="true" />}
                {busy ? "Marking your photo…" : "Try it on your own photo"}
              </button>
              {own && (
                <button type="button" onClick={() => setOwn(null)} className="h-10 rounded-sm px-3 text-sm text-ink-2 underline decoration-line-strong underline-offset-4 hover:text-ink">
                  Back to samples
                </button>
              )}
            </div>
          </div>
          {error && (
            <p role="alert" className="mt-3 border-l-[3px] border-crit bg-crit-wash px-3 py-2 text-sm text-ink">{error}</p>
          )}
          <div className="mt-5">
            <Legend item={item} />
          </div>
          {!own && (
            <div className="mt-5 flex items-center gap-2 overflow-x-auto pb-1" role="group" aria-label="Other sample roads">
              <span className="label mr-1 shrink-0 text-ink-3">Other roads</span>
              {items.map((it, i) => (
                <button
                  key={it.file}
                  type="button"
                  onClick={() => setIndex(i)}
                  aria-pressed={i === index}
                  aria-label={`Show ${it.source}`}
                  className={`relative h-12 w-12 shrink-0 overflow-hidden rounded-xs border-2 transition-[border-color,transform] duration-150 ${i === index ? "border-paint-deep" : "border-transparent [@media(hover:hover)]:hover:-translate-y-0.5"}`}
                >
                  <img src={thumbSrc(it)} alt="" width="48" height="48" loading="lazy" decoding="async" className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="lg:col-span-5 lg:col-start-1 lg:row-start-2">
          <p
            className={`max-w-[34rem] text-lg leading-relaxed text-ink-2 ${enter ? "rg-fade-in" : ""}`}
            style={enter ? { animationDelay: "0.35s", animationDuration: "400ms" } : undefined}
          >
            Photograph a damaged road. RoadGuard marks each pothole and crack the way an inspector would, works out how
            bad it is and what the repair will cost, and keeps the complaint public until the road is fixed.
          </p>
          <div
            className={`mt-9 flex flex-wrap items-center gap-3 ${enter ? "rg-fade-in" : ""}`}
            style={enter ? { animationDelay: "0.45s", animationDuration: "350ms" } : undefined}
          >
            <a
              href={citizenAppUrl()}
              className="group inline-flex h-12 items-center gap-2 rounded-sm bg-paint px-5 font-display text-lg font-bold uppercase tracking-[0.02em] text-paint-ink transition-transform duration-150 ease-out active:scale-[0.98] [@media(hover:hover)]:hover:-translate-y-0.5"
            >
              Report a road
              <ArrowUpRight className="h-5 w-5 transition-transform duration-150 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" aria-hidden="true" />
            </a>
            <Link
              to="/console"
              className="group inline-flex h-12 items-center gap-2 rounded-sm border-[1.5px] border-ink px-5 font-display text-lg font-bold uppercase tracking-[0.02em] text-ink transition-colors duration-150 [@media(hover:hover)]:hover:bg-ink [@media(hover:hover)]:hover:text-paper"
            >
              Inspector console
              <ArrowRight className="h-5 w-5 transition-transform duration-150 group-hover:translate-x-0.5" aria-hidden="true" />
            </Link>
          </div>
          <dl className="mt-12 grid max-w-md grid-cols-3 gap-x-6 border-t border-line pt-5">
            <div>
              <dt className="label text-ink-3">Trained on</dt>
              <dd className="mt-1 font-display text-3xl font-bold num">{number(facts.dataset.train_images / 1000, 1)}k</dd>
              <dd className="text-xs text-ink-3">road photos, 5 countries</dd>
            </div>
            {rg ? (
              <>
                <div>
                  <dt className="label normal-case text-ink-3">mAP@0.5</dt>
                  <dd className="mt-1 font-display text-3xl font-bold num">{rg.test.map50.toFixed(2)}</dd>
                  <dd className="text-xs text-ink-3">held-out test, {number(facts.dataset.test_images)} photos</dd>
                </div>
                <div>
                  <dt className="label text-ink-3">Per photo</dt>
                  <dd className="mt-1 font-display text-3xl font-bold num">{Math.round(rg.latency_ms)}<span className="text-lg"> ms</span></dd>
                  <dd className="text-xs text-ink-3">on one GPU · {Math.round(rg.cpu_onnx_latency_ms)} ms CPU</dd>
                </div>
              </>
            ) : (
              <>
                <div>
                  <dt className="label text-ink-3">Defects</dt>
                  <dd className="mt-1 font-display text-3xl font-bold num">4</dd>
                  <dd className="text-xs text-ink-3">pothole and three crack types</dd>
                </div>
                <div>
                  <dt className="label text-ink-3">Merged within</dt>
                  <dd className="mt-1 font-display text-3xl font-bold num">25<span className="text-lg"> m</span></dd>
                  <dd className="text-xs text-ink-3">duplicate reports become one</dd>
                </div>
              </>
            )}
          </dl>
        </div>

      </div>
    </section>
  );
}
