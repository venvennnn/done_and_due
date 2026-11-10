import { NextResponse } from "next/server";
import { ServiceError } from "@/lib/domain/ids";
import { assertSameOrigin } from "@/lib/http/origin";
import type { Box2D } from "@/lib/domain/types";
import type { LinePatch } from "@/lib/domain/mutate";
import {
  addCustomer,
  addLine,
  approve,
  createDraft,
  deleteLine,
  extract,
  finalizeUpload,
  loadSample,
  newJob,
  paypalDraft,
  paypalRefresh,
  paypalSend,
  retireCatalog,
  saveCatalog,
  setMarker,
  signUpload,
  transcribe,
  updateCapture,
  updateLine,
  updateRecipient,
  applySamplePhoto,
} from "@/server/actions";
import { gateWorkspace, supabaseAdmin } from "@/server/session";
import { ensureWorkspace, SupabaseBillingStore } from "@/server/supabase-store";

type Body = Record<string, unknown>;

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export async function POST(request: Request, context: { params: Promise<{ action: string }> }) {
  try {
    assertSameOrigin(request);
    const gate = await gateWorkspace();
    if (gate.type !== "ready") {
      return NextResponse.json({ code: gate.type, message: "Sign in with an allowlisted contractor account." }, { status: gate.type === "forbidden" ? 403 : 401 });
    }
    const { action } = await context.params;
    const body = (await request.json().catch(() => ({}))) as Body;
    const admin = supabaseAdmin();
    const workspace = await ensureWorkspace(admin, gate.userId, gate.name);
    const store = new SupabaseBillingStore(admin);
    const result = await dispatch(action, store, workspace.id, body, gate.name);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ServiceError) return NextResponse.json({ code: error.code, message: error.message }, { status: error.status });
    return NextResponse.json({ code: "internal", message: "That action could not be completed. Saved work is unchanged if the request failed before writing." }, { status: 500 });
  }
}

async function dispatch(action: string, store: SupabaseBillingStore, workspaceId: string, body: Body, actor: string) {
  switch (action) {
    case "new-job":
      return newJob(store, workspaceId);
    case "load-sample":
      return loadSample(store, workspaceId, false);
    case "load-duration":
      return loadSample(store, workspaceId, true);
    case "update-capture":
      return updateCapture(store, workspaceId, { jobId: text(body.jobId), patch: (body.patch ?? {}) as { title?: string; customerId?: string | null; transcriptText?: string } });
    case "create-draft":
      return createDraft(store, workspaceId, text(body.jobId), body.confirmReplace === true);
    case "transcribe":
      return transcribe(store, workspaceId, text(body.jobId));
    case "extract":
      return extract(store, workspaceId, text(body.jobId));
    case "update-line":
      return updateLine(store, workspaceId, text(body.invoiceId), text(body.lineId), (body.patch ?? {}) as LinePatch);
    case "update-recipient":
      return updateRecipient(store, workspaceId, text(body.invoiceId), (body.recipient ?? {}) as { name?: string; email?: string });
    case "add-line":
      return addLine(store, workspaceId, text(body.invoiceId));
    case "delete-line":
      return deleteLine(store, workspaceId, text(body.invoiceId), text(body.lineId));
    case "set-marker":
      return setMarker(store, workspaceId, text(body.invoiceId), text(body.lineId), body.box as Box2D);
    case "approve":
      return approve(store, workspaceId, text(body.invoiceId), Number(body.revision), actor);
    case "paypal-draft":
      return paypalDraft(store, workspaceId, text(body.invoiceId));
    case "paypal-send":
      return paypalSend(store, workspaceId, text(body.invoiceId), "email");
    case "paypal-link":
      return paypalSend(store, workspaceId, text(body.invoiceId), "link");
    case "paypal-refresh":
      return paypalRefresh(store, workspaceId, text(body.invoiceId));
    case "add-customer":
      return addCustomer(store, workspaceId, { name: text(body.name), email: text(body.email) });
    case "save-catalog":
      return saveCatalog(store, workspaceId, { id: text(body.id) || undefined, name: text(body.name), unit: text(body.unit) || "each", rateMinor: Number(body.rateMinor), aliases: Array.isArray(body.aliases) ? body.aliases.map(String) : [] });
    case "retire-catalog":
      return retireCatalog(store, workspaceId, text(body.id));
    case "use-sample-photo":
      return applySamplePhoto(store, workspaceId, text(body.jobId));
    case "sign-upload":
      return signUpload(workspaceId, text(body.jobId), body.kind === "audio" ? "audio" : "photo", text(body.mimeType), Number(body.byteSize));
    case "finalize-upload":
      return finalizeUpload(store, workspaceId, {
        jobId: text(body.jobId),
        path: text(body.path),
        kind: body.kind === "audio" ? "audio" : "photo",
        mimeType: text(body.mimeType),
        byteSize: Number(body.byteSize),
        width: typeof body.width === "number" ? body.width : undefined,
        height: typeof body.height === "number" ? body.height : undefined,
        durationMs: typeof body.durationMs === "number" ? body.durationMs : undefined,
      });
    default:
      throw new ServiceError("unknown_action", 404, "That workspace action is not available.");
  }
}
