import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { PayPalProvider } from "@/components/paypal-provider";
import { SetupScreen } from "@/components/setup-screen";
import { WorkspaceShell } from "@/components/shell";
import { gateWorkspace } from "@/server/session";

export default async function PayPalWorkspaceLayout({ children }: { children: ReactNode }) {
  const gate = await gateWorkspace();
  if (gate.type === "setup") {
    return (
      <SetupScreen
        status={gate.status}
        title="PayPal workspace needs setup"
        body="Configure Supabase and the contractor allowlist before anyone can open this workspace. PayPal and Gemini can be added afterwards. Missing credentials never switch this path into the demo."
      />
    );
  }
  if (gate.type === "signin") redirect("/app/sign-in");
  if (gate.type === "forbidden") {
    return (
      <SetupScreen
        status={gate.status}
        title="This account cannot create invoices"
        body={`${gate.email} is signed in, but it is not on CONTRACTOR_EMAIL_ALLOWLIST. Arbitrary signups cannot invoice from the deployment merchant.`}
      />
    );
  }
  return (
    <PayPalProvider integration={gate.status} contractorName={gate.name}>
      <WorkspaceShell>{children}</WorkspaceShell>
    </PayPalProvider>
  );
}
