"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Check, ImageIcon, Plus, Trash2 } from "lucide-react";
import { isCurrentRegion } from "@/lib/domain/evidence";
import { approvalBlockers, includedLines, lineNumber, lineTotal, reviewFlags } from "@/lib/domain/invoice-math";
import { formatMoney, statusLabel } from "@/lib/format";
import { parseMoneyToMinor } from "@/lib/domain/money";
import type { Invoice, InvoiceLine } from "@/lib/domain/types";
import { PhotoAnnotator } from "./annotator";
import { Button, Card, Pill } from "./ui";
import { Stepper } from "./shell";
import { useWorkspace } from "./workspace-context";

export function ReviewScreen({ jobId }: { jobId: string }) {
  const workspace = useWorkspace();
  const router = useRouter();
  const base = workspace.mode === "demo" ? "/demo" : "/app";
  const snapshot = workspace.snapshot;
  const job = snapshot?.jobs.find((item) => item.id === jobId);
  const invoice = snapshot?.invoices.find((item) => item.jobId === jobId);
  const [focus, setFocus] = useState<{ lineId: string; kind: "photo" | "transcript" } | null>(null);
  const [drawer, setDrawer] = useState(false);
  const [placing, setPlacing] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const flags = useMemo(() => {
    if (!invoice || !snapshot) return [];
    return reviewFlags({ invoice, catalog: snapshot.catalog, transcriptText: job?.transcript?.text });
  }, [invoice, snapshot, job?.transcript?.text]);
  if (!snapshot) return <p>Loading your workspace…</p>;
  if (!job || !invoice) {
    return (
      <Card>
        <h1 className="text-2xl font-extrabold text-[#1258F5]">No draft yet</h1>
        <p className="mt-2 text-sm text-[#5C6B8A]">Save a note on the capture step, then create a draft.</p>
        <Link href={`${base}/jobs/${jobId}`} className="mt-4 inline-flex min-h-11 items-center font-semibold text-[#1258F5]">Back to capture</Link>
      </Card>
    );
  }
  const blockers = approvalBlockers(flags);
  const locked = invoice.approval !== "editing";

  function focusEvidence(lineId: string, kind: "photo" | "transcript") {
    setFocus({ lineId, kind });
    const mobile = window.matchMedia("(max-width: 1023px)").matches;
    if (mobile) {
      setDrawer(true);
      window.setTimeout(() => {
        document.getElementById(kind === "photo" ? "drawer-evidence-photo" : "drawer-evidence-transcript")?.scrollIntoView({ block: "center" });
      }, 60);
      return;
    }
    document.getElementById(kind === "photo" ? "evidence-photo" : "evidence-transcript")?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  async function approve() {
    setBusy(true);
    try {
      await workspace.actions.approve(invoice!.id, invoice!.revision);
      router.push(`${base}/jobs/${jobId}/send`);
    } catch {
      /* provider stores the message */
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="pb-28 lg:pb-0">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-[#1258F5]">Review your invoice</h1>
          <p className="mt-1 text-sm text-[#5C6B8A]">{job.title} · {invoice.recipientName || "Add a customer"}</p>
        </div>
        <div className="flex items-center gap-2">
          <Pill tone="draft">Draft · saved</Pill>
          <Stepper current="review" />
        </div>
      </div>
      <div className="mt-4 grid items-start gap-4 lg:grid-cols-[minmax(0,43fr)_minmax(0,57fr)]">
        <div className="order-2 space-y-4 lg:order-1">
          <EvidenceColumn jobId={jobId} invoice={invoice} focus={focus} placing={placing} onSelectLine={(lineId) => { setFocus({ lineId, kind: "photo" }); document.getElementById(`line-${lineId}`)?.scrollIntoView({ block: "center" }); }} onPlace={async (box) => { if (!placing) return; await workspace.actions.setMarker(invoice.id, placing, box); setPlacing(null); }} />
        </div>
        <div className="order-1 space-y-4 lg:order-2">
          <Card>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-2xl font-extrabold">Invoice {invoice.number}</h2>
                <div className="mt-2 flex flex-wrap gap-2 text-sm text-[#5C6B8A]">
                  <span>{invoice.recipientName || "No customer"}</span>
                  <span>{invoice.recipientEmail || "No email"}</span>
                </div>
              </div>
              <Link href={`${base}/jobs/${jobId}`} className="text-sm font-semibold text-[#1258F5]">Edit capture</Link>
            </div>
            {!locked ? (
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <input className="h-11 rounded-2xl border border-[#E1E7F0] px-3 text-sm" aria-label="Recipient name" value={invoice.recipientName} onChange={(event) => workspace.actions.updateRecipient(invoice.id, { name: event.target.value })} />
                <input className="h-11 rounded-2xl border border-[#E1E7F0] px-3 text-sm" aria-label="Recipient email" value={invoice.recipientEmail} onChange={(event) => workspace.actions.updateRecipient(invoice.id, { email: event.target.value })} placeholder="Recipient email" />
              </div>
            ) : null}
            {invoice.sample ? <p className="mt-3 rounded-2xl bg-[#F4F7FB] px-3 py-2 text-xs text-[#5C6B8A]">Sample draft. Prices come from the price list{workspace.mode === "paypal_sandbox" ? ", not from a simulated payment" : ""}. Confirm them before approval.</p> : null}
            <div className="mt-4 hidden grid-cols-[1fr_70px_80px_80px] gap-2 text-xs font-semibold text-[#8B98B3] sm:grid">
              <span>Item</span><span>Qty</span><span>Rate</span><span>Amount</span>
            </div>
            <div className="mt-2 space-y-3">
              {includedLines(invoice.lines).map((line) => (
                <LineEditor key={line.id} line={line} invoice={invoice} locked={locked} active={focus?.lineId === line.id} onEvidence={focusEvidence} onPlace={() => setPlacing(line.id)} />
              ))}
            </div>
            {!locked ? (
              <button className="mt-3 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-[#1258F5]" onClick={() => workspace.actions.addLine(invoice.id)}>
                <Plus className="h-4 w-4" /> Add custom item
              </button>
            ) : null}
            <div className="mt-4 flex items-end justify-between">
              <span className="text-sm font-semibold text-[#5C6B8A]">Total</span>
              <span className="text-3xl font-extrabold">{formatMoney(invoice.totalMinor, invoice.currency)}</span>
            </div>
          </Card>
          <Checklist flags={flags} />
          <section className="hidden rounded-[26px] bg-gradient-to-br from-[#1258F5] to-[#5287F6] p-4 text-white lg:block">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-start gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-full bg-white/15"><Check className="h-5 w-5" /></span>
                <div>
                  <h2 className="text-lg font-extrabold">{blockers.length ? "Needs attention" : "Ready for approval"}</h2>
                  <p className="text-sm text-white/85">{blockers.length ? "Resolve the checklist before approving this bill." : workspace.mode === "demo" ? "Confirm these items. The demo will only simulate what happens next." : "Confirm these items before creating your PayPal invoice."}</p>
                </div>
              </div>
              <Button variant="white" disabled={busy || blockers.length > 0 || locked} onClick={approve}>Approve {formatMoney(invoice.totalMinor, invoice.currency)}</Button>
            </div>
          </section>
          {locked ? <p className="text-sm text-[#5C6B8A]">This bill is approved. <Link className="font-semibold text-[#1258F5]" href={`${base}/jobs/${jobId}/send`}>Continue to send</Link></p> : null}
        </div>
      </div>
      {drawer ? (
        <div className="fixed inset-0 z-40 bg-[#16244D]/40 lg:hidden" role="dialog" aria-modal="true" aria-label="Job evidence">
          <div className="absolute inset-x-0 bottom-0 max-h-[85vh] overflow-auto rounded-t-[28px] bg-white p-4 pb-28">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-extrabold">Job evidence</h2>
              <button className="min-h-11 px-3 font-semibold text-[#1258F5]" onClick={() => setDrawer(false)}>Close</button>
            </div>
            <EvidenceColumn idPrefix="drawer-" jobId={jobId} invoice={invoice} focus={focus} placing={placing} onSelectLine={(lineId) => setFocus({ lineId, kind: "photo" })} onPlace={async (box) => { if (!placing) return; await workspace.actions.setMarker(invoice.id, placing, box); setPlacing(null); }} />
          </div>
        </div>
      ) : null}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-[#E1E7F0] bg-white/95 px-3 pt-3 backdrop-blur lg:hidden" style={{ paddingBottom: "max(12px, env(safe-area-inset-bottom))" }}>
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
          <div>
            <div className="text-xs font-semibold text-[#5C6B8A]">Total</div>
            <div className="text-xl font-extrabold">{formatMoney(invoice.totalMinor, invoice.currency)}</div>
          </div>
          <Button disabled={busy || blockers.length > 0 || locked} onClick={approve}>Approve {formatMoney(invoice.totalMinor, invoice.currency)}</Button>
        </div>
      </div>
    </div>
  );
}

function EvidenceColumn({
  invoice,
  focus,
  placing,
  onSelectLine,
  onPlace,
  idPrefix = "",
}: {
  jobId: string;
  invoice: Invoice;
  focus: { lineId: string; kind: "photo" | "transcript" } | null;
  placing: string | null;
  onSelectLine: (lineId: string) => void;
  onPlace: (box: [number, number, number, number]) => void;
  idPrefix?: string;
}) {
  const workspace = useWorkspace();
  const job = workspace.snapshot?.jobs.find((item) => item.id === invoice.jobId);
  const quote = focus?.kind === "transcript" ? invoice.lines.find((line) => line.id === focus.lineId)?.transcriptSpan : null;
  return (
    <>
      <Card>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-extrabold">Job evidence</h2>
          <span className="text-xs font-semibold text-[#8B98B3]">See all</span>
        </div>
        {job?.photo?.url ? (
          <div id={`${idPrefix}evidence-photo`}>
            <PhotoAnnotator photo={job.photo} lines={invoice.lines} activeLineId={focus?.kind === "photo" ? focus.lineId : null} placingLineId={placing} onSelectLine={onSelectLine} onPlace={onPlace} />
            <p className="mt-2 text-xs text-[#8B98B3]">Click an object to circle it.</p>
          </div>
        ) : (
          <p className="rounded-2xl bg-[#F4F7FB] p-4 text-sm text-[#5C6B8A]">No photo is attached, so there is no marker to show. You can still bill from the note.</p>
        )}
        <div id={`${idPrefix}evidence-transcript`} className="mt-3 rounded-[22px] border border-[#E7EDF5] p-3">
          <div className="flex items-center justify-between text-sm font-semibold">
            <span>Voice note</span>
            <span className="text-[#8B98B3]">Transcript</span>
          </div>
          {job?.audio?.url ? <audio controls src={job.audio.url} className="mt-2 h-10 w-full" /> : <p className="mt-2 text-xs text-[#8B98B3]">{workspace.mode === "demo" ? "No recording stored. The note below is typed or loaded from the sample." : "No recording stored."}</p>}
          <p className="mt-2 text-sm leading-6 text-[#16244D]">
            <Highlighted text={job?.transcript?.text ?? ""} start={quote && !quote.ambiguous ? quote.start : null} end={quote && !quote.ambiguous ? quote.end : null} />
          </p>
        </div>
      </Card>
      <Card>
        <h2 className="font-extrabold">Not billed</h2>
        <ul className="mt-3 space-y-3">
          {invoice.exclusions.map((exclusion) => (
            <li key={exclusion.id}>
              <p className="font-semibold">{exclusion.description} — {exclusion.reason}</p>
              {exclusion.transcriptQuote ? <p className="text-sm text-[#5C6B8A]">“{exclusion.transcriptQuote}”</p> : null}
            </li>
          ))}
          {invoice.lines.filter((line) => line.excluded).map((line) => (
            <li key={line.id} id={`${idPrefix}line-${line.id}`}>
              <button type="button" className={`w-full rounded-2xl px-2 py-2 text-left ${focus?.lineId === line.id && line.photoRegion ? "bg-[#EEF3FF]" : "hover:bg-[#F7F9FC]"}`} onClick={() => line.photoRegion && onSelectLine(line.id)}>
                <p className="font-semibold">{line.description} — {line.exclusionReason || "Excluded"}</p>
                {line.photoRegion ? <p className="text-sm text-[#1258F5]">Show on photo</p> : null}
                {line.transcriptQuote ? <p className="text-sm text-[#5C6B8A]">“{line.transcriptQuote}”</p> : null}
              </button>
            </li>
          ))}
          {invoice.exclusions.length === 0 && invoice.lines.every((line) => !line.excluded) ? <li className="text-sm text-[#5C6B8A]">Nothing is excluded.</li> : null}
        </ul>
      </Card>
    </>
  );
}

function Highlighted({ text, start, end }: { text: string; start: number | null; end: number | null }) {
  if (start === null || end === null) return <>{text || "No note yet."}</>;
  return (
    <>
      {text.slice(0, start)}
      <mark className="rounded bg-[#DCE7FF] px-1">{text.slice(start, end)}</mark>
      {text.slice(end)}
    </>
  );
}

function LineEditor({
  line,
  invoice,
  locked,
  active,
  onEvidence,
  onPlace,
}: {
  line: InvoiceLine;
  invoice: Invoice;
  locked: boolean;
  active: boolean;
  onEvidence: (lineId: string, kind: "photo" | "transcript") => void;
  onPlace: () => void;
}) {
  const workspace = useWorkspace();
  const amount = lineTotal(line);
  const number = lineNumber(invoice.lines, line.id);
  const photo = workspace.snapshot?.jobs.find((job) => job.id === invoice.jobId)?.photo ?? null;
  const showPhoto = isCurrentRegion(line.photoRegion, photo);
  return (
    <div id={`line-${line.id}`} className={`rounded-2xl border p-3 ${active ? "border-[#1258F5] bg-[#F5F8FF]" : "border-[#E7EDF5]"}`}>
      <div className="grid gap-2 sm:grid-cols-[1fr_70px_90px_80px]">
        <div>
          <div className="text-xs font-bold text-[#8B98B3]">{String(number).padStart(2, "0")}</div>
          <input aria-label={`Description for line ${number}`} disabled={locked} className="w-full bg-transparent text-sm font-semibold outline-none" defaultValue={line.description} key={`${line.id}-d-${line.corrections.length}`} onBlur={(event) => { if (event.target.value !== line.description) workspace.actions.updateLine(invoice.id, line.id, { description: event.target.value }); }} />
        </div>
        <input aria-label={`Quantity for ${line.description}`} disabled={locked} className="h-11 rounded-xl border border-[#E1E7F0] px-2 text-sm" defaultValue={line.quantity ?? ""} key={`${line.id}-q-${line.quantity}`} onBlur={(event) => workspace.actions.updateLine(invoice.id, line.id, { quantity: event.target.value.trim() || null })} />
        <input aria-label={`Rate for ${line.description}`} disabled={locked} className="h-11 rounded-xl border border-[#E1E7F0] px-2 text-sm" defaultValue={line.rateMinor === null ? "" : (line.rateMinor / 100).toFixed(2)} key={`${line.id}-r-${line.rateMinor}`} onBlur={(event) => { const minor = parseMoneyToMinor(event.target.value); if (minor === null) return; workspace.actions.updateLine(invoice.id, line.id, { rateMinor: minor }); }} />
        <div className="flex items-center justify-between text-sm font-semibold">
          <span>{amount === null ? "—" : formatMoney(amount, invoice.currency)}</span>
          {!locked ? <button aria-label={`Remove ${line.description}`} onClick={() => workspace.actions.deleteLine(invoice.id, line.id)}><Trash2 className="h-4 w-4 text-[#8B98B3]" /></button> : null}
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        {showPhoto ? (
          <button className="inline-flex min-h-11 items-center gap-1 rounded-full bg-[#EEF3FF] px-3 text-xs font-semibold text-[#1258F5]" onClick={() => onEvidence(line.id, "photo")}><ImageIcon className="h-3.5 w-3.5" /> Photo {number}</button>
        ) : null}
        {line.transcriptQuote ? (
          <button className="inline-flex min-h-11 items-center gap-1 rounded-full bg-[#F4F7FB] px-3 text-xs font-semibold text-[#16244D]" onClick={() => onEvidence(line.id, "transcript")}>Voice note {number}</button>
        ) : null}
        {line.catalogItemId ? <span className="inline-flex min-h-11 items-center rounded-full bg-[#F4F7FB] px-3 text-xs font-semibold text-[#5C6B8A]">Price list</span> : null}
        {!locked && photo ? <button className="inline-flex min-h-11 items-center rounded-full border border-[#E1E7F0] px-3 text-xs font-semibold" onClick={onPlace}>Place marker</button> : null}
      </div>
      {line.transcriptQuote ? <p className="mt-2 rounded-xl bg-[#F7F9FC] px-3 py-2 text-sm text-[#3E4E73]">“{line.transcriptQuote}”{line.rateMinor !== null && line.provenance.rate === "catalog" ? ` · ${formatMoney(line.rateMinor, invoice.currency)}/${line.unit} from your price list` : ""}</p> : null}
      {line.transcriptSpan?.ambiguous ? (
        <div className="mt-2 text-sm">
          <p>This phrase appears more than once. Choose the occurrence.</p>
          <div className="mt-1 flex gap-2">
            <Button variant="ghost" onClick={() => workspace.actions.updateLine(invoice.id, line.id, { quoteOccurrence: 0 })}>First</Button>
            <Button variant="ghost" onClick={() => workspace.actions.updateLine(invoice.id, line.id, { quoteOccurrence: 1 })}>Second</Button>
          </div>
        </div>
      ) : null}
      {line.match.status === "abstain" && line.match.candidates.length > 0 ? (
        <div className="mt-2 space-y-1">
          <p className="text-sm font-semibold">Choose a price-list item</p>
          {line.match.candidates.map((candidate) => (
            <button key={candidate.catalogItemId} className="flex w-full items-center justify-between rounded-xl border border-[#E1E7F0] px-3 py-2 text-left text-sm" onClick={() => workspace.actions.updateLine(invoice.id, line.id, { catalogItemId: candidate.catalogItemId })}>
              <span>{candidate.name}</span>
              <span>{formatMoney(candidate.rateMinor, invoice.currency)} / {candidate.unit}</span>
            </button>
          ))}
        </div>
      ) : null}
      <p className="mt-2 text-xs text-[#8B98B3]">Provenance · item {line.provenance.identity}, quantity {line.provenance.quantity}, rate {line.provenance.rate}, ownership {statusLabel(line.ownership)}</p>
      {!locked ? (
        <div className="mt-2 flex flex-wrap gap-2">
          <button className="text-xs font-semibold text-[#5C6B8A]" onClick={() => workspace.actions.updateLine(invoice.id, line.id, { ownership: "customer", excluded: true })}>Customer supplied</button>
          {line.match.status === "abstain" ? <button className="text-xs font-semibold text-[#5C6B8A]" onClick={() => workspace.actions.updateLine(invoice.id, line.id, { excluded: true })}>Exclude line</button> : null}
          <button className="text-xs font-semibold text-[#5C6B8A]" onClick={() => workspace.actions.updateLine(invoice.id, line.id, { duplicateConfirmed: true })}>Confirm repeat</button>
        </div>
      ) : null}
    </div>
  );
}

function Checklist({ flags }: { flags: ReturnType<typeof reviewFlags> }) {
  if (flags.length === 0) return null;
  return (
    <Card>
      <h2 className="font-extrabold">Before approval</h2>
      <ul className="mt-3 space-y-3">
        {flags.map((flag) => (
          <li key={`${flag.code}-${flag.lineId ?? "invoice"}`} className="text-sm">
            <p className="font-semibold text-[#16244D]">{flag.blocksApproval ? "Blocker" : "Suggestion"} · {flag.message}</p>
            <p className="text-[#5C6B8A]">{flag.action} {flag.impactMinor === null ? "Impact unknown." : `About ${formatMoney(flag.impactMinor)}.`}</p>
          </li>
        ))}
      </ul>
    </Card>
  );
}
