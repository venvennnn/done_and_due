"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { ServiceError } from "@/lib/domain/ids";
import { DEFAULT_FILTER, type OverviewFilter } from "@/lib/domain/overview";
import { createId } from "@/lib/domain/ids";
import { samplePhoto } from "@/lib/demo/seed";
import { fileToOrientedJpeg } from "@/lib/demo/media";
import {
  addCustomer,
  addLine,
  approveInvoice,
  createDraft,
  createJob,
  deleteLine,
  loadDurationExample,
  loadSampleJob,
  resetDemo,
  retireCatalogItem,
  saveCatalogItem,
  setMarker,
  simulateSend,
  simulateSettlement,
  draftReminder,
  replaceLedger,
  updateCapture,
  updateInvoiceLine,
  updateRecipient,
  type DemoState,
} from "@/lib/demo/engine";
import { clearDemoBlobs, clearDemoState, getDemoBlob, hydrateDemoMedia, putDemoBlob, readDemoState, writeDemoState } from "@/lib/demo/storage";
import { WorkspaceContext, type WorkspaceActions, type WorkspaceError } from "./workspace-context";

function explain(error: unknown): WorkspaceError {
  if (error instanceof ServiceError) return { message: error.message, code: error.code };
  if (error instanceof Error) return { message: error.message };
  return { message: "Something went wrong." };
}

