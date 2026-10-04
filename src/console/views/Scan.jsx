import { useEffect, useRef, useState } from "react";
import { Camera, FileUp, MapPin, Printer, Send, Square, Video } from "lucide-react";
import MarkedPhoto from "@shared/ui/MarkedPhoto.jsx";
import { api } from "@shared/lib/api.js";
import { navigate } from "@shared/lib/router.js";
import { ringPath } from "@shared/lib/spray.js";
import { ROAD_CLASSES } from "@shared/lib/roadguard.js";
import { useSession } from "../session.js";
import EvidenceSheet from "../EvidenceSheet.jsx";
import ErrorBoundary from "@shared/ui/ErrorBoundary.jsx";
import { Button, Empty, ErrorState, PageHead, Segmented, Spinner } from "../ui.jsx";

const MODES = [
  { value: "photo", label: "Photo" },
  { value: "video", label: "Video" },
  { value: "live", label: "Live camera" },
];

function DropZone({ onFile, busy }) {
  const [over, setOver] = useState(false);
  const input = useRef(null);
  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); onFile(e.dataTransfer.files?.[0]); }}
      className={`grain relative flex aspect-[4/3] flex-col items-center justify-center overflow-hidden rounded-md border-2 border-dashed px-6 text-center transition-colors duration-150 ${over ? "border-paint bg-asphalt-2" : "border-asphalt-line bg-asphalt"} on-asphalt text-chalk`}
    >
      <svg width="88" height="88" viewBox="0 0 88 88" aria-hidden="true" className="mb-4">
        <path d={ringPath([18, 22, 70, 66], 5)} fill="none" stroke="var(--color-paint)" strokeWidth="4" strokeLinecap="round" />
      </svg>
      <p className="font-display text-3xl font-bold leading-none">Drop a road photo</p>
      <p className="mt-2 max-w-[38ch] text-sm text-chalk-2">JPEG or PNG, taken at the road surface or from a dashcam. It is only filed if you choose to.</p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <Button variant="paint" size="lg" onClick={() => input.current?.click()} disabled={busy}>
          <FileUp className="h-5 w-5" aria-hidden="true" /> Choose a photo
        </Button>
      </div>
      <input ref={input} type="file" accept="image/*" className="sr-only" tabIndex={-1} onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ""; }} aria-label="Choose a road photo" />
    </div>
  );
}

