import Link from "next/link";
import { Wordmark } from "@/components/brand";

export default function HomePage() {
  return (
    <main className="min-h-screen bg-[#E2E7EF] px-3 py-4 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-[1100px] rounded-[28px] bg-[#F5F7FA] p-4 sm:p-8">
        <Wordmark />
        <h1 className="mt-8 max-w-3xl text-4xl font-extrabold tracking-tight text-[#1258F5] sm:text-5xl">From the job to a bill you can stand behind.</h1>
        <p className="mt-4 max-w-2xl text-base leading-7 text-[#5C6B8A]">
          Done & Due turns a photo and a voice note into an editable invoice with the evidence still attached. Both paths below run from this same deployment.
        </p>
        <div className="mt-8 grid gap-4 md:grid-cols-2">
          <Link href="/demo" className="flex min-h-64 flex-col justify-between rounded-[26px] bg-white p-6 shadow-[0_10px_30px_rgba(22,36,77,0.05)]">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-[#1258F5]">Anyone · no sign-in</p>
              <h2 className="mt-3 text-2xl font-extrabold text-[#16244D]">Try the demo</h2>
              <p className="mt-2 text-sm leading-6 text-[#5C6B8A]">After you approve, Done & Due simulates delivery and payment inside this browser. No email is sent, no card details are collected, and provider credentials are not required.</p>
            </div>
            <span className="mt-6 inline-flex min-h-11 items-center justify-center rounded-full bg-[#1258F5] px-4 text-sm font-semibold text-white">Open the practice workspace</span>
          </Link>
          <Link href="/app" className="flex min-h-64 flex-col justify-between rounded-[26px] bg-gradient-to-br from-[#1258F5] to-[#5287F6] p-6 text-white shadow-[0_16px_40px_rgba(18,88,245,0.25)]">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-white/80">Authorized contractor</p>
              <h2 className="mt-3 text-2xl font-extrabold">Open PayPal workspace</h2>
              <p className="mt-2 text-sm leading-6 text-white/85">After you approve, Done & Due creates a PayPal Sandbox invoice with test money. The buyer pays on PayPal&apos;s hosted page. This path never simulates a payment.</p>
            </div>
            <span className="mt-6 inline-flex min-h-11 items-center justify-center rounded-full bg-white px-4 text-sm font-semibold text-[#1258F5]">Continue to Sandbox</span>
          </Link>
        </div>
        <p className="mt-6 text-sm text-[#5C6B8A]">This release supports the demo and PayPal Sandbox only. Live payments are a separate future release.</p>
      </div>
    </main>
  );
}
