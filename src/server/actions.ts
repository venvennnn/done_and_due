import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { integrationStatus } from "@/lib/config";
import { applyExtraction, extractionIsStale } from "@/lib/domain/extraction";
import { assertNotDemoId, createId, ServiceError } from "@/lib/domain/ids";
import { addCustomLine, applyRecipient, clearMarkersForPhoto, patchLine, placeMarker, removeLine, touch, type LinePatch } from "@/lib/domain/mutate";
import { isSampleTranscript, SAMPLE_PHOTO, SAMPLE_TRANSCRIPT } from "@/lib/domain/sample";
import type { Extraction, Invoice, Job, JobPhoto } from "@/lib/domain/types";
import { extractWithGemini, transcribeWithGemini } from "@/lib/gemini/client";
import { createPayPalClient, type PayPalClient } from "@/lib/paypal/client";
import { approveInvoice, createPayPalDraft, deliverPayPal, refreshPayPal, workspaceSnapshot, type BillingStore, type StoredWorkspace } from "@/lib/paypal/service";
import { draftFromTranscript } from "@/lib/demo/sample-draft";
import { samplePhoto } from "@/lib/demo/seed";
import { normalizeJobImage } from "@/server/image";
import { supabaseAdmin } from "@/server/session";
import type { Box2D } from "@/lib/domain/types";

function guardId(id: string) {
  assertNotDemoId(id);
}

async function update(store: BillingStore, workspaceId: string, fn: (workspace: StoredWorkspace) => void | Promise<void>) {
  const workspace = await store.getWorkspace(workspaceId);
  if (!workspace) throw new ServiceError("not_found", 404, "Workspace not found.");
  const draft = structuredClone(workspace);
  await fn(draft);
  await store.saveWorkspace(draft);
  return workspaceSnapshot(draft);
}

function nextNumber(workspace: StoredWorkspace) {
  const max = workspace.invoices.reduce((highest, invoice) => Math.max(highest, Number(invoice.number.replace(/\D/g, "")) || 0), 1042);
  return `DD-${max + 1}`;
}

function mustJob(workspace: StoredWorkspace, jobId: string): Job {
  guardId(jobId);
  const job = workspace.jobs.find((item) => item.id === jobId);
  if (!job) throw new ServiceError("not_found", 404, "That job is not in this workspace.");
  return job;
}

function invoiceFor(workspace: StoredWorkspace, jobId: string) {
  return workspace.invoices.find((invoice) => invoice.jobId === jobId);
}

export async function newJob(store: BillingStore, workspaceId: string) {
  const id = createId("job");
  const snapshot = await update(store, workspaceId, (workspace) => {
    const stamp = new Date().toISOString();
    workspace.jobs.unshift({
      id,
      title: "New job",
      customerId: null,
      photo: null,
      audio: null,
      transcript: { revisionId: createId("rev"), text: "", source: "typed", createdAt: stamp },
      createdAt: stamp,
      updatedAt: stamp,
      sample: false,
    });
  });
  return { id, snapshot };
}

export async function loadSample(store: BillingStore, workspaceId: string, duration = false) {
  const text = duration
    ? "Replaced the kitchen tap with a standard mixer tap. Labor. The customer supplied the connectors."
    : SAMPLE_TRANSCRIPT;
  const id = createId("job");
  const snapshot = await update(store, workspaceId, (workspace) => {
    const stamp = new Date().toISOString();
    const photo = { ...samplePhoto(), url: SAMPLE_PHOTO.url };
    const transcript = { revisionId: createId("rev"), text, source: "sample" as const, createdAt: stamp };
    const drafted = draftFromTranscript({ text, catalog: workspace.catalog, transcript, photo });
    workspace.jobs.unshift({
      id,
      title: duration ? "Kitchen tap — duration missing" : "Kitchen tap replacement (sample)",
      customerId: null,
      photo,
      audio: null,
      transcript,
      createdAt: stamp,
      updatedAt: stamp,
      sample: true,
    });
    const invoice: Invoice = touch(
      {
        id: createId("inv"),
        jobId: id,
        number: nextNumber(workspace),
        customerId: null,
        recipientName: "Emma Wilson (sample)",
        recipientEmail: "",
        currency: workspace.currency,
        approval: "editing",
        delivery: "not_prepared",
        settlement: "unpaid",
        deliveryMethod: null,
        revision: 0,
        observationVersion: 1,
        lines: drafted.lines,
        exclusions: drafted.exclusions,
        questions: drafted.questions,
        totalMinor: 0,
        amountPaidMinor: 0,
        amountDueMinor: null,
        snapshot: null,
        paypalInvoiceId: null,
        paypalRecipientViewUrl: null,
        lastVerifiedAt: null,
        seeded: false,
        simulated: false,
        sample: true,
        createdAt: stamp,
        updatedAt: stamp,
      },
      stamp,
    );
    workspace.invoices.unshift(invoice);
  });
  return { id, snapshot };
}

