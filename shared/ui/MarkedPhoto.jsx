// The Inspector's Mark: a road photograph with RoadGuard's detections sprayed on as paint rings.
// Used by the landing hero, the console's scan and hazard views, and the citizen report result.
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useEntrance } from "../lib/motion.js";
import { defectOf, levelOf } from "../lib/roadguard.js";
import { conf, rupees } from "../lib/format.js";
import { bracketPaths, isLargeArea, overspray, ringPath, SHAPE_BY_CODE, ticks } from "../lib/spray.js";

const STROKE = { S1: 2.4, S2: 3.2, S3: 4.2, S4: 4.6 };
const SWEEP = (prop) => `${prop} 850ms cubic-bezier(0.2, 0.7, 0.2, 1) 250ms`;

function normalise(det, i, width, height) {
  const d = defectOf(det.code || det.class_key || det.label || det.display_name);
  const level = det.severity_level || levelOf(det.severity);
  let bbox = det.bbox;
  if ((!bbox || !width) && det.bbox_norm) {
    bbox = [det.bbox_norm[0] * width, det.bbox_norm[1] * height, det.bbox_norm[2] * width, det.bbox_norm[3] * height];
  }
  return {
    id: det.id || `d${i + 1}`,
    code: d?.code || "D??",
    label: d?.label || det.label || "Defect",
    shape: (d && SHAPE_BY_CODE[d.code]) || "ellipse",
    level,
    confidence: det.confidence,
    cost: det.cost_estimated ?? det.cost?.cost_estimated,
    bbox,
  };
}

/**
 * @param {object} props
 * @param {string} props.src image URL
 * @param {number} props.width natural width in px (bbox coordinates are in this space)
 * @param {number} props.height natural height in px
 * @param {Array} props.detections RoadGuard Detection objects
 * @param {"compare"|"marks"} [props.mode]
 */