export function DemoProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<DemoState | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<WorkspaceError>(null);
  const [storageNote, setStorageNote] = useState<string | null>(null);
  const [filter, setFilter] = useState<OverviewFilter>(DEFAULT_FILTER);

  useEffect(() => {
    let cancel = false;
    const loaded = readDemoState();
    hydrateDemoMedia(loaded)
      .then((note) => {
        if (cancel) return;
        setStorageNote(note);
        setState(loaded);
        setReady(true);
      })
      .catch(() => {
        if (cancel) return;
        setState(loaded);
        setStorageNote("This browser couldn't open local photo storage. The sample job still works.");
        setReady(true);
      });
    return () => {
      cancel = true;
    };
  }, []);

  const commit = useCallback((next: DemoState) => {
    setState(next);
    try {
      writeDemoState(next);
    } catch {
      setStorageNote("This browser couldn't save the demo. Your changes stay on this page until you leave.");
    }
  }, []);

  const run = useCallback(
    async <T,>(fn: (current: DemoState) => T | Promise<T>): Promise<T> => {
      if (!state) throw new ServiceError("loading", 409, "The demo is still loading.");
      try {
        const result = await fn(state);
        setError(null);
        return result;
      } catch (caught) {
        const explained = explain(caught);
        setError(explained);
        throw caught;
      }
    },
    [state],
  );

  const actions = useMemo<WorkspaceActions>(() => {
    const unsupported = async () => {
      const explained = { message: "PayPal actions stay in the PayPal workspace. This demo only simulates delivery and payment.", code: "demo_only" };
      setError(explained);
      throw new ServiceError("demo_only", 400, explained.message);
    };
    return {
      newJob: () => run((current) => { const result = createJob(current, new Date()); commit(result.state); return result.jobId; }),
      loadSample: () => run((current) => { const result = loadSampleJob(current, new Date()); commit(result.state); return result.jobId; }),
      loadDuration: () => run((current) => { const result = loadDurationExample(current, new Date()); commit(result.state); return result.jobId; }),
      updateCapture: (jobId, patch) => run((current) => { commit(updateCapture(current, jobId, patch, new Date())); }),
      createDraft: (jobId, confirmReplace) => run((current) => { const result = createDraft(current, jobId, new Date(), confirmReplace); commit(result.state); return result.invoiceId; }),
      transcribe: async () => { setError({ message: "The demo does not send audio to Gemini. Type the note, or load the sample text. Playback stays in this browser.", code: "demo_only" }); },
      extract: async () => { setError({ message: "The demo builds lines from the saved note and your price list. It does not call Gemini.", code: "demo_only" }); },
      updateLine: (invoiceId, lineId, patch) => run((current) => { commit(updateInvoiceLine(current, invoiceId, lineId, patch, new Date())); }),
      updateRecipient: (invoiceId, recipient) => run((current) => { commit(updateRecipient(current, invoiceId, recipient, new Date())); }),
      addLine: (invoiceId) => run((current) => { commit(addLine(current, invoiceId, new Date())); }),
      deleteLine: (invoiceId, lineId) => run((current) => { commit(deleteLine(current, invoiceId, lineId, new Date())); }),
      setMarker: (invoiceId, lineId, box) => run((current) => { commit(setMarker(current, invoiceId, lineId, box, new Date())); }),
      approve: (invoiceId, revision) => run((current) => { commit(approveInvoice(current, invoiceId, revision, new Date())); }),
      simulateSend: (invoiceId) => run((current) => { commit(simulateSend(current, invoiceId, new Date())); }),
      simulateSettlement: (invoiceId, target) => run((current) => { commit(simulateSettlement(current, invoiceId, target, new Date())); }),
      createPayPalDraft: unsupported,
      sendPayPal: unsupported,
      linkPayPal: unsupported,
      refreshPayPal: unsupported,
      remind: (invoiceId, _subject, note) => run((current) => { commit(draftReminder(current, invoiceId, note, new Date())); }),
      saveCash: (cash) => run((current) => { commit(replaceLedger(current, cash)); }),
      addCustomer: (input) => run((current) => { const result = addCustomer(current, input, new Date()); commit(result.state); return result.customerId; }),
      saveCatalog: (input) => run((current) => { commit(saveCatalogItem(current, input, new Date())); }),
      retireCatalog: (id) => run((current) => { commit(retireCatalogItem(current, id, new Date())); }),
      resetDemo: async () => {
        try {
          await clearDemoBlobs();
        } catch {
          setStorageNote("Local photos could not be cleared, but the sample workspace was restored.");
        }
        clearDemoState();
        commit(resetDemo(new Date()));
        setError(null);
      },
      attachPhoto: async (jobId, file) => {
        const image = await fileToOrientedJpeg(file);
        const id = createId("demo_photo");
        try {
          await putDemoBlob(id, image.blob);
        } catch {
          setStorageNote("The photo is ready for this visit. This browser couldn't store it for next time.");
        }
        const currentPhoto = state?.snapshot.jobs.find((job) => job.id === jobId)?.photo;
        await run((current) => {
          commit(
            updateCapture(current, jobId, {
              photo: {
                id,
                version: (currentPhoto?.version ?? 0) + 1,
                width: image.width,
                height: image.height,
                mimeType: "image/jpeg",
                source: "upload",
                url: URL.createObjectURL(image.blob),
                storagePath: null,
              },
            }, new Date()),
          );
        });
      },
      useSamplePhoto: (jobId) => run((current) => { commit(updateCapture(current, jobId, { photo: samplePhoto() }, new Date())); }),
      attachAudio: async (jobId, blob, durationMs) => {
        const id = createId("demo_audio");
        try {
          await putDemoBlob(id, blob);
        } catch {
          setStorageNote("The recording plays in this visit only.");
        }
        await run((current) => {
          commit(
            updateCapture(current, jobId, {
              audio: { id, mimeType: blob.type || "audio/wav", durationMs, localOnly: true, url: URL.createObjectURL(blob), storagePath: null },
            }, new Date()),
          );
        });
      },
      clearError: () => setError(null),
    };
  }, [commit, run, state]);

  return (
    <WorkspaceContext.Provider
      value={{
        mode: "demo",
        ready,
        snapshot: state?.snapshot ?? null,
        integration: null,
        error,
        storageNote,
        filter,
        setFilter,
        actions,
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  );
}

export async function readBlobAgain(id: string): Promise<Blob | null> {
  return getDemoBlob(id);
}
