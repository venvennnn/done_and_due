"use client";

import * as Dialog from "@radix-ui/react-dialog";
import * as Popover from "@radix-ui/react-popover";
import { X } from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

export function Button({
  variant = "primary",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "white" | "ghost" | "danger" }) {
  const styles = {
    primary: "bg-[#1258F5] text-white hover:bg-[#0E4AD4]",
    white: "bg-white text-[#16244D] hover:bg-[#F3F6FF]",
    ghost: "border border-[#E1E7F0] bg-white text-[#16244D] hover:bg-[#F7F9FC]",
    danger: "bg-[#FDECEC] text-[#9B2C2C] hover:bg-[#FADDDD]",
  };
  return (
    <button
      className={cn(
        "inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-4 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50",
        styles[variant],
        className,
      )}
      {...props}
    />
  );
}

export function Pill({ tone = "draft", children }: { tone?: string; children: ReactNode }) {
  const tones: Record<string, string> = {
    draft: "bg-[#EEF2F8] text-[#3E4E73]",
    editing: "bg-[#EEF2F8] text-[#3E4E73]",
    sent: "bg-[#E7F0FF] text-[#1258F5]",
    paid: "bg-[#E5F6EC] text-[#1B7A43]",
    partially_paid: "bg-[#FFF3E0] text-[#A15C07]",
    pending: "bg-[#F3E8FF] text-[#7A3EAB]",
    unpaid: "bg-[#E7F0FF] text-[#1258F5]",
    ready_to_share: "bg-[#E7FBF6] text-[#0F766E]",
    provider_draft: "bg-[#EEF2FF] text-[#3730A3]",
    needs_reconciliation: "bg-[#FDECEC] text-[#9B2C2C]",
    approved: "bg-[#E7F0FF] text-[#1258F5]",
    unknown: "bg-[#F4F4F5] text-[#3F3F46]",
    canceled: "bg-[#F4F4F5] text-[#3F3F46]",
    refunded: "bg-[#F4F4F5] text-[#3F3F46]",
    not_prepared: "bg-[#EEF2F8] text-[#3E4E73]",
    simulated: "bg-[#EEF3FF] text-[#1258F5]",
  };
  return <span className={cn("inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold capitalize", tones[tone] ?? tones.draft)}>{children}</span>;
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <section className={cn("rounded-[26px] border border-[#E7EDF5] bg-white p-4 shadow-[0_10px_30px_rgba(22,36,77,0.04)] sm:p-5", className)}>{children}</section>;
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block text-sm font-semibold text-[#16244D]">
      {label}
      <div className="mt-1.5 font-normal">{children}</div>
    </label>
  );
}

export const inputClass =
  "h-11 w-full rounded-2xl border border-[#E1E7F0] bg-white px-3 text-sm text-[#16244D] outline-none placeholder:text-[#8B98B3]";

export function Modal({
  open,
  onOpenChange,
  title,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: ReactNode;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-[#16244D]/30" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[85vh] w-[min(560px,calc(100%-24px))] -translate-x-1/2 -translate-y-1/2 overflow-auto rounded-[24px] bg-white p-5 shadow-xl">
          <div className="flex items-start justify-between gap-3">
            <Dialog.Title className="text-lg font-extrabold text-[#16244D]">{title}</Dialog.Title>
            <Dialog.Close className="grid h-11 w-11 place-items-center rounded-full text-[#5C6B8A]" aria-label="Close">
              <X className="h-5 w-5" />
            </Dialog.Close>
          </div>
          <div className="mt-3 text-sm leading-6 text-[#5C6B8A]">{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function MenuPopover({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button className="inline-flex min-h-11 items-center gap-2 rounded-full border border-[#E1E7F0] bg-white px-3 text-sm font-semibold text-[#16244D]">{label}</button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content className="z-30 w-64 rounded-2xl border border-[#E7EDF5] bg-white p-2 shadow-lg" align="start">
          {children}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
