import type { ApprovalState, DeliveryState, SettlementState, WorkspaceMode } from "./types";

/**
 * Allowed transitions. Delivery is never inferred from a paid settlement event.
 * Demo may simulate not_prepared → sent because there is no provider draft.
 */
export const APPROVAL_TRANSITIONS: Record<ApprovalState, ApprovalState[]> = {
  editing: ["approved"],
  approved: ["editing"],
};

export const DELIVERY_TRANSITIONS: Record<DeliveryState, DeliveryState[]> = {
  not_prepared: ["provider_draft", "needs_reconciliation"],
  provider_draft: ["sent", "ready_to_share", "needs_reconciliation", "not_prepared"],
  sent: [],
  ready_to_share: [],
  needs_reconciliation: ["provider_draft", "sent", "ready_to_share", "not_prepared"],
};

export const DEMO_DELIVERY_TRANSITIONS: Record<DeliveryState, DeliveryState[]> = {
  ...DELIVERY_TRANSITIONS,
  not_prepared: ["provider_draft", "needs_reconciliation", "sent", "ready_to_share"],
};

export const SETTLEMENT_TRANSITIONS: Record<SettlementState, SettlementState[]> = {
  unpaid: ["pending", "partially_paid", "paid", "unknown", "canceled"],
  pending: ["unpaid", "partially_paid", "paid", "unknown", "canceled"],
  partially_paid: ["paid", "pending", "unknown", "refunded", "canceled"],
  paid: ["refunded", "unknown"],
  unknown: ["unpaid", "pending", "partially_paid", "paid", "canceled", "refunded"],
  canceled: [],
  refunded: [],
};

export function canTransitionApproval(from: ApprovalState, to: ApprovalState): boolean {
  return from === to || APPROVAL_TRANSITIONS[from].includes(to);
}

export function canTransitionDelivery(from: DeliveryState, to: DeliveryState, mode: WorkspaceMode = "paypal_sandbox"): boolean {
  if (from === to) return true;
  const table = mode === "demo" ? DEMO_DELIVERY_TRANSITIONS : DELIVERY_TRANSITIONS;
  return table[from].includes(to);
}

export function canTransitionSettlement(from: SettlementState, to: SettlementState): boolean {
  return from === to || SETTLEMENT_TRANSITIONS[from].includes(to);
}

export function assertTransition<T extends string>(allowed: boolean, label: string, from: T, to: T): void {
  if (!allowed) {
    throw new Error(`Cannot change ${label} from ${from} to ${to}.`);
  }
}
