"use client";

import { createClient } from "@supabase/supabase-js";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import type { IntegrationStatus } from "@/lib/config";
import { DEFAULT_FILTER, type OverviewFilter } from "@/lib/domain/overview";
import { ServiceError } from "@/lib/domain/ids";
import type { WorkspaceSnapshot } from "@/lib/domain/types";
import { blobToWav, fileToOrientedJpeg } from "@/lib/demo/media";
import { WorkspaceContext, type WorkspaceActions, type WorkspaceError } from "./workspace-context";

async function postAction(action: string, body: Record<string, unknown>) {
  const response = await fetch(`/api/workspace/${action}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await response.json()) as { message?: string; code?: string; snapshot?: WorkspaceSnapshot; id?: string; path?: string; token?: string; signedUrl?: string };
  if (!response.ok) throw new ServiceError(json.code ?? "request_failed", response.status, json.message ?? "The PayPal workspace could not complete that action.");
  return json;
}

export function PayPalProvider({ children, integration, contractorName }: { children: ReactNode; integration: IntegrationStatus; contractorName: string }) {
  const [snapshot, setSnapshot] = useState<WorkspaceSnapshot | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<WorkspaceError>(null);
  const [filter, setFilter] = useState<OverviewFilter>(DEFAULT_FILTER);

  const refresh = useCallback(async () => {
    const response = await fetch("/api/workspace");
    const json = (await response.json()) as { snapshot?: WorkspaceSnapshot; message?: string; code?: string };
    if (!response.ok) throw new ServiceError(json.code ?? "request_failed", response.status, json.message ?? "The workspace could not be loaded.");
    if (json.snapshot) setSnapshot({ ...json.snapshot, contractorName: json.snapshot.contractorName || contractorName });
  }, [contractorName]);

  useEffect(() => {
    refresh()
      .catch((caught: unknown) => setError({ message: caught instanceof Error ? caught.message : "The workspace could not be loaded." }))
      .finally(() => setReady(true));
  }, [refresh]);

  const run = useCallback(
    async (action: string, body: Record<string, unknown> = {}) => {
      try {
        const json = await postAction(action, body);
        if (json.snapshot) setSnapshot(json.snapshot);
        setError(null);
        return json;
      } catch (caught) {
        const message = caught instanceof Error ? caught.message : "Request failed.";
        const code = caught instanceof ServiceError ? caught.code : undefined;
        setError({ message, code });
        throw caught;
      }
    },
    [],
  );

  const uploadPrivate = useCallback(async (jobId: string, kind: "photo" | "audio", blob: Blob, mimeType: string, meta: Record<string, unknown>) => {
    const signed = await postAction("sign-upload", { jobId, kind, mimeType, byteSize: blob.size });
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !anon || !signed.path || !signed.token) throw new ServiceError("not_configured", 503, "Supabase Storage is not configured.");
    const client = createClient(url, anon);
    const uploaded = await client.storage.from("evidence").uploadToSignedUrl(String(signed.path), String(signed.token), blob, { contentType: mimeType });
    if (uploaded.error) throw new ServiceError("upload_failed", 502, "The file could not be stored. Check the private evidence bucket.");
    await run("finalize-upload", { jobId, path: signed.path, kind, mimeType, byteSize: blob.size, ...meta });
  }, [run]);

  const actions = useMemo<WorkspaceActions>(() => {
    const demoOnly = async () => {
      const message = "Simulation stays in the demo. This PayPal workspace will not pretend a payment happened.";
      setError({ message, code: "not_simulated" });
      throw new ServiceError("not_simulated", 400, message);
    };
    return {
      newJob: async () => String((await run("new-job")).id),
      loadSample: async () => String((await run("load-sample")).id),
      loadDuration: async () => String((await run("load-duration")).id),
      updateCapture: async (jobId, patch) => { await run("update-capture", { jobId, patch }); },
      createDraft: async (jobId, confirmReplace) => String((await run("create-draft", { jobId, confirmReplace })).id),
      transcribe: async (jobId) => { await run("transcribe", { jobId }); },
      extract: async (jobId) => { await run("extract", { jobId }); },
      updateLine: async (invoiceId, lineId, patch) => { await run("update-line", { invoiceId, lineId, patch }); },
      updateRecipient: async (invoiceId, recipient) => { await run("update-recipient", { invoiceId, recipient }); },
      addLine: async (invoiceId) => { await run("add-line", { invoiceId }); },
      deleteLine: async (invoiceId, lineId) => { await run("delete-line", { invoiceId, lineId }); },
      setMarker: async (invoiceId, lineId, box) => { await run("set-marker", { invoiceId, lineId, box }); },
      approve: async (invoiceId, revision) => { await run("approve", { invoiceId, revision }); },
      simulateSend: demoOnly,
      simulateSettlement: demoOnly,
      createPayPalDraft: async (invoiceId) => { await run("paypal-draft", { invoiceId }); },
      sendPayPal: async (invoiceId) => { await run("paypal-send", { invoiceId }); },
      linkPayPal: async (invoiceId) => { await run("paypal-link", { invoiceId }); },
      refreshPayPal: async (invoiceId) => { await run("paypal-refresh", { invoiceId }); },
      remind: async (invoiceId, subject, note) => { await run("paypal-remind", { invoiceId, subject, note }); },
      saveCash: async (cash) => { await run("save-cash", { cash }); },
      addCustomer: async (input) => String((await run("add-customer", input)).id),
      saveCatalog: async (input) => { await run("save-catalog", input); },
      retireCatalog: async (id) => { await run("retire-catalog", { id }); },
      resetDemo: demoOnly,
      attachPhoto: async (jobId, file) => {
        const image = await fileToOrientedJpeg(file);
        await uploadPrivate(jobId, "photo", image.blob, "image/jpeg", { width: image.width, height: image.height });
        await refresh();
      },
      useSamplePhoto: async (jobId) => { await run("use-sample-photo", { jobId }); },
      attachAudio: async (jobId, blob, durationMs) => {
        let wav = blob;
        try {
          wav = await blobToWav(blob);
        } catch {
          throw new ServiceError("unsupported_audio", 415, "This recording couldn't be converted. Type the note instead.");
        }
        await uploadPrivate(jobId, "audio", wav, "audio/wav", { durationMs });
        await refresh();
      },
      clearError: () => setError(null),
    };
  }, [refresh, run, uploadPrivate]);

  return (
    <WorkspaceContext.Provider value={{ mode: "paypal_sandbox", ready, snapshot, integration, error, storageNote: null, filter, setFilter, actions }}>
      {children}
    </WorkspaceContext.Provider>
  );
}