export async function updateCapture(store: BillingStore, workspaceId: string, body: { jobId: string; patch: { title?: string; customerId?: string | null; transcriptText?: string; photo?: JobPhoto | null; audio?: Job["audio"] } }) {
  guardId(body.jobId);
  const snapshot = await update(store, workspaceId, (workspace) => {
    const job = mustJob(workspace, body.jobId);
    const stamp = new Date().toISOString();
    const previousPhotoId = job.photo?.id ?? null;
    if (body.patch.title) job.title = body.patch.title;
    if (body.patch.customerId !== undefined) job.customerId = body.patch.customerId;
    if (body.patch.photo !== undefined) job.photo = body.patch.photo;
    if (body.patch.audio !== undefined) job.audio = body.patch.audio;
    if (body.patch.transcriptText !== undefined) {
      job.transcript = { revisionId: createId("rev"), text: body.patch.transcriptText, source: isSampleTranscript(body.patch.transcriptText) ? "sample" : "typed", createdAt: stamp };
    }
    job.updatedAt = stamp;
    const invoice = invoiceFor(workspace, job.id);
    if (invoice && invoice.approval === "editing" && body.patch.photo && previousPhotoId && body.patch.photo.id !== previousPhotoId) {
      const index = workspace.invoices.findIndex((item) => item.id === invoice.id);
      workspace.invoices[index] = touch(clearMarkersForPhoto(invoice, previousPhotoId), stamp);
    }
  });
  return { snapshot };
}

