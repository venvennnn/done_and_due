import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeName } from "@/lib/domain/catalog";
import { ServiceError } from "@/lib/domain/ids";
import { defaultCatalog } from "@/lib/domain/sample";
import type { BillingStore, StoredWorkspace } from "@/lib/paypal/service";
import { createId } from "@/lib/domain/ids";

export function emptyWorkspace(id: string, ownerId: string, contractorName: string): StoredWorkspace {
  return {
    id,
    ownerId,
    contractorName,
    currency: "USD",
    customers: [],
    jobs: [],
    invoices: [],
    catalog: defaultCatalog().map((item) => ({ ...item, id: createId(item.id) })),
    timeline: [],
    payments: [],
    operations: [],
    webhooks: [],
    aiRuns: [],
  };
}

export class SupabaseBillingStore implements BillingStore {
  constructor(private readonly db: SupabaseClient) {}

  async getWorkspace(id: string): Promise<StoredWorkspace | null> {
    const { data, error } = await this.db.from("workspaces").select("state").eq("id", id).maybeSingle();
    if (error) throw new ServiceError("storage", 500, "The workspace could not be read.");
    return (data?.state as StoredWorkspace | undefined) ?? null;
  }

  async saveWorkspace(workspace: StoredWorkspace): Promise<void> {
    await this.project(workspace);
    const { error } = await this.db.from("workspaces").update({ state: workspace, updated_at: new Date().toISOString() }).eq("id", workspace.id);
    if (error) throw new ServiceError("storage", 500, "The workspace could not be saved.");
  }

