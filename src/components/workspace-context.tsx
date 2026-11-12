"use client";

import { createContext, useContext } from "react";
import type { IntegrationStatus } from "@/lib/config";
import type { OverviewFilter } from "@/lib/domain/overview";
import type { Box2D, JobAudio, JobPhoto, WorkspaceSnapshot } from "@/lib/domain/types";
import type { LinePatch } from "@/lib/domain/mutate";

export type WorkspaceError = { message: string; code?: string } | null;

export type WorkspaceActions = {
  newJob: () => Promise<string>;
  loadSample: () => Promise<string>;
  loadDuration: () => Promise<string>;
  updateCapture: (
    jobId: string,
    patch: { title?: string; customerId?: string | null; transcriptText?: string; photo?: JobPhoto | null; audio?: JobAudio | null },
  ) => Promise<void>;
  createDraft: (jobId: string, confirmReplace?: boolean) => Promise<string>;
  transcribe: (jobId: string) => Promise<void>;
  extract: (jobId: string) => Promise<void>;
  updateLine: (invoiceId: string, lineId: string, patch: LinePatch) => Promise<void>;
  updateRecipient: (invoiceId: string, recipient: { name?: string; email?: string }) => Promise<void>;
  addLine: (invoiceId: string) => Promise<void>;
  deleteLine: (invoiceId: string, lineId: string) => Promise<void>;
  setMarker: (invoiceId: string, lineId: string, box: Box2D) => Promise<void>;
  approve: (invoiceId: string, revision: number) => Promise<void>;
  simulateSend: (invoiceId: string) => Promise<void>;
  simulateSettlement: (invoiceId: string, target: "pending" | "partially_paid" | "paid") => Promise<void>;
  createPayPalDraft: (invoiceId: string) => Promise<void>;
  sendPayPal: (invoiceId: string) => Promise<void>;
  linkPayPal: (invoiceId: string) => Promise<void>;
  refreshPayPal: (invoiceId: string) => Promise<void>;
  remind: (invoiceId: string, subject: string, note: string) => Promise<void>;
  saveCash: (cash: import("@/lib/domain/types").CashLedger) => Promise<void>;
  addCustomer: (input: { name: string; email: string }) => Promise<string>;
  saveCatalog: (input: { id?: string; name: string; unit: string; rateMinor: number; aliases: string[] }) => Promise<void>;
  retireCatalog: (id: string) => Promise<void>;
  resetDemo: () => Promise<void>;
  attachPhoto: (jobId: string, file: File) => Promise<void>;
  useSamplePhoto: (jobId: string) => Promise<void>;
  attachAudio: (jobId: string, blob: Blob, durationMs: number) => Promise<void>;
  clearError: () => void;
};

export type WorkspaceController = {
  mode: "demo" | "paypal_sandbox";
  ready: boolean;
  snapshot: WorkspaceSnapshot | null;
  integration: IntegrationStatus | null;
  error: WorkspaceError;
  storageNote: string | null;
  filter: OverviewFilter;
  setFilter: (filter: OverviewFilter) => void;
  actions: WorkspaceActions;
};

export const WorkspaceContext = createContext<WorkspaceController | null>(null);

export function useWorkspace(): WorkspaceController {
  const value = useContext(WorkspaceContext);
  if (!value) throw new Error("Open this screen from a Done & Due workspace.");
  return value;
}
