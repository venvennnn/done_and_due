import "server-only";
import { GoogleGenAI } from "@google/genai";
import { ServiceError } from "@/lib/domain/ids";
import { parseExtraction } from "@/lib/domain/extraction";
import type { Extraction } from "@/lib/domain/types";
import { EXTRACTION_PROMPT, TRANSCRIPTION_PROMPT } from "./prompts";
import { extractionJsonSchema } from "./schema";

const AUDIO_MIME = new Set(["audio/wav", "audio/mp3", "audio/mpeg", "audio/aiff", "audio/aac", "audio/ogg", "audio/flac", "audio/webm"]);

export async function transcribeWithGemini(input: { apiKey: string; model: string; bytes: Buffer; mimeType: string }): Promise<string> {
  if (!AUDIO_MIME.has(input.mimeType)) {
    throw new ServiceError("unsupported_audio", 415, "This audio format is not supported for transcription. Type the note instead.");
  }
  const ai = new GoogleGenAI({ apiKey: input.apiKey });
  const response = await ai.models.generateContent({
    model: input.model,
    contents: [
      {
        role: "user",
        parts: [
          { inlineData: { mimeType: input.mimeType, data: input.bytes.toString("base64") } },
          { text: TRANSCRIPTION_PROMPT },
        ],
      },
    ],
  });
  const text = response.text?.trim() ?? "";
  if (!text) throw new ServiceError("empty_transcript", 502, "Gemini returned an empty transcript. Type the note instead.");
  return text;
}

export async function extractWithGemini(input: {
  apiKey: string;
  model: string;
  image: Buffer;
  imageMime: string;
  note: string;
}): Promise<Extraction> {
  const ai = new GoogleGenAI({ apiKey: input.apiKey });
  const response = await ai.models.generateContent({
    model: input.model,
    contents: [
      {
        role: "user",
        parts: [
          { inlineData: { mimeType: input.imageMime, data: input.image.toString("base64") } },
          { text: `${EXTRACTION_PROMPT}\n\nContractor note:\n${input.note}` },
        ],
      },
    ],
    config: {
      responseMimeType: "application/json",
      responseJsonSchema: extractionJsonSchema,
    },
  });
  const text = response.text ?? "";
  if (text.length > 200_000) throw new ServiceError("response_too_large", 502, "Gemini returned too much text.");
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new ServiceError("invalid_json", 502, "Gemini did not return valid JSON. You can still edit the invoice manually.");
  }
  return parseExtraction(json);
}
