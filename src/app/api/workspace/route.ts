import { NextResponse } from "next/server";
import { ServiceError } from "@/lib/domain/ids";
import { workspaceSnapshot } from "@/lib/paypal/service";
import { gateWorkspace, supabaseAdmin } from "@/server/session";
import { ensureWorkspace, SupabaseBillingStore } from "@/server/supabase-store";

export async function GET() {
  try {
    const gate = await gateWorkspace();
    if (gate.type !== "ready") {
      return NextResponse.json({ code: gate.type, message: "Sign in with an allowlisted contractor account." }, { status: gate.type === "forbidden" ? 403 : 401 });
    }
    const admin = supabaseAdmin();
    const workspace = await ensureWorkspace(admin, gate.userId, gate.name);
    const stored = await new SupabaseBillingStore(admin).getWorkspace(workspace.id);
    return NextResponse.json({ snapshot: workspaceSnapshot(stored ?? workspace) });
  } catch (error) {
    if (error instanceof ServiceError) return NextResponse.json({ code: error.code, message: error.message }, { status: error.status });
    return NextResponse.json({ code: "internal", message: "The workspace could not be loaded." }, { status: 500 });
  }
}
