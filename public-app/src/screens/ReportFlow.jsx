import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Camera, Check, Crosshair, ImagePlus, MapPin, RotateCcw } from "lucide-react";
import MarkedPhoto from "@shared/ui/MarkedPhoto.jsx";
import { CodeBadge, SeverityChip } from "@shared/ui/marks.jsx";
import { api, mediaUrl } from "@shared/lib/api.js";
import { coords, conf, number } from "@shared/lib/format.js";
import { ROAD_CLASSES, wardLabel } from "@shared/lib/roadguard.js";
import { ErrorNote, PrimaryButton, SecondaryButton, Spinner } from "../ui.jsx";

const PinMap = lazy(() => import("./PinMap.jsx"));
const MUMBAI = { lat: 19.076, lng: 72.8777 };

function Steps({ step }) {
  const names = ["Photo", "Where", "Send"];
  return (
    <ol className="grid grid-cols-3 gap-1.5 px-4" aria-label="Report steps">
      {names.map((n, i) => (
        <li key={n} aria-current={i === step ? "step" : undefined}>
          <div className={`h-1.5 ${i <= step ? "bg-ink" : "bg-paper-3"}`} />
          <p className={`mt-1 text-xs ${i === step ? "font-semibold text-ink" : "text-ink-3"}`}>{i + 1} · {n}</p>
        </li>
      ))}
    </ol>
  );
}

function PhotoStep({ photo, onPhoto, onNext }) {
  const camera = useRef(null);
  const gallery = useRef(null);
  const pick = (e) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (f) onPhoto(f);
  };
  return (
    <div className="space-y-5 px-4">
      {photo ? (
        <div className="relative overflow-hidden rounded-md bg-asphalt">
          <img src={photo.url} alt="Your photo of the road" className="block max-h-[52vh] w-full object-contain" />
          <button type="button" onClick={() => camera.current?.click()} className="absolute right-3 top-3 inline-flex h-10 items-center gap-1.5 rounded-sm bg-asphalt/80 px-3 text-sm text-chalk">
            <RotateCcw className="h-4 w-4" aria-hidden="true" /> Retake
          </button>
        </div>
      ) : (
        <button type="button" onClick={() => camera.current?.click()}
          className="on-asphalt grain flex aspect-[4/3] w-full flex-col items-center justify-center gap-3 rounded-md bg-asphalt text-chalk active:bg-asphalt-2">
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-paint text-paint-ink"><Camera className="h-7 w-7" aria-hidden="true" /></span>
          <span className="font-display text-3xl font-bold leading-none">Photograph the damage</span>
          <span className="text-sm text-chalk-2">Opens your camera</span>
        </button>
      )}
      <input ref={camera} type="file" accept="image/*" capture="environment" className="sr-only" onChange={pick} aria-label="Take a photo" />
      <input ref={gallery} type="file" accept="image/*" className="sr-only" onChange={pick} aria-label="Choose a photo from your gallery" />
      {!photo && (
        <SecondaryButton className="w-full" onClick={() => gallery.current?.click()}><ImagePlus className="h-5 w-5" aria-hidden="true" /> Choose from gallery</SecondaryButton>
      )}
      <ul className="space-y-1.5 text-sm text-ink-2">
        <li className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-ok" aria-hidden="true" />Stand a few steps back so the whole defect is in the frame.</li>
        <li className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-ok" aria-hidden="true" />Daylight works best; avoid photographing a screen.</li>
        <li className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-ok" aria-hidden="true" />One hazard per report. Reports within 25 m are merged.</li>
      </ul>
      {photo && <PrimaryButton onClick={onNext}>Next: where is it?</PrimaryButton>}
    </div>
  );
}

