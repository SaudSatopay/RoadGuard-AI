import { useState } from "react";
import { RotateCcw, ShieldCheck, ShieldOff } from "lucide-react";
import { api, useApi } from "@shared/lib/api.js";
import { setTheme, useSession } from "../session.js";
import { Button, ErrorState, PageHead, SectionHead, Segmented, Spinner } from "../ui.jsx";

export default function Settings() {
  const { user, theme } = useSession();
  const settings = useApi("/admin/settings");
  const health = useApi("/health", { refreshMs: 10000 });
  const model = useApi("/model");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [reset, setReset] = useState({ busy: false, done: null, confirm: false });
  const fraud = settings.data?.fraud_detection_enabled;

  async function toggleFraud() {
    setSaving(true);
    setError(null);
    try {
      await api("/admin/settings", { method: "PATCH", form: { fraud_detection_enabled: String(!fraud) } });
      settings.reload();
    } catch (err) {
      setError(err);
    } finally {
      setSaving(false);
    }
  }

  async function resetDemo() {
    setReset({ busy: true, done: null, confirm: false });
    try {
      const res = await api("/admin/reset-demo", { method: "POST" });
      setReset({ busy: false, done: `Demo data restored: ${res.reports} reports.`, confirm: false });
    } catch (err) {
      setReset({ busy: false, done: null, confirm: false });
      setError(err);
    }
  }

  return (
    <div className="max-w-3xl space-y-8">
      <PageHead title="Settings" sub={`${user?.name} · ${user?.department || "Municipal roads"}`} />

      <section aria-labelledby="look-h">
        <SectionHead title={<span id="look-h">Display</span>} />
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-ink-2">Night shift swaps concrete for asphalt for evening site visits.</p>
          <Segmented label="Theme" value={theme} onChange={setTheme} options={[{ value: "day", label: "Day" }, { value: "night", label: "Night shift" }]} />
        </div>
      </section>

      <section aria-labelledby="fraud-h">
        <SectionHead title={<span id="fraud-h">Citizen report checks</span>} />
        <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-[52ch]">
            <p className="flex items-center gap-2 font-medium">
              {fraud ? <ShieldCheck className="h-4 w-4 text-ok" aria-hidden="true" /> : <ShieldOff className="h-4 w-4 text-crit" aria-hidden="true" />}
              Screen reports before they reach the worklist
            </p>
            <p className="mt-1 text-sm text-ink-2">
              Checks for screen photos, impossible GPS, duplicates, bursts of submissions and photos with no road damage.
              Below 45% trust a report is refused; 45–70% goes to review.
            </p>
          </div>
          <Button variant={fraud ? "outline" : "ink"} onClick={toggleFraud} disabled={saving || fraud == null} aria-pressed={Boolean(fraud)}>
            {saving ? <Spinner /> : null} {fraud ? "Turn checks off" : "Turn checks on"}
          </Button>
        </div>
      </section>

      <section aria-labelledby="sys-h">
        <SectionHead title={<span id="sys-h">System</span>} />
        <dl className="mt-3 grid grid-cols-1 gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
          <div><dt className="label text-ink-3">API</dt><dd>{health.data ? `${health.data.service} ${health.data.version} · online` : "offline"}</dd></div>
          <div><dt className="label text-ink-3">Detector</dt><dd>{model.data?.detector ? `${model.data.detector.name} · ${model.data.detector.runtime}` : "—"}</dd></div>
          <div><dt className="label text-ink-3">Weights</dt><dd className="font-mono text-xs">{model.data?.detector?.file || "—"}</dd></div>
          <div><dt className="label text-ink-3">Complaint letters</dt><dd>Template; drafted with Claude when an Anthropic API key is set on the server</dd></div>
        </dl>
      </section>

      <section aria-labelledby="demo-h">
        <SectionHead title={<span id="demo-h">Demo data</span>} />
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <p className="max-w-[52ch] text-sm text-ink-2">Restore the 24 seeded Mumbai and Navi Mumbai reports. Reports filed since then are removed.</p>
          {reset.confirm ? (
            <div className="flex gap-2">
              <Button variant="danger" onClick={resetDemo} disabled={reset.busy}>{reset.busy ? <Spinner /> : <RotateCcw className="h-4 w-4" aria-hidden="true" />} Yes, restore</Button>
              <Button variant="ghost" onClick={() => setReset((r) => ({ ...r, confirm: false }))}>Cancel</Button>
            </div>
          ) : (
            <Button variant="outline" onClick={() => setReset((r) => ({ ...r, confirm: true }))}><RotateCcw className="h-4 w-4" aria-hidden="true" /> Restore demo data</Button>
          )}
        </div>
        {reset.done && <p role="status" className="mt-2 text-sm text-ok">{reset.done}</p>}
      </section>
      {error && <ErrorState error={error} title="That didn't save" />}
    </div>
  );
}