  private async project(workspace: StoredWorkspace) {
    const id = workspace.id;
    const wipe = async (table: string) => {
      const { error } = await this.db.from(table).delete().eq("workspace_id", id);
      if (error) throw new ServiceError("storage", 500, "Saved records could not be updated.");
    };
    await wipe("invoice_lines");
    await wipe("invoice_snapshots");
    await wipe("timeline_events");
    await wipe("payments");
    await wipe("paypal_operations");
    await wipe("catalog_aliases");
    await wipe("catalog_items");
    await wipe("customers");
    await wipe("jobs");
    await wipe("invoices");

    if (workspace.customers.length) {
      const { error } = await this.db.from("customers").insert(workspace.customers.map((customer) => ({ id: customer.id, workspace_id: id, name: customer.name, email: customer.email, created_at: customer.createdAt })));
      if (error) throw new ServiceError("storage", 500, "Customers could not be saved.");
    }
    if (workspace.jobs.length) {
      const { error } = await this.db.from("jobs").insert(workspace.jobs.map((job) => ({ id: job.id, workspace_id: id, customer_id: job.customerId, title: job.title, updated_at: job.updatedAt })));
      if (error) throw new ServiceError("storage", 500, "Jobs could not be saved.");
    }
    if (workspace.catalog.length) {
      const { error } = await this.db.from("catalog_items").insert(workspace.catalog.map((item) => ({ id: item.id, workspace_id: id, name: item.name, unit: item.unit, rate_minor: item.rateMinor, active: item.active, document: item })));
      if (error) throw new ServiceError("storage", 500, "The price list could not be saved.");
      const aliases = workspace.catalog.flatMap((item) => item.aliases.map((alias) => ({ id: `${item.id}:${normalizeName(alias)}`, workspace_id: id, catalog_item_id: item.id, alias, normalized_alias: normalizeName(alias) })));
      if (aliases.length) {
        const aliasResult = await this.db.from("catalog_aliases").insert(aliases);
        if (aliasResult.error) throw new ServiceError("storage", 409, "Two price-list items share the same alias.");
      }
    }
    if (workspace.invoices.length) {
      const { error } = await this.db.from("invoices").insert(
        workspace.invoices.map((invoice) => ({
          id: invoice.id,
          workspace_id: id,
          job_id: invoice.jobId,
          number: invoice.number,
          approval_state: invoice.approval,
          delivery_state: invoice.delivery,
          settlement_state: invoice.settlement,
          currency: invoice.currency,
          total_minor: invoice.totalMinor,
          paypal_invoice_id: invoice.paypalInvoiceId,
          paypal_env: invoice.paypalInvoiceId ? "sandbox" : null,
          recipient_email: invoice.recipientEmail,
          observation_version: invoice.observationVersion,
          document: invoice,
          updated_at: invoice.updatedAt,
        })),
      );
      if (error) throw new ServiceError("storage", 409, "That invoice number or PayPal id is already in use.");
      const lines = workspace.invoices.flatMap((invoice) => invoice.lines.map((line) => ({ id: line.id, invoice_id: invoice.id, workspace_id: id, sort_order: line.sortOrder, description: line.description, quantity_decimal: line.quantity, unit: line.unit, rate_minor: line.rateMinor, excluded: line.excluded, document: line })));
      if (lines.length) {
        const lineResult = await this.db.from("invoice_lines").insert(lines);
        if (lineResult.error) throw new ServiceError("storage", 500, "Invoice lines could not be saved.");
      }
      const snapshots = workspace.invoices.flatMap((invoice) => invoice.snapshot ? [{ id: invoice.snapshot.id, invoice_id: invoice.id, workspace_id: id, revision: invoice.snapshot.revision, total_minor: invoice.snapshot.totalMinor, recipient_email: invoice.snapshot.recipientEmail, currency: invoice.snapshot.currency, document: invoice.snapshot, approved_at: invoice.snapshot.approvedAt }] : []);
      if (snapshots.length) await this.db.from("invoice_snapshots").insert(snapshots);
    }
    if (workspace.timeline.length) {
      await this.db.from("timeline_events").insert(workspace.timeline.map((event) => ({ id: event.id, workspace_id: id, invoice_id: event.invoiceId, kind: event.kind, message: event.message, actor: event.actor, simulated: event.simulated, created_at: event.at })));
    }
    if (workspace.payments.length) {
      await this.db.from("payments").insert(workspace.payments.map((payment) => ({ id: payment.id, workspace_id: id, invoice_id: payment.invoiceId, amount_minor: payment.amountMinor, simulated: payment.simulated, created_at: payment.at })));
    }
    if (workspace.operations.length) {
      const { error } = await this.db.from("paypal_operations").upsert(workspace.operations.map((operation) => ({ id: operation.id, workspace_id: id, invoice_id: operation.invoiceId, snapshot_id: operation.snapshotId, operation_type: operation.operationType, status: operation.status, idempotency_key: operation.idempotencyKey, paypal_invoice_id: operation.paypalInvoiceId, document: operation })));
      if (error) throw new ServiceError("storage", 409, "That PayPal operation was already claimed.");
    }
    if (workspace.webhooks.length) {
      await this.db.from("webhook_receipts").upsert(workspace.webhooks.map((receipt) => ({ event_id: receipt.eventId, workspace_id: id, environment: receipt.environment, process_status: receipt.processStatus, document: receipt })));
    }
    if (workspace.aiRuns.length) {
      await this.db.from("ai_runs").upsert(workspace.aiRuns.map((run) => ({ id: run.id, workspace_id: id, job_id: run.jobId, stage: run.stage, status: run.status, attempt: run.attempt, document: run })));
    }
  }
}

export async function ensureWorkspace(db: SupabaseClient, userId: string, contractorName: string): Promise<StoredWorkspace> {
  const bound = process.env.PAYPAL_MERCHANT_WORKSPACE_ID?.trim();
  if (bound) {
    const { data, error } = await db.from("workspaces").select("owner_id, state").eq("id", bound).maybeSingle();
    if (error || !data) throw new ServiceError("workspace_missing", 409, "PAYPAL_MERCHANT_WORKSPACE_ID does not match a workspace yet.");
    if (data.owner_id !== userId) throw new ServiceError("forbidden", 403, "This merchant workspace belongs to a different contractor.");
    return data.state as StoredWorkspace;
  }
  const existing = await db.from("workspaces").select("state").eq("owner_id", userId).maybeSingle();
  if (existing.data?.state) return existing.data.state as StoredWorkspace;
  const created = emptyWorkspace(crypto.randomUUID(), userId, contractorName);
  const { error } = await db.from("workspaces").insert({ id: created.id, owner_id: userId, name: contractorName, currency: "USD", adapter: "paypal_sandbox", state: created });
  if (error) throw new ServiceError("storage", 500, "The contractor workspace could not be created.");
  return created;
}