export async function createDraft(store: BillingStore, workspaceId: string, jobId: string, confirmReplace = false) {
  guardId(jobId);
  let invoiceId = "";
  const snapshot = await update(store, workspaceId, (workspace) => {
    const job = mustJob(workspace, jobId);
    const text = job.transcript?.text.trim() ?? "";
    if (!text) throw new ServiceError("missing_note", 400, "Add a note before creating a draft.");
    const existing = invoiceFor(workspace, jobId);
    if (existing?.approval === "approved") throw new ServiceError("locked", 409, "Revise the approved bill before replacing it.");
    if (existing && existing.lines.some((line) => line.corrections.length > 0) && !confirmReplace) {
      throw new ServiceError("preserve_edits", 409, "This draft has edits. Confirm if you want to replace them.");
    }
    const stamp = new Date().toISOString();
    const useParser = Boolean(job.sample) && (isSampleTranscript(text) || /\bLabor\./.test(text));
    const drafted = useParser && job.transcript
      ? draftFromTranscript({ text, catalog: workspace.catalog, transcript: job.transcript, photo: job.photo })
      : { lines: [], exclusions: [], questions: ["Add invoice lines manually, or run Gemini when it is configured."] };
    if (!useParser) {
      const blank = addCustomLine(
        {
          id: existing?.id ?? createId("inv"),
          jobId,
          number: existing?.number ?? nextNumber(workspace),
          customerId: job.customerId,
          recipientName: existing?.recipientName ?? "",
          recipientEmail: existing?.recipientEmail ?? "",
          currency: workspace.currency,
          approval: "editing",
          delivery: "not_prepared",
          settlement: "unpaid",
          deliveryMethod: null,
          revision: existing?.revision ?? 0,
          observationVersion: 1,
          lines: [],
          exclusions: [],
          questions: drafted.questions,
          totalMinor: 0,
          amountPaidMinor: 0,
          amountDueMinor: null,
          snapshot: null,
          paypalInvoiceId: null,
          paypalRecipientViewUrl: null,
          lastVerifiedAt: null,
          seeded: false,
          simulated: false,
          sample: false,
          createdAt: stamp,
          updatedAt: stamp,
        },
        stamp,
      );
      invoiceId = blank.id;
      if (existing) {
        const index = workspace.invoices.findIndex((item) => item.id === existing.id);
        workspace.invoices[index] = blank;
      } else workspace.invoices.unshift(blank);
      return;
    }
    const customer = workspace.customers.find((item) => item.id === job.customerId);
    const invoice = touch(
      {
        id: existing?.id ?? createId("inv"),
        jobId,
        number: existing?.number ?? nextNumber(workspace),
        customerId: job.customerId,
        recipientName: customer?.name ?? existing?.recipientName ?? (job.sample ? "Emma Wilson (sample)" : ""),
        recipientEmail: customer?.email ?? existing?.recipientEmail ?? "",
        currency: workspace.currency,
        approval: "editing",
        delivery: existing?.delivery ?? "not_prepared",
        settlement: "unpaid",
        deliveryMethod: null,
        revision: existing?.revision ?? 0,
        observationVersion: existing?.observationVersion ?? 1,
        lines: drafted.lines,
        exclusions: drafted.exclusions,
        questions: drafted.questions,
        totalMinor: 0,
        amountPaidMinor: 0,
        amountDueMinor: null,
        snapshot: null,
        paypalInvoiceId: null,
        paypalRecipientViewUrl: null,
        lastVerifiedAt: null,
        seeded: false,
        simulated: false,
        sample: Boolean(job.sample || isSampleTranscript(text)),
        createdAt: existing?.createdAt ?? stamp,
        updatedAt: stamp,
      },
      stamp,
    );
    invoiceId = invoice.id;
    if (existing) {
      const index = workspace.invoices.findIndex((item) => item.id === existing.id);
      workspace.invoices[index] = invoice;
    } else workspace.invoices.unshift(invoice);
  });
  return { id: invoiceId, snapshot };
}

export async function updateLine(store: BillingStore, workspaceId: string, invoiceId: string, lineId: string, patch: LinePatch) {
  guardId(invoiceId);
  const snapshot = await update(store, workspaceId, (workspace) => {
    const invoice = workspace.invoices.find((item) => item.id === invoiceId);
    if (!invoice) throw new ServiceError("not_found", 404, "Invoice not found.");
    const job = mustJob(workspace, invoice.jobId);
    const stamp = new Date().toISOString();
    const lines = invoice.lines.map((line) => (line.id === lineId ? patchLine(line, patch, workspace.catalog, stamp, job.transcript?.text) : line));
    const index = workspace.invoices.findIndex((item) => item.id === invoiceId);
    workspace.invoices[index] = touch({ ...invoice, lines }, stamp);
  });
  return { snapshot };
}

export async function updateRecipient(store: BillingStore, workspaceId: string, invoiceId: string, recipient: { name?: string; email?: string }) {
  guardId(invoiceId);
  const snapshot = await update(store, workspaceId, (workspace) => {
    const invoice = workspace.invoices.find((item) => item.id === invoiceId);
    if (!invoice) throw new ServiceError("not_found", 404, "Invoice not found.");
    const index = workspace.invoices.findIndex((item) => item.id === invoiceId);
    workspace.invoices[index] = applyRecipient(invoice, recipient, new Date().toISOString());
  });
  return { snapshot };
}

export async function addLine(store: BillingStore, workspaceId: string, invoiceId: string) {
  guardId(invoiceId);
  const snapshot = await update(store, workspaceId, (workspace) => {
    const invoice = workspace.invoices.find((item) => item.id === invoiceId);
    if (!invoice) throw new ServiceError("not_found", 404, "Invoice not found.");
    const index = workspace.invoices.findIndex((item) => item.id === invoiceId);
    workspace.invoices[index] = addCustomLine(invoice, new Date().toISOString());
  });
  return { snapshot };
}

