import { useEffect, useState } from "react";
import { Check, Flame, Lock } from "lucide-react";
import { api, mediaUrl, useApi } from "@shared/lib/api.js";
import { number } from "@shared/lib/format.js";
import { DEFECTS } from "@shared/lib/roadguard.js";
import { DefectGlyph } from "@shared/ui/marks.jsx";
import { ErrorNote, ScreenHead, Skeleton, Spinner } from "../ui.jsx";
import { CROP_ASPECT, quizCrop } from "./quiz.js";

/** Pick a reported photo with one confident, reasonably large detection to quiz on. */
async function pickRound(data) {
  const pool = (data?.reports || []).filter((r) => r.image_url);
  for (let tries = 0; tries < 6 && pool.length; tries += 1) {
    const pick = pool[Math.floor(Math.random() * pool.length)];
    const full = await api(`/public/reports/${encodeURIComponent(pick.id)}`);
    const w = full.image?.width;
    const h = full.image?.height;
    const big = (d) => d.bbox[2] - d.bbox[0] >= 0.1 * w && d.bbox[3] - d.bbox[1] >= 0.06 * h;
    const det = (full.detections || []).filter((d) => d.confidence >= 0.4 && big(d)).sort((a, b) => b.confidence - a.confidence)[0];
    if (det && w) return { src: mediaUrl(full.image_url), w, h, det };
  }
  return null;
}

