// Complaint letter drafted from a report's evidence and a retrieved grievance route.
import { useState } from "react";
import { Check, Copy, Download, FileText } from "lucide-react";
import { api } from "@shared/lib/api.js";
import { Button, ErrorState, Spinner } from "./ui.jsx";

export default function ComplaintLetter({ reportId }) {
  const [letter, setLetter] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);

  async function draft() {
    setBusy(true);
    setError(null);
    try {
      setLetter(await api(`/reports/${encodeURIComponent(reportId)}/complaint?mode=auto`, { timeout: 60000 }));
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  const text = letter ? `To: ${letter.to?.office}, ${letter.to?.authority}\nSubject: ${letter.subject}\n\n${letter.body}` : "";

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setError(new Error("The browser blocked the clipboard. Select the letter text and copy it by hand."));
    }
  }

  function download() {
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `complaint-${reportId}.txt`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  if (!letter) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-ink-2">
          Drafts a letter to the responsible office with the photo link, GPS, severity, cost estimate and how many citizens
          reported it, plus the escalation route that applies.
        </p>
        <Button variant="ink" onClick={draft} disabled={busy}>
          {busy ? <Spinner /> : <FileText className="h-4 w-4" aria-hidden="true" />} {busy ? "Drafting…" : "Draft complaint letter"}
        </Button>
        {error && <ErrorState error={error} title="Couldn't draft the letter" onRetry={draft} />}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <article className="rounded-sm border border-line-strong bg-sheet p-4 font-sans text-sm leading-relaxed sm:p-5">
        <p className="label text-ink-3">To</p>
        <p className="font-medium">{letter.to?.office}</p>
        <p className="text-ink-2">{letter.to?.authority}</p>
        {letter.to?.channel && <p className="mt-1 text-xs text-ink-3">{letter.to.channel}</p>}
        <p className="label mt-4 text-ink-3">Subject</p>
        <p className="font-medium">{letter.subject}</p>
        <div className="mt-4 whitespace-pre-wrap border-t border-line pt-4 text-ink">{letter.body}</div>
      </article>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={copy}>{copied ? <Check className="h-4 w-4" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}{copied ? "Copied" : "Copy"}</Button>
        <Button variant="outline" size="sm" onClick={download}><Download className="h-4 w-4" aria-hidden="true" /> Download .txt</Button>
        <Button variant="ghost" size="sm" onClick={draft} disabled={busy}>{busy ? <Spinner /> : null} Redraft</Button>
        <span className="ml-auto font-mono text-2xs text-ink-3">
          {letter.generated_by === "template" ? "Drafted from the RoadGuard template" : `Drafted with ${letter.generated_by}`}
        </span>
      </div>
      {letter.note && <p className="text-xs text-ink-3">{letter.note}</p>}
      {letter.to?.escalation?.length > 0 && (
        <div>
          <p className="label text-ink-3">If there is no response</p>
          <ol className="mt-1 list-decimal space-y-0.5 pl-5 text-sm text-ink-2">
            {letter.to.escalation.map((e) => <li key={e}>{e}</li>)}
          </ol>
        </div>
      )}
      {letter.grounding?.length > 0 && (
        <details className="border-t border-line pt-3">
          <summary className="label text-ink-3">Sources the letter relies on ({letter.grounding.length})</summary>
          <ul className="mt-2 space-y-2">
            {letter.grounding.map((g) => (
              <li key={g.id} className="text-xs">
                <p className="font-medium text-ink">{g.title} <span className="font-normal text-ink-3">· {g.source}</span></p>
                <p className="text-ink-2">{g.snippet}</p>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