export async function deleteLine(store: BillingStore, workspaceId: string, invoiceId: string, lineId: string) {
  guardId(invoiceId);
  const snapshot = await update(store, workspaceId, (workspace) => {
    const invoice = workspace.invoices.find((item) => item.id === invoiceId);
    if (!invoice) throw new ServiceError("not_found", 404, "Invoice not found.");
    const index = workspace.invoices.findIndex((item) => item.id === invoiceId);
    workspace.invoices[index] = removeLine(invoice, lineId, new Date().toISOString());
  });
  return { snapshot };
}

export async function setMarker(store: BillingStore, workspaceId: string, invoiceId: string, lineId: string, box: Box2D) {
  guardId(invoiceId);
  const snapshot = await update(store, workspaceId, (workspace) => {
    const invoice = workspace.invoices.find((item) => item.id === invoiceId);
    if (!invoice) throw new ServiceError("not_found", 404, "Invoice not found.");
    const job = mustJob(workspace, invoice.jobId);
    const index = workspace.invoices.findIndex((item) => item.id === invoiceId);
    workspace.invoices[index] = placeMarker(invoice, lineId, job.photo, box, new Date().toISOString());
  });
  return { snapshot };
}

export async function approve(store: BillingStore, workspaceId: string, invoiceId: string, revision: number, actor: string) {
  guardId(invoiceId);
  await approveInvoice(store, workspaceId, invoiceId, revision, actor);
  const workspace = await store.getWorkspace(workspaceId);
  return { snapshot: workspace ? workspaceSnapshot(workspace) : null };
}

function paypalOrThrow(): PayPalClient {
  const status = integrationStatus();
  if (!status.paypal.configured) {
    throw new ServiceError("paypal_not_configured", 503, `PayPal Sandbox is not configured (${status.paypal.missing.join(", ")}). Nothing was simulated.`);
  }
  if (process.env.PAYPAL_MERCHANT_WORKSPACE_ID?.trim() === "") {
    throw new ServiceError("paypal_not_configured", 503, "Set PAYPAL_MERCHANT_WORKSPACE_ID before creating invoices.");
  }
  return createPayPalClient();
}

export async function paypalDraft(store: BillingStore, workspaceId: string, invoiceId: string) {
  guardId(invoiceId);
  assertBound(workspaceId);
  await createPayPalDraft(store, paypalOrThrow(), workspaceId, invoiceId);
  const workspace = await store.getWorkspace(workspaceId);
  return { snapshot: workspace ? workspaceSnapshot(workspace) : null };
}

export async function paypalSend(store: BillingStore, workspaceId: string, invoiceId: string, method: "email" | "link") {
  guardId(invoiceId);
  assertBound(workspaceId);
  await deliverPayPal(store, paypalOrThrow(), workspaceId, invoiceId, method);
  const workspace = await store.getWorkspace(workspaceId);
  return { snapshot: workspace ? workspaceSnapshot(workspace) : null };
}

export async function paypalRefresh(store: BillingStore, workspaceId: string, invoiceId: string) {
  guardId(invoiceId);
  assertBound(workspaceId);
  await refreshPayPal(store, paypalOrThrow(), workspaceId, invoiceId);
  const workspace = await store.getWorkspace(workspaceId);
  return { snapshot: workspace ? workspaceSnapshot(workspace) : null };
}

function assertBound(workspaceId: string) {
  const bound = process.env.PAYPAL_MERCHANT_WORKSPACE_ID?.trim();
  if (!bound || bound !== workspaceId) {
    throw new ServiceError("paypal_not_configured", 503, "Bind PAYPAL_MERCHANT_WORKSPACE_ID to this contractor workspace before calling PayPal.");
  }
}

