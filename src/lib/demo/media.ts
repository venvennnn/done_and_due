const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export async function fileToOrientedJpeg(file: File): Promise<{ blob: Blob; width: number; height: number }> {
  if (!IMAGE_TYPES.has(file.type)) {
    throw new Error("This image format isn't supported. Export a JPEG, PNG, or WebP and upload it again.");
  }
  if (file.size > 8 * 1024 * 1024) throw new Error("Images need to be 8 MB or smaller.");
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("This browser couldn't read that image.");
  context.drawImage(bitmap, 0, 0);
  bitmap.close();
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((value) => (value ? resolve(value) : reject(new Error("This browser couldn't read that image."))), "image/jpeg", 0.9);
  });
  return { blob, width: canvas.width, height: canvas.height };
}

export function pickRecorderMime(): string | null {
  if (typeof MediaRecorder === "undefined") return null;
  const types = ["audio/mp4", "audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"];
  return types.find((type) => MediaRecorder.isTypeSupported(type)) ?? null;
}

export async function blobToWav(blob: Blob): Promise<Blob> {
  const context = new AudioContext();
  try {
    const decoded = await context.decodeAudioData(await blob.arrayBuffer());
    const frames = decoded.length;
    const channels = decoded.numberOfChannels;
    const rate = decoded.sampleRate;
    const header = 44;
    const data = new ArrayBuffer(header + frames * 2);
    const view = new DataView(data);
    const write = (offset: number, text: string) => {
      for (let index = 0; index < text.length; index += 1) view.setUint8(offset + index, text.charCodeAt(index));
    };
    write(0, "RIFF");
    view.setUint32(4, 36 + frames * 2, true);
    write(8, "WAVE");
    write(12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, rate, true);
    view.setUint32(28, rate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    write(36, "data");
    view.setUint32(40, frames * 2, true);
    const mixed = new Float32Array(frames);
    for (let channel = 0; channel < channels; channel += 1) {
      const samples = decoded.getChannelData(channel);
      for (let index = 0; index < frames; index += 1) mixed[index] += samples[index] / channels;
    }
    let offset = 44;
    for (const sample of mixed) {
      const clamped = Math.max(-1, Math.min(1, sample));
      view.setInt16(offset, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
      offset += 2;
    }
    return new Blob([data], { type: "audio/wav" });
  } finally {
    await context.close();
  }
}
