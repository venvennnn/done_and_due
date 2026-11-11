export type WorkspaceMode = "demo" | "paypal_sandbox";

export type ApprovalState = "editing" | "approved";

export type DeliveryState =
  | "not_prepared"
  | "provider_draft"
  | "sent"
  | "ready_to_share"
  | "needs_reconciliation";

export type SettlementState =
  | "unpaid"
  | "pending"
  | "partially_paid"
  | "paid"
  | "unknown"
  | "canceled"
  | "refunded";

export type Ownership = "contractor" | "customer" | "unknown";

export type OperationStatus = "claimed" | "succeeded" | "failed_safe_to_retry" | "outcome_unknown";

export type OperationType = "create_draft" | "send_email" | "create_share_link" | "remind";

export type EvidenceSource = "gemini" | "contractor" | "sample";

export type ProvenanceSource = "photo" | "transcript" | "catalog" | "contractor" | "gemini" | "missing" | "sample";

export type ProviderErrorCategory = "bad_input" | "permission" | "transient" | "uncertain" | "operator";

/** Gemini order: [yMin, xMin, yMax, xMax], each integer 0–1000. */
export type Box2D = [number, number, number, number];

export type PhotoRegion = {
  label: string;
  box2d: Box2D;
  source: EvidenceSource;
  photoId: string;
  photoVersion: number;
};

export type TranscriptSpan = {
  revisionId: string;
  quote: string;
  start: number;
  end: number;
  occurrence: number;
  ambiguous: boolean;
};

export type CatalogCandidate = {
  catalogItemId: string;
  name: string;
  unit: string;
  rateMinor: number;
  score: number;
  reason: string;
};

export type MatchDecision = {
  status: "exact" | "fuzzy" | "abstain" | "custom" | "unresolved";
  reason: string;
  score: number | null;
  margin: number | null;
  candidates: CatalogCandidate[];
};

export type FieldProvenance = {
  identity: ProvenanceSource;
  quantity: ProvenanceSource;
  duration: ProvenanceSource;
  ownership: ProvenanceSource;
  rate: ProvenanceSource;
};

export type Correction = {
  field: string;
  fromValue: string;
  toValue: string;
  at: string;
};

export type ProposedLineValues = {
  description: string;
  quantity: string | null;
  unit: string | null;
  rateMinor: number | null;
  catalogItemId: string | null;
  ownership: Ownership;
};

export type InvoiceLine = {
  id: string;
  sortOrder: number;
  description: string;
  catalogQuery: string;
  catalogItemId: string | null;
  quantity: string | null;
  unit: string | null;
  rateMinor: number | null;
  ownership: Ownership;
  excluded: boolean;
  exclusionReason: string | null;
  transcriptQuote: string | null;
  transcriptSpan: TranscriptSpan | null;
  photoRegion: PhotoRegion | null;
  match: MatchDecision;
  provenance: FieldProvenance;
  reviewReason: string | null;
  contractorConfirmed: boolean;
  duplicateConfirmed: boolean;
  proposed: ProposedLineValues | null;
  corrections: Correction[];
};

export type Exclusion = {
  id: string;
  description: string;
  reason: string;
  transcriptQuote: string | null;
  transcriptSpan: TranscriptSpan | null;
};

export type Customer = {
  id: string;
  name: string;
  email: string;
  createdAt: string;
};

export type CatalogItem = {
  id: string;
  name: string;
  unit: string;
  rateMinor: number;
  aliases: string[];
  active: boolean;
  retiredAt: string | null;
};

export type JobPhoto = {
  id: string;
  version: number;
  width: number;
  height: number;
  mimeType: string;
  source: "sample" | "upload";
  url: string | null;
  storagePath: string | null;
};

export type JobAudio = {
  id: string;
  mimeType: string;
  durationMs: number;
  localOnly: boolean;
  url: string | null;
  storagePath: string | null;
};

export type Transcript = {
  revisionId: string;
  text: string;
  source: "typed" | "gemini" | "sample" | "contractor";
  createdAt: string;
};

export type Job = {
  id: string;
  title: string;
  customerId: string | null;
  photo: JobPhoto | null;
  audio: JobAudio | null;
  transcript: Transcript | null;
  createdAt: string;
  updatedAt: string;
  sample: boolean;
};

