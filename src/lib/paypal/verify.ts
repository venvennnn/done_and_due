import { createVerify, X509Certificate } from "node:crypto";
import { crc32 } from "./crc32";

const CERT_HOSTS = new Set(["api.paypal.com", "api.sandbox.paypal.com", "api-m.paypal.com", "api-m.sandbox.paypal.com"]);

export function assertPayPalCertUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("PayPal certificate URL is invalid.");
  }
  if (url.protocol !== "https:" || !CERT_HOSTS.has(url.hostname) || !url.pathname.startsWith("/v1/notifications/certs/")) {
    throw new Error("PayPal certificate URL is not on an allowlisted host.");
  }
  return url;
}

export function verifyWebhookSignature(input: {
  transmissionId: string;
  transmissionTime: string;
  webhookId: string;
  rawBody: string;
  signature: string;
  certPem: string;
  authAlgo: string;
}): boolean {
  if (!input.authAlgo.toUpperCase().includes("SHA256")) return false;
  const checksum = crc32(input.rawBody);
  const message = `${input.transmissionId}|${input.transmissionTime}|${input.webhookId}|${checksum}`;
  const cert = new X509Certificate(input.certPem);
  const verifier = createVerify("RSA-SHA256");
  verifier.update(message);
  verifier.end();
  return verifier.verify(cert.publicKey, Buffer.from(input.signature, "base64"));
}

export function transmissionFresh(transmissionTime: string, now = Date.now(), skewMs = 5 * 60 * 1000): boolean {
  const time = Date.parse(transmissionTime);
  if (Number.isNaN(time)) return false;
  return Math.abs(now - time) <= skewMs;
}
