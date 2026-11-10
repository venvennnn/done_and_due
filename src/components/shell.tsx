"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Settings } from "lucide-react";
import type { ReactNode } from "react";
import { Wordmark } from "./brand";
import { useWorkspace } from "./workspace-context";
import { cn } from "@/lib/cn";

const TABS = [
  { href: "", label: "Overview" },
  { href: "/jobs", label: "Jobs" },
  { href: "/invoices", label: "Invoices" },
  { href: "/price-list", label: "Price list" },
];

export function WorkspaceShell({ children }: { children: ReactNode }) {
  const workspace = useWorkspace();
  const pathname = usePathname();
  const base = workspace.mode === "demo" ? "/demo" : "/app";
  const badge = workspace.mode === "demo" ? "Demo · Simulated" : "PayPal Sandbox";
  return (
    <div className="min-h-screen bg-[#E2E7EF] px-3 py-3 sm:px-5 sm:py-5">
      <div className="mx-auto min-h-[calc(100vh-24px)] w-full max-w-[1440px] rounded-[28px] bg-[#F5F7FA] p-3 sm:p-5">
        <header className="rounded-[28px] bg-white px-3 py-3 shadow-[0_8px_30px_rgba(22,36,77,0.05)] sm:px-4">
          <div className="relative flex items-center justify-between gap-3">
            <Link href={base} aria-label="Done & Due overview">
              <Wordmark />
            </Link>
            <nav className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-1 md:flex" aria-label="Workspace">
              {TABS.map((tab) => {
                const href = `${base}${tab.href}`;
                const active = tab.href === "" ? pathname === base : pathname.startsWith(href);
                return (
                  <Link key={tab.label} href={href} className={cn("rounded-full px-4 py-2 text-sm font-semibold", active ? "bg-[#1258F5] text-white" : "text-[#5C6B8A] hover:bg-[#F4F7FB]")}>
                    {tab.label}
                  </Link>
                );
              })}
            </nav>
            <div className="flex items-center gap-2">
              <span className="hidden rounded-full bg-[#EEF3FF] px-2.5 py-1 text-xs font-bold text-[#1258F5] sm:inline">{badge}</span>
              <Link href={`${base}/settings`} className="grid h-11 w-11 place-items-center rounded-full border border-[#E1E7F0] text-[#16244D]" aria-label="Settings">
                <Settings className="h-4 w-4" />
              </Link>
              <span className="grid h-11 w-11 place-items-center rounded-full bg-[#E7EEF9] text-sm font-bold text-[#16244D]" aria-hidden>
                {(workspace.snapshot?.contractorName ?? "A").slice(0, 1)}
              </span>
            </div>
          </div>
          <nav className="mt-3 flex flex-wrap gap-2 md:hidden" aria-label="Workspace">
            {TABS.map((tab) => {
              const href = `${base}${tab.href}`;
              const active = tab.href === "" ? pathname === base : pathname.startsWith(href);
              return (
                <Link key={tab.label} href={href} className={cn("rounded-full px-3 py-2 text-sm font-semibold", active ? "bg-[#1258F5] text-white" : "bg-[#F4F7FB] text-[#5C6B8A]")}>
                  {tab.label}
                </Link>
              );
            })}
          </nav>
        </header>
        <div className="mt-3 sm:hidden">
          <span className="rounded-full bg-[#EEF3FF] px-2.5 py-1 text-xs font-bold text-[#1258F5]">{badge}</span>
        </div>
        {workspace.error ? (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-[#FDECEC] px-4 py-3 text-sm text-[#9B2C2C]" role="alert">
            <p>{workspace.error.message}</p>
            <button className="font-semibold underline" onClick={workspace.actions.clearError}>
              Dismiss
            </button>
          </div>
        ) : null}
        {workspace.storageNote ? <p className="mt-4 rounded-2xl bg-[#FFF7E8] px-4 py-3 text-sm text-[#8A5A00]">{workspace.storageNote}</p> : null}
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}

export function Stepper({ current }: { current: "capture" | "review" | "send" }) {
  const steps = [
    { id: "capture", label: "Capture" },
    { id: "review", label: "Review" },
    { id: "send", label: "Send" },
  ] as const;
  const index = steps.findIndex((step) => step.id === current);
  return (
    <ol className="flex flex-wrap items-center gap-2 text-sm font-semibold text-[#5C6B8A]" aria-label="Invoice steps">
      {steps.map((step, stepIndex) => (
        <li key={step.id} className="flex items-center gap-2">
          <span className={cn("grid h-7 w-7 place-items-center rounded-full", stepIndex <= index ? "bg-[#1258F5] text-white" : "bg-[#E7EDF5] text-[#5C6B8A]")}>{stepIndex + 1}</span>
          <span className={stepIndex === index ? "text-[#16244D]" : ""}>{step.label}</span>
          {stepIndex < steps.length - 1 ? <span className="mx-1 hidden h-px w-8 bg-[#D5DEEA] sm:block" /> : null}
        </li>
      ))}
    </ol>
  );
}