export async function addCustomer(store: BillingStore, workspaceId: string, input: { name: string; email: string }) {
  const id = createId("cus");
  const snapshot = await update(store, workspaceId, (workspace) => {
    workspace.customers.unshift({ id, name: input.name.trim(), email: input.email.trim(), createdAt: new Date().toISOString() });
  });
  return { id, snapshot };
}

export async function saveCatalog(store: BillingStore, workspaceId: string, input: { id?: string; name: string; unit: string; rateMinor: number; aliases: string[] }) {
  const snapshot = await update(store, workspaceId, (workspace) => {
    if (input.id) {
      workspace.catalog = workspace.catalog.map((item) => item.id === input.id ? { ...item, name: input.name, unit: input.unit, rateMinor: input.rateMinor, aliases: input.aliases } : item);
      return;
    }
    workspace.catalog.unshift({ id: createId("cat"), name: input.name.trim(), unit: input.unit || "each", rateMinor: input.rateMinor, aliases: input.aliases.map((alias) => alias.trim()).filter(Boolean), active: true, retiredAt: null });
  });
  return { snapshot };
}

export async function retireCatalog(store: BillingStore, workspaceId: string, id: string) {
  const snapshot = await update(store, workspaceId, (workspace) => {
    workspace.catalog = workspace.catalog.map((item) => item.id === id ? { ...item, active: false, retiredAt: new Date().toISOString() } : item);
  });
  return { snapshot };
}

export async function applySamplePhoto(store: BillingStore, workspaceId: string, jobId: string) {
  return updateCapture(store, workspaceId, { jobId, patch: { photo: samplePhoto() } });
}

export async function signUpload(workspaceId: string, jobId: string, kind: "photo" | "audio", mimeType: string, byteSize: number) {
  guardId(jobId);
  if (byteSize > 8 * 1024 * 1024) throw new ServiceError("too_large", 413, "Files need to be 8 MB or smaller.");
  const extension = kind === "photo" ? "jpg" : "wav";
  const objectPath = `workspaces/${workspaceId}/jobs/${jobId}/${createId(kind)}.${extension}`;
  const admin = supabaseAdmin();
  const signed = await admin.storage.from("evidence").createSignedUploadUrl(objectPath);
  if (signed.error || !signed.data) throw new ServiceError("storage", 503, "Private storage did not issue an upload URL. Create the evidence bucket and apply the storage policy.");
  return { path: objectPath, token: signed.data.token, signedUrl: signed.data.signedUrl, mimeType };
}

export async function finalizeUpload(store: BillingStore, workspaceId: string, body: { jobId: string; path: string; kind: "photo" | "audio"; mimeType: string; byteSize: number; width?: number; height?: number; durationMs?: number }) {
  guardId(body.jobId);
  if (!body.path.startsWith(`workspaces/${workspaceId}/jobs/${body.jobId}/`)) {
    throw new ServiceError("bad_path", 400, "That file is not in this job.");
  }
  const admin = supabaseAdmin();
  const downloaded = await admin.storage.from("evidence").download(body.path);
  if (downloaded.error || !downloaded.data) throw new ServiceError("storage", 400, "The uploaded file could not be verified.");
  if (downloaded.data.size > 8 * 1024 * 1024) throw new ServiceError("too_large", 413, "Files need to be 8 MB or smaller.");
  let width = body.width ?? 0;
  let height = body.height ?? 0;
  const storagePath = body.path;
  let mimeType = body.mimeType;
  if (body.kind === "photo") {
    const bytes = Buffer.from(await downloaded.data.arrayBuffer());
    const normalized = await normalizeJobImage(bytes, body.mimeType);
    width = normalized.width;
    height = normalized.height;
    mimeType = normalized.mimeType;
    const uploaded = await admin.storage.from("evidence").upload(storagePath, normalized.bytes, { contentType: "image/jpeg", upsert: true });
    if (uploaded.error) throw new ServiceError("storage", 502, "The normalized photo could not be stored.");
  }
  const signedRead = await admin.storage.from("evidence").createSignedUrl(storagePath, 60 * 30);
  const snapshot = await update(store, workspaceId, (workspace) => {
    const job = mustJob(workspace, body.jobId);
    const stamp = new Date().toISOString();
    if (body.kind === "photo") {
      const previous = job.photo?.id;
      job.photo = { id: createId("photo"), version: (job.photo?.version ?? 0) + 1, width, height, mimeType, source: "upload", url: signedRead.data?.signedUrl ?? null, storagePath };
      const invoice = invoiceFor(workspace, job.id);
      if (invoice && previous) {
        const index = workspace.invoices.findIndex((item) => item.id === invoice.id);
        workspace.invoices[index] = touch(clearMarkersForPhoto(invoice, previous), stamp);
      }
    } else {
      job.audio = { id: createId("audio"), mimeType, durationMs: body.durationMs ?? 0, localOnly: false, url: signedRead.data?.signedUrl ?? null, storagePath };
    }
    job.updatedAt = stamp;
  });
  return { snapshot };
}