/** Spot the defect: a crop of a real reported photo, four RDD classes to choose from. */
function SpotTheDefect({ user, onScored }) {
  const reports = useApi("/public/reports/map");
  const [round, setRound] = useState(null);
  const [answer, setAnswer] = useState(null);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!reports.data || round) return undefined;
    let cancelled = false;
    pickRound(reports.data)
      .then((r) => { if (!cancelled && r) setRound(r); })
      .catch((err) => { if (!cancelled) setError(err); });
    return () => { cancelled = true; };
  }, [reports.data, round]);

  function next() {
    setAnswer(null);
    setResult(null);
    setError(null);
    pickRound(reports.data).then((r) => r && setRound(r)).catch(setError);
  }

  async function choose(code) {
    if (answer || !round) return;
    setAnswer(code);
    setBusy(true);
    try {
      const res = await api("/gamification/ai-challenge/answer", { method: "POST", form: { user_id: user.name, answer: code, correct_answer: round.det.code } });
      setResult(res);
      onScored?.();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  if (reports.error && !reports.data) return <ErrorNote error={reports.error} onRetry={reports.reload} />;
  if (!round) return <div className="aspect-[1.6] w-full animate-pulse bg-paper-3" />;
  const crop = quizCrop(round.det.bbox, round.w, round.h);
  const [x1, y1, x2, y2] = round.det.bbox;
  const correct = answer && answer === round.det.code;

  return (
    <div>
      <div className="relative w-full overflow-hidden rounded-md bg-asphalt" style={{ aspectRatio: CROP_ASPECT }}>
        <img src={round.src} alt="A section of a reported road photo, with the marked defect ringed"
          className="absolute max-w-none"
          style={{ width: `${(round.w / crop.w) * 100}%`, left: `${(-crop.x / crop.w) * 100}%`, top: `${(-crop.y / crop.h) * 100}%` }} />
        {/* Same ring for every class, so the mark shows where to look without giving the answer away */}
        <svg className="absolute inset-0 h-full w-full" viewBox={`${crop.x} ${crop.y} ${crop.w} ${crop.h}`} preserveAspectRatio="none" aria-hidden="true">
          <ellipse cx={(x1 + x2) / 2} cy={(y1 + y2) / 2} rx={(x2 - x1) / 2 + crop.w * 0.02} ry={(y2 - y1) / 2 + crop.h * 0.03}
            fill="none" stroke="var(--color-paint)" strokeWidth={crop.w / 160} strokeDasharray={`${crop.w / 40} ${crop.w / 80}`} />
        </svg>
      </div>
      <p className="mt-3 text-sm font-medium">What did the detector mark here?</p>
      <div className="mt-2 grid grid-cols-2 gap-2">
        {Object.values(DEFECTS).map((d) => {
          const picked = answer === d.code;
          const isRight = answer && d.code === round.det.code;
          return (
            <button key={d.code} type="button" onClick={() => choose(d.code)} disabled={Boolean(answer)}
              className={`flex h-12 items-center gap-2 rounded-sm border-[1.5px] px-3 text-left text-sm transition-colors duration-150 ${isRight ? "border-ok bg-ok-wash" : picked ? "border-crit bg-crit-wash" : "border-line-strong bg-sheet"}`}>
              <DefectGlyph code={d.code} /> {d.label}
            </button>
          );
        })}
      </div>
      {answer && (
        <div role="status" className="mt-3 flex items-center justify-between gap-3 text-sm">
          <span>{busy ? <Spinner className="h-4 w-4" /> : correct ? `Right. +${(result?.points ?? 0) * 5} XP` : `It's a ${DEFECTS[round.det.code]?.label.toLowerCase()} (model confidence ${round.det.confidence.toFixed(2)}).`}</span>
          <button type="button" onClick={next} className="h-10 rounded-sm bg-ink px-4 font-medium text-paper">Next photo</button>
        </div>
      )}
      {error && <div className="mt-3"><ErrorNote error={error} /></div>}
    </div>
  );
}

export default function RewardsScreen({ user }) {
  const id = encodeURIComponent(user.name);
  const profile = useApi(`/gamification/profile/${id}`);
  const board = useApi("/gamification/leaderboard");
  const challenges = useApi(`/gamification/challenges/${id}`);
  const all = useApi("/gamification/achievements");
  const p = profile.data;
  const earned = new Set(p?.achievements || []);
  const toNext = p ? Math.max(1, p.xp_to_next_level || 100) : 100;

  return (
    <div className="space-y-8 pb-10">
      <ScreenHead title="Rewards" sub="Points for reports that check out, not for volume." />
      {profile.loading && !p ? <Skeleton rows={2} /> : profile.error && !p ? <div className="px-4"><ErrorNote error={profile.error} onRetry={profile.reload} /></div> : p && (
        <section className="px-4" aria-label="Your progress">
          <div className="grid grid-cols-3 gap-px border-y border-line bg-line text-center [&>div]:bg-paper [&>div]:py-3">
            <div><p className="font-display text-4xl font-bold num">{p.level}</p><p className="label text-ink-3">Level</p></div>
            <div><p className="font-display text-4xl font-bold num">{number(p.coins)}</p><p className="label text-ink-3">Civic coins</p></div>
            <div><p className="flex items-center justify-center gap-1 font-display text-4xl font-bold num"><Flame className="h-6 w-6 text-crit" aria-hidden="true" />{p.streak_days}</p><p className="label text-ink-3">Day streak</p></div>
          </div>
          <div className="mt-3">
            <div className="flex justify-between text-xs text-ink-2"><span>{number(p.xp)} XP</span><span>level {p.level + 1} at {number(toNext)} XP</span></div>
            <div className="mt-1 h-2 bg-paper-3"><div className="h-full bg-paint-deep" style={{ width: `${Math.min(100, (p.xp / toNext) * 100)}%` }} /></div>
          </div>
        </section>
      )}

      <section className="px-4" aria-labelledby="spot-h">
        <h2 id="spot-h" className="sign border-b-[3px] border-ink pb-1 text-lg">Spot the defect</h2>
        <p className="mt-2 text-sm text-ink-2">Real crops from reports in your city. Learn the four defect classes the detector uses.</p>
        <div className="mt-3"><SpotTheDefect user={user} onScored={profile.reload} /></div>
      </section>

      <section className="px-4" aria-labelledby="today-h">
        <h2 id="today-h" className="sign border-b-[3px] border-ink pb-1 text-lg">Today</h2>
        <ul className="divide-y divide-line">
          {(challenges.data?.challenges || []).map((c) => (
            <li key={c.id || c.name} className="flex items-center gap-3 py-3">
              <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${c.completed ? "bg-ok text-white" : "border border-line-strong text-ink-3"}`}>
                {c.completed ? <Check className="h-4 w-4" aria-hidden="true" /> : <span className="font-mono text-xs">{c.progress}/{c.target}</span>}
              </span>
              <span className="min-w-0 flex-1"><span className="block text-sm font-medium">{c.name || c.title}</span>{c.description && <span className="block text-xs text-ink-3">{c.description}</span>}</span>
              <span className="font-mono text-xs text-ink-2">+{c.xp} XP</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="px-4" aria-labelledby="badges-h">
        <h2 id="badges-h" className="sign border-b-[3px] border-ink pb-1 text-lg">Badges <span className="font-mono text-xs font-normal text-ink-3">{earned.size}/{all.data?.achievements?.length || 0}</span></h2>
        <ul className="mt-3 grid grid-cols-2 gap-2">
          {(all.data?.achievements || []).map((a) => {
            const got = earned.has(a.id);
            return (
              <li key={a.id} className={`rounded-sm border p-3 ${got ? "border-ink bg-paint-wash" : "border-dashed border-line-strong"}`}>
                <p className="flex items-center gap-1.5 text-sm font-semibold">{!got && <Lock className="h-3.5 w-3.5 text-ink-3" aria-hidden="true" />}{a.name}</p>
                <p className="mt-0.5 text-xs text-ink-3">{a.description || a.desc}</p>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="px-4" aria-labelledby="board-h">
        <h2 id="board-h" className="sign border-b-[3px] border-ink pb-1 text-lg">City leaderboard</h2>
        <ol className="divide-y divide-line">
          {(board.data?.leaderboard || []).slice(0, 10).map((r) => {
            const me = r.name === user.name;
            return (
              <li key={r.rank} className={`grid grid-cols-[2rem_1fr_auto] items-center gap-2 py-2.5 ${me ? "bg-paint-wash" : ""}`}>
                <span className={`font-display text-2xl font-bold num ${r.rank <= 3 ? "text-ink" : "text-ink-3"}`}>{r.rank}</span>
                <span className="min-w-0"><span className="block truncate text-sm font-medium">{r.name}{me ? " (you)" : ""}</span><span className="block text-xs text-ink-3">{r.total_reports} report{r.total_reports === 1 ? "" : "s"} · level {r.level}</span></span>
                <span className="font-mono text-sm num">{number(r.xp)} XP</span>
              </li>
            );
          })}
        </ol>
      </section>
    </div>
  );
}
