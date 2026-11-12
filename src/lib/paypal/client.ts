import "server-only";
import { PAYPAL_SANDBOX_API, assertSandbox } from "@/lib/config";
import { ServiceError } from "@/lib/domain/ids";
import type { ProviderErrorCategory } from "@/lib/domain/types";
import type { PayPalInvoice } from "./map";

export type PayPalClient = {
  createDraft(body: Record<string, unknown>, requestId: string): Promise<PayPalInvoice>;
  send(id: string, body: Record<string, unknown>, requestId: string): Promise<void>;
  getInvoice(id: string): Promise<PayPalInvoice>;
  searchByNumber(invoiceNumber: string): Promise<PayPalInvoice[]>;
  deleteDraft(id: string): Promise<void>;
  remind(id: string, body: { subject: string; note: string }, requestId: string): Promise<void>;
};

export function classifyHttpStatus(status: number): ProviderErrorCategory {
  if (status === 401 || status === 403) return "permission";
  if (status >= 400 && status < 500) return "bad_input";
  return "transient";
}

export function createPayPalClient(env: NodeJS.ProcessEnv = process.env, fetchImpl: typeof fetch = fetch): PayPalClient {
  assertSandbox(env);
  const clientId = env.PAYPAL_CLIENT_ID?.trim() ?? "";
  const secret = env.PAYPAL_CLIENT_SECRET?.trim() ?? "";
  if (!clientId || !secret) {
    throw new ServiceError("paypal_not_configured", 503, "PayPal Sandbox credentials are not configured.", "permission");
  }
  let token: { value: string; expiresAt: number } | null = null;

  async function authorize(): Promise<string> {
    if (token && token.expiresAt > Date.now() + 30_000) return token.value;
    const response = await fetchImpl(`${PAYPAL_SANDBOX_API}/v1/oauth2/token`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${clientId}:${secret}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      throw new ServiceError("paypal_auth", response.status, "PayPal Sandbox rejected the merchant credentials.", classifyHttpStatus(response.status));
    }
    const json = (await response.json()) as { access_token?: string; expires_in?: number };
    if (!json.access_token) throw new ServiceError("paypal_auth", 502, "PayPal did not return an access token.", "uncertain");
    token = { value: json.access_token, expiresAt: Date.now() + (json.expires_in ?? 300) * 1000 };
    return json.access_token;
  }

  async function request(method: string, path: string, body?: unknown, requestId?: string): Promise<{ status: number; json: unknown }> {
    const access = await authorize();
    let response: Response;
    try {
      response = await fetchImpl(`${PAYPAL_SANDBOX_API}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${access}`,
          "Content-Type": "application/json",
          Accept: "application/json",
          ...(requestId ? { "PayPal-Request-Id": requestId } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(20_000),
      });
    } catch {
      throw new ServiceError("paypal_network", 504, "PayPal Sandbox did not respond. Reconcile before trying again.", "uncertain");
    }
    const text = await response.text();
    const json = text ? safeJson(text) : {};
    if (!response.ok) {
      const category = response.status >= 500 ? "uncertain" : classifyHttpStatus(response.status);
      throw new ServiceError("paypal_http", response.status, paypalMessage(category), category);
    }
    return { status: response.status, json };
  }

  return {
    async createDraft(body, requestId) {
      const { json } = await request("POST", "/v2/invoicing/invoices", body, requestId);
      const invoice = json as PayPalInvoice;
      if (!invoice.id) throw new ServiceError("paypal_shape", 502, "PayPal did not return an invoice id.", "uncertain");
      return invoice;
    },
    async send(id, body, requestId) {
      await request("POST", `/v2/invoicing/invoices/${encodeURIComponent(id)}/send`, body, requestId);
    },
    async getInvoice(id) {
      const { json } = await request("GET", `/v2/invoicing/invoices/${encodeURIComponent(id)}`);
      return json as PayPalInvoice;
    },
    async searchByNumber(invoiceNumber) {
      const { json } = await request("POST", "/v2/invoicing/search-invoices", {
        invoice_number: invoiceNumber,
        page: 1,
        page_size: 20,
        total_required: true,
      });
      const items = (json as { items?: PayPalInvoice[] }).items ?? [];
      return items;
    },
    async deleteDraft(id) {
      await request("DELETE", `/v2/invoicing/invoices/${encodeURIComponent(id)}`);
    },
    async remind(id, body, requestId) {
      await request(
        "POST",
        `/v2/invoicing/invoices/${encodeURIComponent(id)}/remind`,
        { subject: body.subject, note: body.note, send_to_invoicer: false },
        requestId,
      );
    },
  };
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

function paypalMessage(category: ProviderErrorCategory): string {
  if (category === "permission") return "PayPal refused this merchant credential.";
  if (category === "bad_input") return "PayPal rejected the invoice. Check the recipient and the amounts, then try again.";
  if (category === "uncertain") return "PayPal did not confirm the result. Reconcile this invoice before retrying.";
  return "PayPal is temporarily unavailable. Your approved bill is still saved.";
}
