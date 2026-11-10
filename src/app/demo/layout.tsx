"use client";

import type { ReactNode } from "react";
import { DemoProvider } from "@/components/demo-provider";
import { WorkspaceShell } from "@/components/shell";

export default function DemoLayout({ children }: { children: ReactNode }) {
  return (
    <DemoProvider>
      <WorkspaceShell>{children}</WorkspaceShell>
    </DemoProvider>
  );
}
