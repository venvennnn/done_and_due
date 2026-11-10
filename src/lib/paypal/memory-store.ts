import type { BillingStore, StoredWorkspace } from "./service";

export class MemoryBillingStore implements BillingStore {
  private rows = new Map<string, StoredWorkspace>();

  seed(workspace: StoredWorkspace): void {
    this.rows.set(workspace.id, structuredClone(workspace));
  }

  async getWorkspace(id: string): Promise<StoredWorkspace | null> {
    const row = this.rows.get(id);
    return row ? structuredClone(row) : null;
  }

  async saveWorkspace(workspace: StoredWorkspace): Promise<void> {
    this.rows.set(workspace.id, structuredClone(workspace));
  }
}
