import "server-only";
import sharp from "sharp";
import { ServiceError } from "@/lib/domain/ids";

const ACCEPTED = new Set(["image/jpeg", "image/png", "image/webp"]);

export async function normalizeJobImage(bytes: Buffer, mimeType: string): Promise<{ bytes: Buffer; width: number; height: number; mimeType: "image/jpeg" }> {
  if (!ACCEPTED.has(mimeType)) {
    throw new ServiceError(
      "unsupported_image",
      415,
      "This image format isn't supported. Export a JPEG, PNG, or WebP and upload it again.",
    );
  }
  if (bytes.byteLength > 8 * 1024 * 1024) {
    throw new ServiceError("image_too_large", 413, "Images need to be 8 MB or smaller.");
  }
  const image = sharp(bytes, { failOn: "error" }).rotate();
  const rendered = await image.jpeg({ quality: 90 }).toBuffer({ resolveWithObject: true });
  return {
    bytes: rendered.data,
    width: rendered.info.width,
    height: rendered.info.height,
    mimeType: "image/jpeg",
  };
}