export type TimelineEvent = {
  id: string;
  invoiceId: string;
  kind: string;
  message: string;
  at: string;
  actor: string;
  simulated: boolean;
  approval?: ApprovalState;
  delivery?: DeliveryState;
  settlement?: SettlementState;
};

export type PaymentRecord = {
  id: string;
  invoiceId: string;
  amountMinor: number;
  at: string;
  simulated: boolean;
  note: string;
};

export type ApprovedSnapshot = {
  id: string;
  invoiceId: string;
  revision: number;
  currency: string;
  recipientName: string;
  recipientEmail: string;
  totalMinor: number;
  lines: InvoiceLine[];
  exclusions: Exclusion[];
  approvedAt: string;
  approvedBy: string;
};

export type Invoice = {
  id: string;
  jobId: string;
  number: string;
  customerId: string | null;
  recipientName: string;
  recipientEmail: string;
  currency: string;
  approval: ApprovalState;
  delivery: DeliveryState;
  settlement: SettlementState;
  deliveryMethod: "email" | "link" | null;
  revision: number;
  observationVersion: number;
  lines: InvoiceLine[];
  exclusions: Exclusion[];
  questions: string[];
  totalMinor: number;
  amountPaidMinor: number;
  amountDueMinor: number | null;
  snapshot: ApprovedSnapshot | null;
  paypalInvoiceId: string | null;
  paypalRecipientViewUrl: string | null;
  lastVerifiedAt: string | null;
  dueDate?: string | null;
  seeded: boolean;
  simulated: boolean;
  sample: boolean;
  createdAt: string;
  updatedAt: string;
};

export type BillStatus = "committed" | "cancelled" | "paid";

export type OutgoingBill = {
  id: string;
  payee: string;
  amountMinor: number;
  dueDate: string;
  originalDueDate: string;
  status: BillStatus;
  includedInOpening: boolean;
};

export type AvailabilitySource = "confirmed" | "estimated" | "unknown";

export type CashReceipt = {
  id: string;
  invoiceId: string | null;
  providerPaymentId: string | null;
  amountMinor: number;
  availableOn: string | null;
  availability: AvailabilitySource;
  label: string;
  includedInOpening: boolean;
};

export type CashLedger = {
  asOfDate: string;
  openingMinor: number;
  bills: OutgoingBill[];
  receipts: CashReceipt[];
};

export type WorkspaceSnapshot = {
  mode: WorkspaceMode;
  contractorName: string;
  currency: string;
  timezone: string;
  customers: Customer[];
  jobs: Job[];
  invoices: Invoice[];
  catalog: CatalogItem[];
  timeline: TimelineEvent[];
  payments: PaymentRecord[];
  cash: CashLedger;
};

export type ExtractionLine = {
  description: string;
  catalogQuery: string;
  quantityDecimalOrNull: string | null;
  unitOrNull: string | null;
  ownership: Ownership;
  transcriptQuoteOrNull: string | null;
  photoRegionOrNull: { label: string; box_2d: Box2D } | null;
  reviewReasonOrNull: string | null;
};

export type Extraction = {
  lines: ExtractionLine[];
  exclusions: { description: string; reason: string; transcriptQuoteOrNull: string | null }[];
  questions: string[];
};

export type OperationRecord = {
  id: string;
  workspaceId: string;
  invoiceId: string;
  snapshotId: string;
  operationType: OperationType;
  status: OperationStatus;
  idempotencyKey: string;
  paypalInvoiceId: string | null;
  errorCategory: ProviderErrorCategory | null;
  correlationId: string | null;
  claimedAt: string;
  finishedAt: string | null;
};

export type WebhookReceipt = {
  eventId: string;
  environment: "sandbox";
  invoiceId: string | null;
  processStatus: "received" | "processed" | "ignored";
  sanitized: Record<string, unknown>;
  receivedAt: string;
  processedAt: string | null;
  error: string | null;
};

export type AiRun = {
  id: string;
  jobId: string;
  stage: "transcribe" | "extract";
  status: "running" | "succeeded" | "failed" | "stale";
  inputRevision: { photoVersion: number | null; transcriptRevisionId: string | null };
  attempt: number;
  responseBytes: number;
  durationMs: number;
  stale: boolean;
  error: string | null;
  createdAt: string;
};