function FileReport({ result, file, onDone }) {
  const { user } = useSession();
  const [loc, setLoc] = useState({ name: "", lat: "19.0760", lng: "72.8777" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  function useGps() {
    if (!navigator.geolocation) return setError(new Error("This browser can't share its location. Type the coordinates instead."));
    navigator.geolocation.getCurrentPosition(
      (p) => setLoc((l) => ({ ...l, lat: p.coords.latitude.toFixed(5), lng: p.coords.longitude.toFixed(5) })),
      () => setError(new Error("Location permission was refused. Type the coordinates instead.")),
      { enableHighAccuracy: true, timeout: 8000 },
    );
  }

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api("/public/report", {
        method: "POST",
        timeout: 60000,
        form: {
          file,
          latitude: loc.lat,
          longitude: loc.lng,
          location_name: loc.name || "Inspector field scan",
          road_class: result.road_class,
          reporter_name: user?.name || "Inspector",
          description: `Filed from the inspector console (scan ${result.id}).`,
        },
      });
      onDone(res);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-4 space-y-3 border border-line-strong p-4">
      <p className="sign text-lg leading-none">File this as a report</p>
      <label className="block text-sm">
        <span className="label text-ink-3">Location name</span>
        <input value={loc.name} onChange={(e) => setLoc({ ...loc, name: e.target.value })} placeholder="e.g. LBS Marg near Ghatkopar depot"
          className="mt-1 h-10 w-full rounded-xs border border-line-strong bg-sheet px-3 text-sm placeholder:text-ink-3" />
      </label>
      <div className="grid grid-cols-[1fr_1fr_auto] items-end gap-2">
        <label className="block text-sm"><span className="label text-ink-3">Latitude</span>
          <input inputMode="decimal" value={loc.lat} onChange={(e) => setLoc({ ...loc, lat: e.target.value })} className="mt-1 h-10 w-full rounded-xs border border-line-strong bg-sheet px-3 font-mono text-sm" /></label>
        <label className="block text-sm"><span className="label text-ink-3">Longitude</span>
          <input inputMode="decimal" value={loc.lng} onChange={(e) => setLoc({ ...loc, lng: e.target.value })} className="mt-1 h-10 w-full rounded-xs border border-line-strong bg-sheet px-3 font-mono text-sm" /></label>
        <Button variant="outline" onClick={useGps} aria-label="Use my current location"><MapPin className="h-4 w-4" aria-hidden="true" /></Button>
      </div>
      {error && <ErrorState error={error} title="Couldn't file the report" />}
      <Button type="submit" variant="ink" disabled={busy}>{busy ? <Spinner /> : <Send className="h-4 w-4" aria-hidden="true" />} File report</Button>
    </form>
  );
}

function PhotoScan() {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [roadClass, setRoadClass] = useState("arterial");
  const [threshold, setThreshold] = useState(0.25);
  const [thorough, setThorough] = useState(false);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [active, setActive] = useState(null);
  const [filing, setFiling] = useState(false);
  const [filed, setFiled] = useState(null);

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  async function run(f = file, rc = roadClass) {
    if (!f) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api("/detect", { method: "POST", timeout: 90000, form: { file: f, road_class: rc, confidence: threshold, tta: thorough } });
      setResult(res);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  function choose(f) {
    if (!f) return;
    if (!f.type.startsWith("image/")) {
      setError(new Error("That file isn't a photo. Choose a JPEG or PNG of a road."));
      return;
    }
    if (preview) URL.revokeObjectURL(preview);
    setFile(f);
    setPreview(URL.createObjectURL(f));
    setResult(null);
    setFiled(null);
    setFiling(false);
    run(f);
  }

  function reset() {
    setFile(null);
    setResult(null);
    setError(null);
    setFiled(null);
    setFiling(false);
  }

  return (
    <div className="grid gap-6 xl:grid-cols-12">
      <div className="xl:col-span-7">
        {!file ? (
          <DropZone onFile={choose} busy={busy} />
        ) : (
          <div className="relative">
            {result?.image?.width ? (
              <MarkedPhoto src={preview} width={result.image.width} height={result.image.height} detections={result.detections}
                mode="marks" ruler activeId={active} onActiveChange={setActive} alt={`Scanned photo ${file.name}`} />
            ) : (
              <div className="relative overflow-hidden rounded-md bg-asphalt">
                <img src={preview} alt={`Scanned photo ${file.name}`} className="block w-full opacity-60" />
              </div>
            )}
            {busy && (
              <div role="status" className="absolute inset-x-0 top-0 flex items-center gap-2 rounded-t-md bg-asphalt/85 px-3 py-2 text-sm text-chalk">
                <Spinner /> Marking defects…
              </div>
            )}
          </div>
        )}
        {file && (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={reset}><FileUp className="h-4 w-4" aria-hidden="true" /> Another photo</Button>
            {result && <Button variant="outline" onClick={() => window.print()}><Printer className="h-4 w-4" aria-hidden="true" /> Print sheet</Button>}
            {result && !filed && <Button variant="ink" onClick={() => setFiling((v) => !v)}><Send className="h-4 w-4" aria-hidden="true" /> File as report</Button>}
          </div>
        )}
      </div>

      <div className="space-y-4 xl:col-span-5">
        <div className="space-y-3">
          <div>
            <p className="label mb-1.5 text-ink-3">Road class (weights severity)</p>
            <Segmented label="Road class" value={roadClass} size="sm"
              options={ROAD_CLASSES.map((r) => ({ value: r.key, label: r.label }))}
              onChange={(v) => { setRoadClass(v); if (file) run(file, v); }} />
          </div>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <label className="flex items-center gap-2 text-sm">
              <span className="label text-ink-3">Confidence</span>
              <input type="range" min="0.1" max="0.6" step="0.05" value={threshold} onChange={(e) => setThreshold(Number(e.target.value))}
                onPointerUp={() => file && run()} onKeyUp={() => file && run()} className="w-28 accent-[var(--color-ink)]" aria-label="Minimum confidence" />
              <span className="w-9 font-mono text-xs num">{threshold.toFixed(2)}</span>
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={thorough} onChange={(e) => setThorough(e.target.checked)} className="h-4 w-4 accent-[var(--color-ink)]" />
              Thorough pass <span className="text-xs text-ink-3">(slower, finds more hairline cracks)</span>
            </label>
          </div>
        </div>
        {error && <ErrorState error={error} title="The scan didn't finish" onRetry={file ? () => run() : undefined} />}
        {filed ? (
          <div className="border-l-[3px] border-ok bg-ok-wash px-4 py-3">
            <p className="font-medium">{filed.id ? `Filed as ${filed.id}` : filed.message}</p>
            {filed.hazard_id && <p className="mt-1 text-sm text-ink-2">Hazard {filed.hazard_id}{filed.duplicate_of ? ` — merged with ${filed.duplicate_of}, already reported nearby` : ""}.</p>}
            {filed.hazard_id && <Button variant="outline" size="sm" className="mt-3" onClick={() => navigate(`/console/hazards?h=${encodeURIComponent(filed.hazard_id)}`)}>Open hazard</Button>}
          </div>
        ) : filing && result ? (
          <FileReport result={result} file={file} onDone={(res) => { setFiled(res); setFiling(false); }} />
        ) : null}
        {result ? (
          <EvidenceSheet key={result.id + result.road_class + threshold} result={result} active={active} onHover={setActive} />
        ) : !file ? (
          <Empty title="The evidence sheet appears here">
            Each defect gets its RDD code, confidence, a severity score broken into its five factors, crack length where the
            segmentation model can trace it, a rupee estimate and a deterioration forecast.
          </Empty>
        ) : null}
      </div>
    </div>
  );
}

function VideoScan() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [res, setRes] = useState(null);
  const [frame, setFrame] = useState(0);
  const input = useRef(null);

  async function upload(f) {
    if (!f) return;
    if (!f.type.startsWith("video/")) return setError(new Error("That file isn't a video. Choose an MP4, MOV or AVI."));
    setBusy(true);
    setError(null);
    setRes(null);
    try {
      const data = await api("/detect/video", { method: "POST", timeout: 600000, form: { file: f, frame_interval: 30, confidence: 0.3 } });
      setRes(data);
      setFrame(0);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  const frames = res?.frame_results || [];
  const f = frames[frame];
  return (
    <div className="space-y-5">
      {!res && (
        <Empty title="Survey a drive" action={
          <Button variant="paint" size="lg" onClick={() => input.current?.click()} disabled={busy}>
            {busy ? <Spinner /> : <Video className="h-5 w-5" aria-hidden="true" />} {busy ? "Reading frames…" : "Choose a video"}
          </Button>}>
          A dashcam clip is sampled about once a second and every frame with damage is kept, with its timestamp.
        </Empty>
      )}
      <input ref={input} type="file" accept="video/*" className="sr-only" tabIndex={-1} onChange={(e) => { upload(e.target.files?.[0]); e.target.value = ""; }} aria-label="Choose a video" />
      {error && <ErrorState error={error} title="The video couldn't be read" />}
      {res && (
        <>
          <dl className="grid grid-cols-2 gap-px border-y border-line bg-line sm:grid-cols-4 [&>div]:bg-paper [&>div]:px-4 [&>div]:py-3">
            <div><dt className="label text-ink-3">Duration</dt><dd className="font-display text-3xl font-bold num">{res.video_info.duration_sec}s</dd></div>
            <div><dt className="label text-ink-3">Frames with damage</dt><dd className="font-display text-3xl font-bold num">{res.video_info.frames_analyzed}</dd></div>
            <div><dt className="label text-ink-3">Defects</dt><dd className="font-display text-3xl font-bold num">{res.total_detections}</dd></div>
            <div><dt className="label text-ink-3">Processing</dt><dd className="font-display text-3xl font-bold num">{(res.processing_time_ms / 1000).toFixed(1)}s</dd></div>
          </dl>
          {f ? (
            <div className="grid gap-5 lg:grid-cols-12">
              <div className="lg:col-span-8">
                <img src={`data:image/jpeg;base64,${f.annotated_image}`} alt={`Frame at ${f.timestamp_display}`} className="w-full rounded-md" />
              </div>
              <div className="lg:col-span-4">
                <p className="sign text-xl">Frame at {f.timestamp_display}</p>
                <ul className="mt-2 divide-y divide-line border-y border-line text-sm">
                  {f.detections.map((d) => (
                    <li key={d.id} className="flex items-center justify-between py-2"><span>{d.code} · {d.label}</span><span className="font-mono num">{d.severity_level}</span></li>
                  ))}
                </ul>
              </div>
            </div>
          ) : (
            <Empty title="No damage in this clip">The detector didn't find potholes or cracks in any sampled frame.</Empty>
          )}
          {frames.length > 0 && (
            <div className="flex gap-1 overflow-x-auto pb-2" role="listbox" aria-label="Frames with damage">
              {frames.map((fr, i) => (
                <button key={fr.frame_number} type="button" role="option" aria-selected={i === frame} onClick={() => setFrame(i)}
                  className={`h-10 min-w-[3.25rem] shrink-0 rounded-xs px-2 font-mono text-xs num ${i === frame ? "bg-ink text-paper" : "bg-paper-3 text-ink-2 hover:bg-paper-2"}`}>
                  {fr.timestamp_display}
                </button>
              ))}
            </div>
          )}
          <Button variant="outline" onClick={() => setRes(null)}>Another video</Button>
        </>
      )}
    </div>
  );
}

function LiveScan() {
  const video = useRef(null);
  const canvas = useRef(null);
  const timer = useRef(null);
  const [on, setOn] = useState(false);
  const [error, setError] = useState(null);
  const [last, setLast] = useState(null);

  async function start() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment", width: 960, height: 720 } });
      video.current.srcObject = stream;
      await video.current.play();
      setOn(true);
      timer.current = setInterval(tick, 1500);
    } catch {
      setError(new Error("The camera isn't available. Allow camera access in the browser, or use a photo instead."));
    }
  }

  function stop() {
    clearInterval(timer.current);
    video.current?.srcObject?.getTracks().forEach((t) => t.stop());
    if (video.current) video.current.srcObject = null;
    setOn(false);
  }

  async function tick() {
    const v = video.current;
    const c = canvas.current;
    if (!v || !c || !v.videoWidth) return;
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    c.getContext("2d").drawImage(v, 0, 0);
    try {
      const res = await api("/detect/frame", { method: "POST", timeout: 8000, form: { frame_data: c.toDataURL("image/jpeg", 0.75), confidence: 0.3 } });
      setLast({ ...res, w: c.width, h: c.height });
    } catch {
      /* a dropped frame is fine; the next tick retries */
    }
  }

  useEffect(() => () => stop(), []);

  return (
    <div className="grid gap-5 lg:grid-cols-12">
      <div className="lg:col-span-8">
        <div className="relative aspect-[4/3] overflow-hidden rounded-md bg-asphalt">
          <video ref={video} muted playsInline className="absolute inset-0 h-full w-full object-cover" />
          <canvas ref={canvas} className="hidden" />
          {on && last?.detections?.length > 0 && (
            <svg viewBox={`0 0 ${last.w} ${last.h}`} preserveAspectRatio="xMidYMid slice" className="absolute inset-0 h-full w-full" aria-hidden="true">
              {last.detections.map((d, i) => (
                <path key={d.id || i} d={ringPath(d.bbox, i + 1)} fill="none" stroke={d.severity_level === "S4" ? "var(--color-crit)" : "var(--color-paint)"} strokeWidth="5" strokeLinecap="round" />
              ))}
            </svg>
          )}
          {!on && (
            <div className="on-asphalt absolute inset-0 flex flex-col items-center justify-center text-chalk">
              <Camera className="h-10 w-10 text-chalk-2" aria-hidden="true" />
              <p className="mt-3 font-display text-2xl font-bold">Camera off</p>
            </div>
          )}
          {on && <span className="absolute left-3 top-3 label rounded-xs bg-crit px-1.5 py-1 text-white">Live · every 1.5 s</span>}
        </div>
        <div className="mt-4 flex gap-2">
          {on ? <Button variant="outline" onClick={stop}><Square className="h-4 w-4" aria-hidden="true" /> Stop camera</Button>
            : <Button variant="paint" size="lg" onClick={start}><Camera className="h-5 w-5" aria-hidden="true" /> Start camera</Button>}
        </div>
        {error && <div className="mt-4"><ErrorState error={error} title="Camera unavailable" /></div>}
      </div>
      <div className="lg:col-span-4">
        <p className="sign text-xl">Last frame</p>
        {last ? (
          <ul className="mt-2 divide-y divide-line border-y border-line text-sm">
            {last.detections.length ? last.detections.map((d, i) => (
              <li key={d.id || i} className="flex items-center justify-between py-2"><span>{d.code} · {d.label}</span><span className="font-mono num">{d.severity_level}</span></li>
            )) : <li className="py-2 text-ink-2">No damage in view.</li>}
            <li className="py-2 font-mono text-xs text-ink-3">{Math.round(last.inference_ms || last.inference_time_ms || 0)} ms</li>
          </ul>
        ) : <p className="mt-2 text-sm text-ink-2">Point the camera at the road surface. Frames are checked every second and a half.</p>}
      </div>
    </div>
  );
}

export default function Scan() {
  const [mode, setMode] = useState("photo");
  return (
    <div className="space-y-6">
      <PageHead title="Scan a photo" sub="Run the detector on any road photo, a dashcam clip or the live camera. Nothing is filed until you choose to.">
        <Segmented label="Scan mode" value={mode} onChange={setMode} options={MODES} />
      </PageHead>
      <ErrorBoundary key={mode} name={`${mode} scan`} title="The scanner hit a problem">
        {mode === "photo" && <PhotoScan />}
        {mode === "video" && <VideoScan />}
        {mode === "live" && <LiveScan />}
      </ErrorBoundary>
    </div>
  );
}
