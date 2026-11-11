import type { DemoState } from "@/lib/demo/seed";
import { createDemoState } from "@/lib/demo/seed";

const KEY = "done-and-due.demo.v4";
const DB = "done-and-due-demo";

function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains("blobs")) request.result.createObjectStore("blobs");
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function putDemoBlob(id: string, blob: Blob): Promise<void> {
  const db = await database();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction("blobs", "readwrite");
    tx.objectStore("blobs").put(blob, id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getDemoBlob(id: string): Promise<Blob | null> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("blobs", "readonly");
    const request = tx.objectStore("blobs").get(id);
    request.onsuccess = () => resolve((request.result as Blob | undefined) ?? null);
    request.onerror = () => reject(request.error);
  });
}

export async function clearDemoBlobs(): Promise<void> {
  const db = await database();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction("blobs", "readwrite");
    tx.objectStore("blobs").clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export function readDemoState(): DemoState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return createDemoState();
    const parsed = JSON.parse(raw) as DemoState;
    if (parsed.version !== 1 || parsed.snapshot?.mode !== "demo") return createDemoState();
    return parsed;
  } catch {
    return createDemoState();
  }
}

export function writeDemoState(state: DemoState): void {
  const copy = structuredClone(state);
  for (const job of copy.snapshot.jobs) {
    if (job.photo?.url?.startsWith("blob:")) job.photo = { ...job.photo, url: null };
    if (job.audio?.url?.startsWith("blob:")) job.audio = { ...job.audio, url: null };
  }
  localStorage.setItem(KEY, JSON.stringify(copy));
}

export function clearDemoState(): void {
  localStorage.removeItem(KEY);
}

export async function hydrateDemoMedia(state: DemoState): Promise<string | null> {
  try {
    for (const job of state.snapshot.jobs) {
      if (job.photo && job.photo.source === "upload" && !job.photo.url) {
        const blob = await getDemoBlob(job.photo.id);
        if (blob) job.photo.url = URL.createObjectURL(blob);
      }
      if (job.audio && !job.audio.url) {
        const blob = await getDemoBlob(job.audio.id);
        if (blob) job.audio.url = URL.createObjectURL(blob);
      }
    }
    return null;
  } catch {
    return "This browser couldn't open local photo storage. The sample job still works, and new uploads last until you leave the page.";
  }
}