export default function MarkedPhoto({
  src,
  width,
  height,
  detections = [],
  mode = "marks",
  initialSplit = 0.42,
  sweep = false,
  notes = "auto",
  ruler = false,
  activeId,
  onActiveChange,
  alt = "Road photograph",
  priority = false,
  className = "",
  children,
}) {
  const uid = useId().replace(/:/g, "");
  const reduce = !useEntrance(); // no entrance: reduced motion, or the page isn't visible yet
  const box = useRef(null);
  const [boxWidth, setBoxWidth] = useState(0);
  const [hover, setHover] = useState(null);
  const active = activeId ?? hover;
  const marks = useMemo(
    () => detections.map((d, i) => normalise(d, i, width, height)).filter((m) => m.bbox),
    [detections, width, height],
  );
  const compact = notes === "compact" || (notes === "auto" && boxWidth > 0 && boxWidth < 520);
  const showNotes = notes !== "none";

  useEffect(() => {
    const el = box.current;
    if (!el || typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver(([entry]) => setBoxWidth(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Split between "as photographed" (left) and "as surveyed" (right), 0..1
  const [split, setSplit] = useState(mode === "compare" ? (sweep && !reduce ? 1 : initialSplit) : 0);
  const [sweeping, setSweeping] = useState(false);
  const splitPct = Math.round(split * 100);

  useEffect(() => {
    if (mode !== "compare" || !sweep || reduce) return undefined;
    // One orchestrated sweep from the right edge to the resting split; then the handle belongs to the visitor.
    const raf = requestAnimationFrame(() => {
      setSweeping(true);
      setSplit(initialSplit);
    });
    const done = setTimeout(() => setSweeping(false), 1200);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(done);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const moveTo = useCallback((v) => {
    setSweeping(false);
    setSplit(Math.min(1, Math.max(0, v)));
  }, []);

  const setFromClientX = useCallback(
    (clientX) => {
      const rect = box.current?.getBoundingClientRect();
      if (rect) moveTo((clientX - rect.left) / rect.width);
    },
    [moveTo],
  );

  const dragging = useRef(false);
  const onPointerDown = (e) => {
    if (mode !== "compare") return;
    dragging.current = true;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    setFromClientX(e.clientX);
  };
  const onPointerMove = (e) => {
    if (dragging.current) setFromClientX(e.clientX);
  };
  const onPointerUp = () => {
    dragging.current = false;
  };
  const onKeyDown = (e) => {
    const step = e.shiftKey ? 0.1 : 0.04;
    const map = { ArrowLeft: -step, ArrowDown: -step, ArrowRight: step, ArrowUp: step };
    if (e.key in map) {
      e.preventDefault();
      moveTo(split + map[e.key]);
    } else if (e.key === "Home" || e.key === "End") {
      e.preventDefault();
      moveTo(e.key === "Home" ? 0 : 1);
    }
  };

  const drawDelay = (m, i) => {
    if (reduce) return 0;
    if (mode === "compare" && sweep) {
      // a mark draws as the handle sweeps past its right edge
      const right = m.bbox[2] / width;
      return 0.25 + Math.max(0, (1 - right) / (1 - initialSplit + 0.0001)) * 0.85 * 0.9;
    }
    return 0.1 + i * 0.07;
  };

  const setActive = (id) => onActiveChange ? onActiveChange(id) : setHover(id);
  const surveyed = (
    <>
      <svg className="absolute inset-0 h-full w-full" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <filter id={`spray-${uid}`} x="-10%" y="-10%" width="120%" height="120%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="0.45" />
          </filter>
        </defs>
        {marks.map((m, i) => {
          const color = m.level === "S4" ? "var(--color-crit)" : "var(--color-paint)";
          const dim = active && active !== m.id;
          const delay = drawDelay(m, i);
          return (
            <g key={m.id} filter={`url(#spray-${uid})`} style={{ opacity: dim ? 0.3 : 1, transition: "opacity 160ms ease-out" }}>
              {(isLargeArea(m.bbox, width, height) ? bracketPaths(m.bbox, i + 1) : [ringPath(m.bbox, i + 1 + Math.round(m.bbox[0]), m.shape)]).map((d, k) => (
                <path
                  key={k}
                  d={d}
                  pathLength={1}
                  fill="none"
                  stroke={color}
                  strokeWidth={STROKE[m.level] * Math.max(1, width / 900)}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className={reduce ? undefined : "rg-draw"}
                  style={reduce ? undefined : { animationDelay: `${delay + k * 0.06}s` }}
                />
              ))}
              {ticks(m.bbox, m.level).map((d, k) => (
                <path key={k} d={d} pathLength={1} fill="none" stroke={color} strokeWidth={3 * Math.max(1, width / 900)} strokeLinecap="round"
                  className={reduce ? undefined : "rg-draw"}
                  style={reduce ? undefined : { animationDelay: `${delay + 0.38 + k * 0.08}s`, animationDuration: "180ms" }} />
              ))}
              {!isLargeArea(m.bbox, width, height) && overspray(m.bbox, i + 3).map((dot, k) => (
                <circle key={k} cx={dot.x} cy={dot.y} r={dot.r * Math.max(1, width / 900)} fill={color} opacity={0.55}
                  className={reduce ? undefined : "rg-fade-in"} style={reduce ? undefined : { animationDelay: `${delay + 0.3}s` }} />
              ))}
            </g>
          );
        })}
      </svg>
      {showNotes && marks.map((m) => <FieldNote key={m.id} m={m} width={width} height={height} compact={compact}
        dim={active && active !== m.id} onEnter={() => setActive(m.id)} onLeave={() => setActive(null)} />)}
    </>
  );

  const summary = marks.length
    ? `${marks.length} defect${marks.length > 1 ? "s" : ""} marked: ${marks.map((m) => `${m.code} ${m.label} (${m.level})`).join(", ")}.`
    : "No defects marked.";

  return (
    <figure className={`m-0 ${className}`}>
      <div
        ref={box}
        className="relative w-full overflow-hidden rounded-md bg-asphalt select-none"
        style={{ aspectRatio: `${width} / ${height}`, touchAction: mode === "compare" ? "pan-y" : undefined }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <img src={src} alt={alt} width={width} height={height} draggable="false"
          className="absolute inset-0 h-full w-full object-cover" fetchPriority={priority ? "high" : undefined}
          loading={priority ? "eager" : "lazy"} decoding="async" />
        {mode === "compare" ? (
          <div className="absolute inset-0" style={{ clipPath: `inset(0 0 0 ${(split * 100).toFixed(2)}%)`, transition: sweeping ? SWEEP("clip-path") : "none" }}>
            <img src={src} alt="" aria-hidden="true" width={width} height={height} draggable="false"
              className="absolute inset-0 h-full w-full object-cover [filter:grayscale(0.55)_contrast(1.08)_brightness(0.86)]" />
            {surveyed}
          </div>
        ) : (
          <div className="absolute inset-0">{surveyed}</div>
        )}
        {mode === "compare" && (
          <>
            <div className="pointer-events-none absolute inset-y-0 w-0" style={{ left: `${split * 100}%`, transition: sweeping ? SWEEP("left") : "none" }}>
              <div className="absolute inset-y-0 -left-px w-[2px] bg-paint" />
            </div>
            <div
              role="slider"
              tabIndex={0}
              aria-label="Compare the photo as taken with the survey marks"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={splitPct}
              aria-valuetext={`${100 - splitPct}% of the frame surveyed`}
              onKeyDown={onKeyDown}
              className="absolute top-1/2 z-10 flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize items-center justify-center rounded-full bg-paint text-paint-ink shadow-lift touch-none"
              style={{ left: `${split * 100}%`, transition: sweeping ? SWEEP("left") : "none" }}
            >
              <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M7.5 5.5 3 10l4.5 4.5M12.5 5.5 17 10l-4.5 4.5" />
              </svg>
            </div>
            <span className="pointer-events-none absolute left-3 top-3 label rounded-xs bg-asphalt/80 px-1.5 py-1 text-chalk">As photographed</span>
            <span className="pointer-events-none absolute right-3 top-3 label rounded-xs bg-paint px-1.5 py-1 text-paint-ink">As surveyed</span>
          </>
        )}
        {children}
      </div>
      {ruler && <OffsetRuler marks={marks} width={width} active={active} />}
      <figcaption className="sr-only">{summary}</figcaption>
    </figure>
  );
}

function FieldNote({ m, width, height, compact, dim, onEnter, onLeave }) {
  const [x1, y1, x2, y2] = m.bbox;
  const nearTop = y1 / height < 0.14;
  const anchorRight = x1 / width > 0.62;
  const style = {
    top: nearTop ? `${(y2 / height) * 100}%` : `${(y1 / height) * 100}%`,
    transform: nearTop ? "translateY(8px)" : "translateY(calc(-100% - 8px))",
    ...(anchorRight ? { right: `${(1 - x2 / width) * 100}%` } : { left: `${(x1 / width) * 100}%` }),
    opacity: dim ? 0.35 : 1,
  };
  const crit = m.level === "S4";
  return (
    <div
      className={`absolute z-[1] max-w-[70%] rounded-xs px-1.5 py-1 shadow-lift transition-opacity duration-150 ${crit ? "bg-crit text-white" : "bg-paint text-paint-ink"}`}
      style={style}
      onPointerEnter={onEnter}
      onPointerLeave={onLeave}
    >
      <div className="sign text-[13px] leading-none whitespace-nowrap">
        <span className="font-mono text-[11px] font-semibold tracking-normal">{m.code}</span> {compact ? m.level : m.label}
      </div>
      {!compact && (
        <div className="mt-0.5 font-mono text-[10.5px] leading-none num whitespace-nowrap opacity-90">
          {conf(m.confidence)} · {m.level}{m.cost ? ` · ${rupees(m.cost, { compact: true })}` : ""}
        </div>
      )}
    </div>
  );
}

const LANE_M = 3.6;

/** Where each defect sits across the lane (offset from the left edge of the frame), assuming one 3.6 m lane. */
function OffsetRuler({ marks, width, active }) {
  const ticks = [0, 0.6, 1.2, 1.8, 2.4, 3.0, 3.6];
  return (
    <div className="mt-3 select-none" aria-hidden="true">
      <div className="relative h-9">
        <div className="absolute inset-x-0 top-4 h-px bg-line-strong" />
        {ticks.map((t) => (
          <div key={t} className="absolute top-2.5" style={{ left: `${(t / LANE_M) * 100}%` }}>
            <div className={`w-px bg-ink-3 ${Math.round(t * 10) % 12 === 0 ? "h-3.5" : "h-2"}`} />
          </div>
        ))}
        {marks.map((m) => {
          const cx = (m.bbox[0] + m.bbox[2]) / 2 / width;
          return (
            <div key={m.id} className="absolute top-0 -translate-x-1/2 transition-opacity duration-150"
              style={{ left: `${cx * 100}%`, opacity: active && active !== m.id ? 0.35 : 1 }}>
              <div className={`h-0 w-0 border-x-[5px] border-t-[7px] border-x-transparent ${m.level === "S4" ? "border-t-crit" : "border-t-paint-deep"}`} />
            </div>
          );
        })}
      </div>
      <div className="flex justify-between font-mono text-2xs num text-ink-3">
        {ticks.filter((t) => Math.round(t * 10) % 12 === 0).map((t) => <span key={t}>{t.toFixed(1)} m</span>)}
      </div>
    </div>
  );
}
