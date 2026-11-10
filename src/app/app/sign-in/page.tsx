"use client";

import { createBrowserClient } from "@supabase/ssr";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Wordmark } from "@/components/brand";
import { Button, Field, inputClass } from "@/components/ui";

export default function SignInPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const configured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setMessage(null);
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) {
      setMessage("Supabase is not configured for this deployment.");
      setPending(false);
      return;
    }
    const client = createBrowserClient(url, key);
    const result = await client.auth.signInWithPassword({ email: email.trim(), password });
    setPending(false);
    if (result.error) {
      setMessage("That email and password were not accepted. Public signup is closed; the operator creates the contractor user.");
      return;
    }
    router.push("/app");
    router.refresh();
  }

  return (
    <main className="min-h-screen bg-[#E2E7EF] px-3 py-8">
      <form onSubmit={submit} className="mx-auto max-w-md rounded-[28px] bg-[#F5F7FA] p-6">
        <Wordmark />
        <p className="mt-6 inline-flex rounded-full bg-[#EEF3FF] px-3 py-1 text-xs font-bold text-[#1258F5]">PayPal Sandbox</p>
        <h1 className="mt-4 text-3xl font-extrabold text-[#1258F5]">Sign in</h1>
        <p className="mt-2 text-sm leading-6 text-[#5C6B8A]">Only an allowlisted contractor can create invoices for the configured merchant. This is not the public demo.</p>
        {configured ? null : <p className="mt-3 text-sm font-semibold text-[#9A3412]">NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are missing.</p>}
        <div className="mt-4 space-y-3">
          <Field label="Email">
            <input className={inputClass} value={email} onChange={(event) => setEmail(event.target.value)} type="email" autoComplete="email" required />
          </Field>
          <Field label="Password">
            <input className={inputClass} value={password} onChange={(event) => setPassword(event.target.value)} type="password" autoComplete="current-password" required />
          </Field>
        </div>
        {message ? <p className="mt-3 text-sm font-semibold text-[#9A3412]" role="alert">{message}</p> : null}
        <Button className="mt-4 w-full" type="submit" disabled={pending}>{pending ? "Signing in" : "Open workspace"}</Button>
      </form>
    </main>
  );
}
