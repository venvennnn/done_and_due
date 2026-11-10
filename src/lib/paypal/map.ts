import { minorToDecimal, parseMoneyToMinor } from "@/lib/domain/money";
import { ServiceError } from "@/lib/domain/ids";
import type { DeliveryState, Invoice, InvoiceLine, SettlementState } from "@/lib/domain/types";

export type PayPalMoney = { currency_code?: string; value?: string };

export type PayPalInvoice = {
  id: string;
  status: string;
  detail?: {
    currency_code?: string;
    invoice_number?: string;
    metadata?: { recipient_view_url?: string };
  };
  due_amount?: PayPalMoney;
  amount?: PayPalMoney;
  payments?: PayPalMoney[] | { paid_amount?: PayPalMoney; transactions?: { amount?: PayPalMoney }[] };
};

const PAYABLE = new Set(["SENT", "UNPAID", "PAYMENT_PENDING", "PARTIALLY_PAID", "PAID", "MARKED_AS_PAID", "PARTIALLY_REFUNDED"]);

export function mapSettlement(status: string): SettlementState {
  switch (status) {
    case "DRAFT":
    case "SENT":
    case "SCHEDULED":
    case "UNPAID":
      return "unpaid";
    case "PAYMENT_PENDING":
      return "pending";
    case "PARTIALLY_PAID":
      return "partially_paid";
    case "PAID":
    case "MARKED_AS_PAID":
      return "paid";
    case "CANCELLED":
      return "canceled";
    case "REFUNDED":
    case "MARKED_AS_REFUNDED":
    case "PARTIALLY_REFUNDED":
      return "refunded";
    default:
      return "unknown";
  }
}

/**
 * Delivery changes only from draft/sent provider states and the locally recorded method.
 * A paid or pending status never promotes delivery on its own.
 */
export function nextDelivery(local: Invoice, status: string): DeliveryState {
  if (status === "DRAFT" || status === "SCHEDULED") return "provider_draft";
  if (status === "SENT" || status === "UNPAID") {
    if (local.deliveryMethod === "link") return "ready_to_share";
    if (local.deliveryMethod === "email") return "sent";
    if (local.delivery === "sent" || local.delivery === "ready_to_share") return local.delivery;
    return "needs_reconciliation";
  }
  if (local.delivery === "not_prepared") return "needs_reconciliation";
  return local.delivery;
}

function moneyMinor(money: PayPalMoney | undefined, currency: string): number | null {
  if (!money?.value || !money.currency_code) return null;
  if (money.currency_code !== currency) return null;
  return parseMoneyToMinor(money.value);
}

function paidMinor(remote: PayPalInvoice, currency: string, totalMinor: number, dueMinor: number | null): number | null {
  if (dueMinor !== null) return Math.max(totalMinor - dueMinor, 0);
  const payments = remote.payments;
  if (Array.isArray(payments)) {
    const values = payments.map((payment) => moneyMinor(payment, currency));
    if (values.every((value) => value !== null)) return values.reduce((sum, value) => sum + (value ?? 0), 0);
  } else if (payments && "paid_amount" in payments) {
    return moneyMinor(payments.paid_amount, currency);
  }
  return null;
}

export type Observation = {
  settlement: SettlementState;
  delivery: DeliveryState;
  amountPaidMinor: number;
  amountDueMinor: number | null;
  paypalRecipientViewUrl: string | null;
  currencyMismatch: boolean;
};

export function observePayPalInvoice(local: Invoice, remote: PayPalInvoice): Observation {
  const currency = local.currency;
  const remoteCurrency = remote.detail?.currency_code;
  const currencyMismatch = Boolean(remoteCurrency && remoteCurrency !== currency);
  if (currencyMismatch) {
    return {
      settlement: "unknown",
      delivery: local.delivery === "not_prepared" ? "needs_reconciliation" : local.delivery,
      amountPaidMinor: local.amountPaidMinor,
      amountDueMinor: local.amountDueMinor,
      paypalRecipientViewUrl: local.paypalRecipientViewUrl,
      currencyMismatch: true,
    };
  }
  const due = moneyMinor(remote.due_amount, currency);
  const paid = paidMinor(remote, currency, local.totalMinor, due);
  const url = remote.detail?.metadata?.recipient_view_url ?? null;
  return {
    settlement: mapSettlement(remote.status),
    delivery: nextDelivery(local, remote.status),
    amountPaidMinor: paid ?? local.amountPaidMinor,
    amountDueMinor: due,
    paypalRecipientViewUrl: PAYABLE.has(remote.status) && url ? url : local.paypalRecipientViewUrl,
    currencyMismatch: false,
  };
}

export function buildPayPalInvoiceBody(invoice: Invoice): Record<string, unknown> {
  const snapshot = invoice.snapshot;
  if (!snapshot) throw new ServiceError("not_approved", 409, "Approve the invoice before creating a PayPal draft.");
  const included = snapshot.lines.filter((line) => !line.excluded && line.quantity && line.rateMinor !== null);
  if (included.length === 0) throw new ServiceError("empty_invoice", 400, "The approved snapshot has no billable lines.");
  const [given, ...rest] = snapshot.recipientName.trim().split(/\s+/);
  return {
    detail: {
      invoice_number: invoice.number,
      invoice_date: snapshot.approvedAt.slice(0, 10),
      currency_code: snapshot.currency,
      note: "Invoice from Done & Due.",
    },
    invoicer: { business_name: "Done & Due" },
    primary_recipients: [
      {
        billing_info: {
          email_address: snapshot.recipientEmail,
          name: { given_name: given || "Customer", surname: rest.join(" ") || "Customer" },
        },
      },
    ],
    items: included.map((line: InvoiceLine) => ({
      name: line.description.slice(0, 200),
      quantity: line.quantity,
      unit_amount: { currency_code: snapshot.currency, value: minorToDecimal(line.rateMinor ?? 0) },
      unit_of_measure: line.unit === "hr" ? "HOURS" : "QUANTITY",
    })),
    configuration: { partial_payment: { allow_partial_payment: true } },
  };
}

export function idempotencyKey(snapshotId: string, operation: string): string {
  return `dd-${snapshotId}-${operation}`.slice(0, 108);
}
