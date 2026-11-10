import { NextResponse } from "next/server";
import { assertSandbox } from "@/lib/config";
import { ServiceError } from "@/lib/domain/ids";
import { createPayPalClient } from "@/lib/paypal/client";
import { processWebhook } from "@/lib/paypal/service";
import { assertPayPalCertUrl, transmissionFresh, verifyWebhookSignature } from "@/lib/paypal/verify";
import { supabaseAdmin } from "@/server/session";
import { SupabaseBillingStore } from "@/server/supabase-store";

export async function POST(request: Request) {
  const rawBody = await request.text();
  const workspaceId = process.env.PAYPAL_MERCHANT_WORKSPACE_ID?.trim();
  const webhookId = process.env.PAYPAL_WEBHOOK_ID?.trim();
  if (!workspaceId || !webhookId) {
    return NextResponse.json({ code: "not_configured", message: "PayPal webhook settings are missing." }, { status: 503 });
  }
  try {
    assertSandbox();
  } catch {
    return NextResponse.json({ code: "unsupported_environment", message: "This release accepts PayPal Sandbox webhooks only." }, { status: 400 });
  }

  const transmissionId = request.headers.get("paypal-transmission-id") ?? "";
  const transmissionTime = request.headers.get("paypal-transmission-time") ?? "";
  const signature = request.headers.get("paypal-transmission-sig") ?? "";
  const authAlgo = request.headers.get("paypal-auth-algo") ?? "";
  const certUrl = request.headers.get("paypal-cert-url") ?? "";
  let verified = false;
  if (transmissionId && transmissionTime && signature && authAlgo && transmissionFresh(transmissionTime)) {
    try {
      const certResponse = await fetch(assertPayPalCertUrl(certUrl));
      const certPem = await certResponse.text();
      verified = certResponse.ok && verifyWebhookSignature({ transmissionId, transmissionTime, webhookId, rawBody, signature, certPem, authAlgo });
    } catch {
      verified = false;
    }
  }

  let event: Record<string, unknown>;
  try {
    event = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ code: "bad_json" }, { status: 400 });
  }

  try {
    const admin = supabaseAdmin();
    const result = await processWebhook(new SupabaseBillingStore(admin), createPayPalClient(), { workspaceId, event, verified });
    return NextResponse.json({ ok: result.status === 200, duplicate: result.duplicate }, { status: result.status });
  } catch (error) {
    if (error instanceof ServiceError) return NextResponse.json({ code: error.code }, { status: error.status });
    return NextResponse.json({ code: "internal" }, { status: 500 });
  }
}
