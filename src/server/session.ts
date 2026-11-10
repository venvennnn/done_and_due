import "server-only";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { integrationStatus, isAllowlistedEmail } from "@/lib/config";
import { ServiceError } from "@/lib/domain/ids";

export async function supabaseServer() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  const cookieStore = await cookies();
  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(list) {
        try {
          for (const cookie of list) cookieStore.set(cookie.name, cookie.value, cookie.options);
        } catch {
          /* Server Components cannot always write cookies. Middleware refreshes the session. */
        }
      },
    },
  });
}

export function supabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new ServiceError("not_configured", 503, "Supabase is not configured.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function gateWorkspace() {
  const status = integrationStatus();
  if (!status.supabase.configured || !status.allowlistConfigured) {
    return { type: "setup" as const, status };
  }
  const supabase = await supabaseServer();
  const userResult = await supabase!.auth.getUser();
  const user = userResult.data.user;
  if (!user) return { type: "signin" as const, status };
  if (!isAllowlistedEmail(user.email)) return { type: "forbidden" as const, status, email: user.email ?? "" };
  const name = (user.user_metadata?.full_name as string | undefined) || user.email?.split("@")[0] || "Contractor";
  return { type: "ready" as const, status, userId: user.id, email: user.email ?? "", name };
}