export async function transcribe(store: BillingStore, workspaceId: string, jobId: string) {
  guardId(jobId);
  const status = integrationStatus();
  if (!status.gemini.configured) throw new ServiceError("gemini_not_configured", 503, "GEMINI_API_KEY is not configured. Type the note instead.");
  const workspace = await store.getWorkspace(workspaceId);
  const job = workspace ? mustJob(workspace, jobId) : null;
  if (!job?.audio?.storagePath) throw new ServiceError("no_audio", 400, "Record or upload audio before transcribing, or type the note.");
  const attempts = workspace?.aiRuns.filter((run) => run.jobId === jobId && run.stage === "transcribe").length ?? 0;
  if (attempts >= 3) throw new ServiceError("retry_limit", 429, "Transcription was already tried three times. Type the note instead.");
  const started = Date.now();
  const inputRevision = { photoVersion: job.photo?.version ?? null, transcriptRevisionId: job.transcript?.revisionId ?? null };
  const admin = supabaseAdmin();
  const downloaded = await admin.storage.from("evidence").download(job.audio.storagePath);
  if (downloaded.error || !downloaded.data) throw new ServiceError("storage", 400, "The recording could not be read.");
  const bytes = Buffer.from(await downloaded.data.arrayBuffer());
  let text = "";
  let errorMessage: string | null = null;
  try {
    text = await transcribeWithGemini({ apiKey: process.env.GEMINI_API_KEY!, model: status.gemini.transcriptionModel, bytes, mimeType: job.audio.mimeType || "audio/wav" });
  } catch (error) {
    errorMessage = error instanceof Error ? error.message : "Transcription failed.";
  }
  const snapshot = await update(store, workspaceId, (current) => {
    const currentJob = mustJob(current, jobId);
    const stale = extractionIsStale(inputRevision, { photoVersion: currentJob.photo?.version ?? null, transcriptRevisionId: currentJob.transcript?.revisionId ?? null });
    current.aiRuns.push({
      id: createId("airun"),
      jobId,
      stage: "transcribe",
      status: errorMessage ? "failed" : stale ? "stale" : "succeeded",
      inputRevision,
      attempt: attempts + 1,
      responseBytes: text.length,
      durationMs: Date.now() - started,
      stale,
      error: errorMessage,
      createdAt: new Date().toISOString(),
    });
    if (!errorMessage && !stale) {
      currentJob.transcript = { revisionId: createId("rev"), text, source: "gemini", createdAt: new Date().toISOString() };
      currentJob.updatedAt = new Date().toISOString();
    }
  });
  if (errorMessage) throw new ServiceError("gemini_failed", 502, `${errorMessage} The job is saved. Type the note instead.`);
  return { snapshot };
}

