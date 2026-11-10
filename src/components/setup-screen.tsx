import type { IntegrationStatus } from "@/lib/config";
import { Wordmark } from "./brand";

export function SetupScreen({ status, title, body }: { status: IntegrationStatus; title: string; body: string }) {
  const groups = [
    { name: "Supabase", missing: status.supabase.missing },
    { name: "Gemini", missing: status.gemini.missing },
    { name: "PayPal Sandbox", missing: status.paypal.missing },
    { name: "Contractor allowlist", missing: status.allowlistConfigured ? [] : ["CONTRACTOR_EMAIL_ALLOWLIST"] },
  ];
  return (
    <main className="min-h-screen bg-[#E2E7EF] px-3 py-6">
      <div className="mx-auto max-w-3xl rounded-[28px] bg-[#F5F7FA] p-5 sm:p-8">
        <Wordmark />
        <p className="mt-6 inline-flex rounded-full bg-[#EEF3FF] px-3 py-1 text-xs font-bold text-[#1258F5]">PayPal Sandbox</p>
        <h1 className="mt-4 text-3xl font-extrabold text-[#1258F5]">{title}</h1>
        <p className="mt-3 text-sm leading-6 text-[#5C6B8A]">{body}</p>
        <ul className="mt-6 space-y-3">
          {groups.map((group) => (
            <li key={group.name} className="rounded-[22px] bg-white p-4">
              <p className="font-extrabold">{group.name}</p>
              <p className="mt-1 text-sm text-[#5C6B8A]">{group.missing.length === 0 ? "Configured" : `Missing ${group.missing.join(", ")}`}</p>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-sm text-[#5C6B8A]">The public demo at /demo keeps working without these values. PayPal mode will not simulate a result when something is missing.</p>
      </div>
    </main>
  );
}
