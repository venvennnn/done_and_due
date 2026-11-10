import { ServiceError } from "@/lib/domain/ids";
import { ENV_NAMES } from "@/lib/config";

export function assertSameOrigin(req: Request, env: NodeJS.ProcessEnv = process.env): void {
  const origin = req.headers.get("origin");
  const fetchSite = req.headers.get("sec-fetch-site");
  if (!origin) {
    if (fetchSite === "same-origin" || fetchSite === "none") return;
    throw new ServiceError("origin", 403, "This action has to be sent from the Done & Due app.");
  }
  let originUrl: URL;
  try {
    originUrl = new URL(origin);
  } catch {
    throw new ServiceError("origin", 403, "The request origin is not valid.");
  }
  const configured = env[ENV_NAMES.appUrl]?.trim();
  if (configured) {
    const expected = new URL(configured);
    if (originUrl.origin !== expected.origin) {
      throw new ServiceError("origin", 403, "This action has to be sent from the Done & Due app.");
    }
    return;
  }
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (!host || originUrl.host !== host) {
    throw new ServiceError("origin", 403, "This action has to be sent from the Done & Due app.");
  }
}