export async function extract(store: BillingStore, workspaceId: string, jobId: string) {
  guardId(jobId);
  const status = integrationStatus();
  if (!status.gemini.configured) throw new ServiceError("gemini_not_configured", 503, "GEMINI_API_KEY is not configured. Add invoice lines manually.");
  const workspace = await store.getWorkspace(workspaceId);
  const job = workspace ? mustJob(workspace, jobId) : null;
  if (!job?.transcript?.text.trim()) throw new ServiceError("missing_note", 400, "Confirm the note before asking for line suggestions.");
  if (!job.photo?.storagePath && job.photo?.id !== SAMPLE_PHOTO.id) throw new ServiceError("no_photo", 400, "Add a photo, or continue with manual lines.");
  const attempts = workspace?.aiRuns.filter((run) => run.jobId === jobId && run.stage === "extract").length ?? 0;
  if (attempts >= 3) throw new ServiceError("retry_limit", 429, "Suggestions were already requested three times. Edit the lines manually.");
  const inputRevision = { photoVersion: job.photo?.version ?? null, transcriptRevisionId: job.transcript.revisionId };
  let bytes: Buffer;
  if (job.photo?.id === SAMPLE_PHOTO.id && !job.photo.storagePath) {
    bytes = await readFile(path.join(process.cwd(), "public", "demo", "kitchen-tap.jpg"));
  } else {
    const downloaded = await supabaseAdmin().storage.from("evidence").download(job.photo!.storagePath!);
    if (downloaded.error || !downloaded.data) throw new ServiceError("storage", 400, "The job photo could not be read.");
    bytes = Buffer.from(await downloaded.data.arrayBuffer());
  }
  const started = Date.now();
  let extracted: Extraction | null = null;
  let errorMessage: string | null = null;
  try {
    extracted = await extractWithGemini({ apiKey: process.env.GEMINI_API_KEY!, model: status.gemini.visionModel, image: bytes, imageMime: "image/jpeg", note: job.transcript.text });
  } catch (error) {
    errorMessage = error instanceof Error ? error.message : "Gemini could not read this job.";
  }
  const snapshot = await update(store, workspaceId, (current) => {
    const currentJob = mustJob(current, jobId);
    const stale = extractionIsStale(inputRevision, { photoVersion: currentJob.photo?.version ?? null, transcriptRevisionId: currentJob.transcript?.revisionId ?? null });
    current.aiRuns.push({
      id: createId("airun"),
      jobId,
      stage: "extract",
      status: errorMessage ? "failed" : stale ? "stale" : "succeeded",
      inputRevision,
      attempt: attempts + 1,
      responseBytes: extracted ? JSON.stringify(extracted).length : 0,
      durationMs: Date.now() - started,
      stale,
      error: errorMessage,
      createdAt: new Date().toISOString(),
    });
    if (!extracted || stale || errorMessage) return;
    const existing = invoiceFor(current, jobId);
    if (existing && existing.lines.some((line) => line.corrections.length > 0)) return;
    const applied = applyExtraction({ extraction: extracted, catalog: current.catalog, transcript: currentJob.transcript, photo: currentJob.photo, regionSource: "gemini" });
    const stamp = new Date().toISOString();
    const invoice = touch(
      {
        id: existing?.id ?? createId("inv"),
        jobId,
        number: existing?.number ?? nextNumber(current),
        customerId: currentJob.customerId,
        recipientName: existing?.recipientName ?? "",
        recipientEmail: existing?.recipientEmail ?? "",
        currency: current.currency,
        approval: "editing",
        delivery: "not_prepared",
        settlement: "unpaid",
        deliveryMethod: null,
        revision: existing?.revision ?? 0,
        observationVersion: existing?.observationVersion ?? 1,
        lines: applied.lines,
        exclusions: applied.exclusions,
        questions: applied.questions,
        totalMinor: 0,
        amountPaidMinor: 0,
        amountDueMinor: null,
        snapshot: null,
        paypalInvoiceId: null,
        paypalRecipientViewUrl: null,
        lastVerifiedAt: null,
        seeded: false,
        simulated: false,
        sample: false,
        createdAt: existing?.createdAt ?? stamp,
        updatedAt: stamp,
      },
      stamp,
    );
    if (existing) {
      const index = current.invoices.findIndex((item) => item.id === existing.id);
      current.invoices[index] = invoice;
    } else current.invoices.unshift(invoice);
  });
  if (errorMessage) throw new ServiceError("gemini_failed", 502, `${errorMessage} You can still add lines manually.`);
  return { snapshot };
}
