export function createId(prefix: string): string {
  const uuid = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}_${uuid}`;
}

export function isDemoId(id: string | null | undefined): boolean {
  if (!id) return false;
  return id.startsWith("demo_") || id.includes("/demo/");
}

export class ServiceError extends Error {
  readonly code: string;
  readonly status: number;
  readonly category?: "bad_input" | "permission" | "transient" | "uncertain" | "operator";

  constructor(
    code: string,
    status: number,
    message: string,
    category?: "bad_input" | "permission" | "transient" | "uncertain" | "operator",
  ) {
    super(message);
    this.name = "ServiceError";
    this.code = code;
    this.status = status;
    this.category = category;
  }
}

export function assertNotDemoId(id: string): void {
  if (isDemoId(id)) {
    throw new ServiceError(
      "demo_rejected",
      404,
      "Demo records stay in the practice workspace and cannot be used with PayPal, Gemini, or Supabase.",
    );
  }
}
