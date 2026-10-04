// Vite plugin: bakes a static copy of the landing hero into index.html.
// The photo starts downloading before any JavaScript runs (faster first paint), and visitors without
// JavaScript still see the road with its survey marks. React replaces it on mount.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { bracketPaths, isLargeArea, ringPath, SHAPE_BY_CODE, ticks } from "../shared/lib/spray.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const SHOWCASE = path.join(here, "..", "shared", "data", "showcase.json");

function escape(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
}

export function posterMarkup() {
  const { items } = JSON.parse(fs.readFileSync(SHOWCASE, "utf8"));
  const it = items[0];
  const marks = it.detections
    .map((d, i) => {
      const color = d.severity_level === "S4" ? "var(--color-crit)" : "var(--color-paint)";
      const shapes = isLargeArea(d.bbox, it.width, it.height)
        ? bracketPaths(d.bbox, i + 1)
        : [ringPath(d.bbox, i + 1 + Math.round(d.bbox[0]), SHAPE_BY_CODE[d.code] || "ellipse")];
      const t = ticks(d.bbox, d.severity_level).map((p) => `<path d="${p}" stroke="${color}" stroke-width="3" fill="none" stroke-linecap="round"/>`).join("");
      return shapes.map((p) => `<path d="${p}" fill="none" stroke="${color}" stroke-width="4.2" stroke-linecap="round"/>`).join("") + t;
    })
    .join("");
  return `<div id="rg-poster" class="mx-auto grid max-w-[1240px] grid-cols-1 gap-x-10 gap-y-8 px-4 pb-24 pt-[82px] sm:px-6 lg:grid-cols-12 lg:grid-rows-[auto_1fr] lg:gap-y-7 lg:pt-[118px]">
  <div class="lg:col-span-5 lg:col-start-1 lg:row-start-1 lg:pt-6">
    <p class="label text-ink-3">Road hazard survey · Mumbai &amp; Navi Mumbai</p>
    <h1 class="mt-6 font-display text-[clamp(3.4rem,8.2vw,7.6rem)] font-extrabold leading-[0.88] tracking-[-0.01em] text-ink">Every pothole,<br>on the record.</h1>
  </div>
  <div class="lg:col-span-5 lg:col-start-1 lg:row-start-2">
    <p class="max-w-[34rem] text-lg leading-relaxed text-ink-2">Photograph a damaged road. RoadGuard marks each pothole and crack the way an inspector would, works out how bad it is and what the repair will cost, and keeps the complaint public until the road is fixed.</p>
    <noscript><p class="mt-6 border-l-[3px] border-crit pl-3 text-sm">The inspector console and the citizen app need JavaScript. This page shows a sample survey without it.</p></noscript>
  </div>
  <div class="lg:col-span-7 lg:col-start-6 lg:row-span-2 lg:row-start-1"><div class="lg:-mr-6 xl:-mr-16">
    <div class="relative w-full overflow-hidden rounded-md bg-asphalt" style="aspect-ratio:${it.width} / ${it.height}">
      <img src="${escape(it.src)}" alt="Road photograph: ${escape(it.source)}" width="${it.width}" height="${it.height}" fetchpriority="high" class="absolute inset-0 h-full w-full object-cover">
      <svg viewBox="0 0 ${it.width} ${it.height}" preserveAspectRatio="none" class="absolute inset-0 h-full w-full" aria-hidden="true">${marks}</svg>
    </div>
  </div></div>
</div>
<script>if (location.pathname !== "/") document.getElementById("rg-poster").remove();</script>`;
}

export function heroPoster() {
  return {
    name: "roadguard-hero-poster",
    transformIndexHtml(html) {
      if (!html.includes("<!--hero-poster-->")) return html;
      try {
        return html.replace("<!--hero-poster-->", posterMarkup());
      } catch (err) {
        this?.warn?.(`hero poster skipped: ${err.message}`);
        return html.replace("<!--hero-poster-->", "");
      }
    },
  };
}