function WhereStep({ place, setPlace, onNext }) {
  const canLocate = typeof navigator !== "undefined" && Boolean(navigator.geolocation);
  const [gps, setGps] = useState(place.lat ? "ok" : canLocate ? "locating" : "unavailable");

  // Only the geolocation callbacks set state, so this is safe to start from an effect.
  const requestPosition = useCallback(() => {
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setPlace((pl) => ({ ...pl, lat: p.coords.latitude, lng: p.coords.longitude, accuracy: Math.round(p.coords.accuracy) }));
        setGps("ok");
      },
      () => setGps("denied"),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 },
    );
  }, [setPlace]);

  function locate() {
    if (!canLocate) return setGps("unavailable");
    setGps("locating");
    requestPosition();
  }

  useEffect(() => {
    if (!place.lat && canLocate) requestPosition();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const center = place.lat ? { lat: place.lat, lng: place.lng } : MUMBAI;
  return (
    <div className="space-y-5 px-4">
      <div>
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium">Location</p>
          <button type="button" onClick={locate} className="inline-flex h-9 items-center gap-1.5 rounded-sm px-2 text-sm text-ink-2 active:bg-paper-3">
            <Crosshair className="h-4 w-4" aria-hidden="true" /> Use my location
          </button>
        </div>
        <p role="status" className="mt-1 text-sm text-ink-2">
          {gps === "locating" && "Finding you…"}
          {gps === "ok" && `${coords(place.lat, place.lng)}${place.accuracy ? ` · within ${place.accuracy} m` : ""}`}
          {gps === "denied" && "Location is off. Drag the pin to the spot instead."}
          {gps === "unavailable" && "This phone can't share location. Drag the pin to the spot."}
          {gps === "idle" && "Drag the pin to the spot."}
        </p>
        <Suspense fallback={<div className="mt-2 h-56 animate-pulse rounded-md bg-paper-3" />}>
          <PinMap center={center} onMove={(ll) => { setPlace((pl) => ({ ...pl, lat: ll.lat, lng: ll.lng, accuracy: null })); setGps("ok"); }} />
        </Suspense>
      </div>
      <fieldset>
        <legend className="text-sm font-medium">What kind of road?</legend>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {ROAD_CLASSES.map((r) => (
            <button key={r.key} type="button" onClick={() => setPlace((pl) => ({ ...pl, road: r.key }))} aria-pressed={place.road === r.key}
              className={`h-12 rounded-sm border-[1.5px] px-3 text-left text-sm transition-colors duration-150 ${place.road === r.key ? "border-ink bg-ink text-paper" : "border-line-strong bg-sheet"}`}>
              {r.citizen}
            </button>
          ))}
        </div>
        <p className="mt-1.5 text-xs text-ink-3">Busier roads are fixed first; this changes the severity score.</p>
      </fieldset>
      <label className="block">
        <span className="text-sm font-medium">Landmark <span className="font-normal text-ink-3">(optional)</span></span>
        <input value={place.landmark} onChange={(e) => setPlace((pl) => ({ ...pl, landmark: e.target.value }))} placeholder="e.g. outside Vashi bus depot"
          className="mt-1.5 w-full rounded-xs border border-line-strong bg-sheet px-3 py-3 placeholder:text-ink-3" />
      </label>
      <label className="block">
        <span className="text-sm font-medium">Anything the crew should know? <span className="font-normal text-ink-3">(optional)</span></span>
        <textarea value={place.note} onChange={(e) => setPlace((pl) => ({ ...pl, note: e.target.value }))} rows={2} placeholder="e.g. bikes swerving into the next lane"
          className="mt-1.5 w-full resize-none rounded-xs border border-line-strong bg-sheet px-3 py-3 placeholder:text-ink-3" />
      </label>
      <PrimaryButton onClick={onNext} disabled={!place.lat}>Next: check and send</PrimaryButton>
    </div>
  );
}

function SendStep({ photo, place, busy, error, onSend }) {
  const road = ROAD_CLASSES.find((r) => r.key === place.road);
  return (
    <div className="space-y-5 px-4">
      <div className="grid grid-cols-[96px_1fr] gap-4">
        <img src={photo.url} alt="" className="h-24 w-24 rounded-xs object-cover" />
        <dl className="space-y-1.5 text-sm">
          <div><dt className="label text-ink-3">Where</dt><dd className="font-mono text-xs num">{coords(place.lat, place.lng)}</dd>{place.landmark && <dd>{place.landmark}</dd>}</div>
          <div><dt className="label text-ink-3">Road</dt><dd>{road?.citizen}</dd></div>
        </dl>
      </div>
      {place.note && <p className="border-l-[3px] border-line-strong pl-3 text-sm text-ink-2">{place.note}</p>}
      <p className="text-sm text-ink-2">When you send, RoadGuard marks the damage on your photo, checks for an existing report within 25 m and routes it to the ward office. Your name appears on the public ledger.</p>
      {error && <ErrorNote error={error} onRetry={onSend} title="Not sent yet" />}
      <PrimaryButton onClick={onSend} disabled={busy}>{busy ? <><Spinner /> Marking the damage…</> : "Send report"}</PrimaryButton>
    </div>
  );
}

function Result({ res, photo, onAgain, onTrack }) {
  if (res.status === "no_damage") {
    return (
      <div className="space-y-5 px-4 pt-2">
        <h2 className="font-display text-4xl font-extrabold leading-none">No damage found in this photo</h2>
        <img src={photo.url} alt="Your photo" className="w-full rounded-md" />
        <p className="text-base text-ink-2">{res.message || "The detector didn't find a pothole or crack it was confident about."}</p>
        <ul className="list-disc space-y-1 pl-5 text-sm text-ink-2">
          <li>Move closer so the damage fills more of the frame.</li>
          <li>Try again in daylight, without your shadow over it.</li>
        </ul>
        <PrimaryButton onClick={onAgain}>Take another photo</PrimaryButton>
      </div>
    );
  }
  if (res.status === "rejected") {
    return (
      <div className="space-y-5 px-4 pt-2">
        <h2 className="font-display text-4xl font-extrabold leading-none">This report wasn't accepted</h2>
        <p className="text-base text-ink-2">{res.message}</p>
        {res.flags?.length > 0 && (
          <ul className="divide-y divide-line border-y border-line text-sm">
            {res.flags.map((f, i) => <li key={i} className="py-2">{f.detail || String(f)}</li>)}
          </ul>
        )}
        <PrimaryButton onClick={onAgain}>Try a different photo</PrimaryButton>
      </div>
    );
  }
  const merged = Boolean(res.duplicate_of);
  const g = res.gamification || {};
  const img = res.image_url ? mediaUrl(res.image_url) : photo.url;
  const dims = res.image || (photo.w ? { width: photo.w, height: photo.h } : null);
  return (
    <div className="space-y-6 px-4 pt-2">
      <div>
        <p className="label text-ink-3">{res.status === "under_review" ? "Sent for review" : "Filed"} · {res.id}</p>
        <h2 className="mt-2 font-display text-4xl font-extrabold leading-none">
          {merged ? "Added to an open hazard" : "On the record"}
        </h2>
        <p className="mt-2 text-base text-ink-2">
          {merged
            ? `Someone reported this spot already. Your report joins hazard ${res.hazard_id} and pushes it up the worklist.`
            : `Hazard ${res.hazard_id} is now on the ${wardLabel(res.ward) || "ward"} worklist.`}
        </p>
      </div>
      {dims?.width ? (
        <MarkedPhoto src={img} width={dims.width} height={dims.height} detections={res.detections || []} mode="marks" notes="compact" alt="Your photo with the damage marked" />
      ) : (
        <img src={img} alt="Your photo" className="w-full rounded-md" />
      )}
      {res.detections?.length > 0 && (
        <ul className="divide-y divide-line border-y border-line">
          {res.detections.map((d) => (
            <li key={d.id} className="flex items-center justify-between gap-2 py-2 text-sm">
              <span className="flex min-w-0 items-center gap-2"><CodeBadge code={d.code} /><span className="truncate">{d.label}</span><span className="font-mono text-xs text-ink-3">{conf(d.confidence)}</span></span>
              <SeverityChip level={d.severity_level} />
            </li>
          ))}
        </ul>
      )}
      {res.status === "under_review" && <p className="border-l-[3px] border-info bg-info-wash px-3 py-2 text-sm">Some checks flagged this photo, so an inspector will look at it before it reaches the worklist.</p>}
      {g.points_earned > 0 && (
        <div className="grid grid-cols-3 gap-px border-y border-line bg-line text-center [&>div]:bg-paper [&>div]:py-3">
          <div><p className="font-display text-3xl font-bold num">+{number(g.xp_earned)}</p><p className="label text-ink-3">XP</p></div>
          <div><p className="font-display text-3xl font-bold num">+{number(g.coins_earned)}</p><p className="label text-ink-3">Coins</p></div>
          <div><p className="font-display text-3xl font-bold num">{g.level}</p><p className="label text-ink-3">Level</p></div>
        </div>
      )}
      {g.new_achievements?.length > 0 && <p className="text-sm">New badge: <b>{g.new_achievements.map((a) => a.name).join(", ")}</b></p>}
      <div>
        <p className="label text-ink-3">What happens next</p>
        <ol className="mt-2 space-y-1.5 text-sm text-ink-2">
          <li>1. The ward office acknowledges it (RoadGuard target: 48 hours).</li>
          <li>2. A crew is assigned; the status changes here and on the public map.</li>
          <li>3. When it's fixed you'll see it marked Fixed under My reports.</li>
        </ol>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <SecondaryButton onClick={onAgain}>Report another</SecondaryButton>
        <PrimaryButton className="h-12 text-lg" onClick={onTrack}>Track it</PrimaryButton>
      </div>
    </div>
  );
}

export default function ReportFlow({ user, onTrack }) {
  const [step, setStep] = useState(0);
  const [photo, setPhoto] = useState(null);
  const [place, setPlace] = useState({ lat: null, lng: null, accuracy: null, road: "arterial", landmark: "", note: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [res, setRes] = useState(null);

  useEffect(() => () => { if (photo?.url) URL.revokeObjectURL(photo.url); }, [photo]);

  function onPhoto(file) {
    if (!file.type.startsWith("image/")) return setError(new Error("That file isn't a photo."));
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => setPhoto((p) => (p && p.url === url ? { ...p, w: img.naturalWidth, h: img.naturalHeight } : p));
    img.src = url;
    setPhoto({ file, url });
    setError(null);
  }

  async function send() {
    setBusy(true);
    setError(null);
    try {
      const data = await api("/public/report", {
        method: "POST",
        timeout: 90000,
        form: {
          file: photo.file,
          latitude: place.lat,
          longitude: place.lng,
          road_class: place.road,
          location_name: place.landmark || "",
          description: place.note || "",
          reporter_name: user?.name || "Citizen",
        },
      });
      setRes(data);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  function again() {
    setRes(null);
    setPhoto(null);
    setStep(0);
    setError(null);
    setPlace((p) => ({ ...p, landmark: "", note: "" }));
  }

  return (
    <div className="pb-8">
      {res ? (
        <Result res={res} photo={photo} onAgain={again} onTrack={onTrack} />
      ) : (
        <>
          <div className="flex items-center gap-2 px-4 pb-3 pt-5">
            {step > 0 && (
              <button type="button" onClick={() => setStep((s) => s - 1)} className="-ml-2 inline-flex h-10 w-10 items-center justify-center rounded-sm active:bg-paper-3" aria-label="Back">
                <ArrowLeft className="h-5 w-5" aria-hidden="true" />
              </button>
            )}
            <h1 className="font-display text-4xl font-extrabold leading-none">Report a road</h1>
          </div>
          <Steps step={step} />
          <div className="mt-5">
            {step === 0 && <PhotoStep photo={photo} onPhoto={onPhoto} onNext={() => setStep(1)} />}
            {step === 1 && <WhereStep place={place} setPlace={setPlace} onNext={() => setStep(2)} />}
            {step === 2 && photo && <SendStep photo={photo} place={place} busy={busy} error={error} onSend={send} />}
          </div>
          {error && step < 2 && <div className="mt-4 px-4"><ErrorNote error={error} /></div>}
          {step === 1 && !place.lat && <p className="mt-3 flex items-center gap-1.5 px-4 text-xs text-ink-3"><MapPin className="h-3.5 w-3.5" aria-hidden="true" />A location is needed so the right office gets it.</p>}
        </>
      )}
    </div>
  );
}
