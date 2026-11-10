export const ENV_NAMES = {
  appUrl: "NEXT_PUBLIC_APP_URL",
  appEnv: "APP_ENV",
  supabaseUrl: "NEXT_PUBLIC_SUPABASE_URL",
  supabaseAnonKey: "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  supabaseServiceRoleKey: "SUPABASE_SERVICE_ROLE_KEY",
  geminiApiKey: "GEMINI_API_KEY",
  geminiTranscriptionModel: "GEMINI_TRANSCRIPTION_MODEL",
  geminiVisionModel: "GEMINI_VISION_MODEL",
  paypalEnv: "PAYPAL_ENV",
  paypalClientId: "PAYPAL_CLIENT_ID",
  paypalClientSecret: "PAYPAL_CLIENT_SECRET",
  paypalWebhookId: "PAYPAL_WEBHOOK_ID",
  paypalMerchantWorkspaceId: "PAYPAL_MERCHANT_WORKSPACE_ID",
  contractorEmailAllowlist: "CONTRACTOR_EMAIL_ALLOWLIST",
} as const;

export const DEFAULT_TRANSCRIPTION_MODEL = "gemini-3.5-flash";
export const DEFAULT_VISION_MODEL = "gemini-3.8-flash";
export const PAYPAL_SANDBOX_API = "https://api-m.sandbox.paypal.com";

export type IntegrationStatus = {
  appUrl: string | null;
  appEnv: string | null;
  supabase: { configured: boolean; missing: string[] };
  gemini: { configured: boolean; missing: string[]; transcriptionModel: string; visionModel: string };
  paypal: { configured: boolean; missing: string[]; environment: "sandbox" | "unsupported" | "unset"; workspaceBound: boolean };
  allowlistConfigured: boolean;
};

function present(name: string): boolean {
  return Boolean(process.env[name]?.trim());
}

export function integrationStatus(env: NodeJS.ProcessEnv = process.env): IntegrationStatus {
  const supabaseMissing = [ENV_NAMES.supabaseUrl, ENV_NAMES.supabaseAnonKey, ENV_NAMES.supabaseServiceRoleKey].filter((name) => !env[name]?.trim());
  const geminiMissing = [ENV_NAMES.geminiApiKey].filter((name) => !env[name]?.trim());
  const paypalCore = [ENV_NAMES.paypalClientId, ENV_NAMES.paypalClientSecret, ENV_NAMES.paypalWebhookId, ENV_NAMES.paypalMerchantWorkspaceId];
  const paypalMissing: string[] = paypalCore.filter((name) => !env[name]?.trim());
  const paypalValue = env[ENV_NAMES.paypalEnv]?.trim().toLowerCase();
  const environment = !paypalValue ? "unset" : paypalValue === "sandbox" ? "sandbox" : "unsupported";
  if (environment === "unsupported") paypalMissing.push(ENV_NAMES.paypalEnv);
  if (environment === "unset") paypalMissing.unshift(ENV_NAMES.paypalEnv);
  return {
    appUrl: env[ENV_NAMES.appUrl]?.trim() || null,
    appEnv: env[ENV_NAMES.appEnv]?.trim() || null,
    supabase: { configured: supabaseMissing.length === 0, missing: supabaseMissing },
    gemini: {
      configured: geminiMissing.length === 0,
      missing: geminiMissing,
      transcriptionModel: env[ENV_NAMES.geminiTranscriptionModel]?.trim() || DEFAULT_TRANSCRIPTION_MODEL,
      visionModel: env[ENV_NAMES.geminiVisionModel]?.trim() || DEFAULT_VISION_MODEL,
    },
    paypal: {
      configured: environment === "sandbox" && paypalMissing.length === 0,
      missing: [...new Set(paypalMissing)],
      environment,
      workspaceBound: present(ENV_NAMES.paypalMerchantWorkspaceId) || Boolean(env[ENV_NAMES.paypalMerchantWorkspaceId]?.trim()),
    },
    allowlistConfigured: Boolean(env[ENV_NAMES.contractorEmailAllowlist]?.trim()),
  };
}

export function assertSandbox(env: NodeJS.ProcessEnv = process.env): void {
  const value = env[ENV_NAMES.paypalEnv]?.trim().toLowerCase();
  if (value !== "sandbox") {
    throw new Error("PAYPAL_ENV must be sandbox. Live payments are not part of this release.");
  }
}

export function allowlistedEmails(env: NodeJS.ProcessEnv = process.env): string[] {
  return (env[ENV_NAMES.contractorEmailAllowlist] ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

export function isAllowlistedEmail(email: string | null | undefined, env: NodeJS.ProcessEnv = process.env): boolean {
  if (!email) return false;
  const list = allowlistedEmails(env);
  if (list.length === 0) return false;
  return list.includes(email.trim().toLowerCase());
}
