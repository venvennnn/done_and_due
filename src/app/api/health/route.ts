import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json({ ok: true, service: "done-and-due", payments: "sandbox-only" });
}
