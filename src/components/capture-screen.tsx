"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Camera, Mic, Square, Upload } from "lucide-react";
import { blobToWav, pickRecorderMime } from "@/lib/demo/media";
import { Button, Card, Field, inputClass } from "./ui";
import { Stepper } from "./shell";
import { useWorkspace } from "./workspace-context";

export function CaptureScreen({ jobId }: { jobId: string }) {
  const workspace = useWorkspace();
  const router = useRouter();
  const base = workspace.mode === "demo" ? "/demo" : "/app";
  const job = workspace.snapshot?.jobs.find((item) => item.id === jobId);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [audioNote, setAudioNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [replace, setReplace] = useState(false);
  const recorder = useRef<MediaRecorder | null>(null);
  const timer = useRef<number | null>(null);
  const chunks = useRef<Blob[]>([]);
  const elapsedRef = useRef(0);
  if (!workspace.snapshot) return <p>Loading your workspace…</p>;
  if (!job) return <p>That job is not in this workspace.</p>;
  const customer = workspace.snapshot.customers.find((item) => item.id === job.customerId);

  async function startRecording() {
    setAudioNote(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = pickRecorderMime();
      const media = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunks.current = [];
      media.ondataavailable = (event) => { if (event.data.size) chunks.current.push(event.data); };
      media.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        const raw = new Blob(chunks.current, { type: media.mimeType || "audio/webm" });
        let stored = raw;
        try {
          stored = await blobToWav(raw);
          setAudioNote(workspace.mode === "demo" ? "Local playback only. This recording stays in your browser. Type or correct the note yourself — the demo does not transcribe it." : "Recording saved. Transcribe it, or type the note if transcription is unavailable.");
        } catch {
          setAudioNote("This recording format can't be prepared for transcription. Type the note instead. Playback may still work.");
        }
        if (stored.size > 8 * 1024 * 1024) {
          setAudioNote("That recording is over 8 MB. Record a shorter note or type it.");
          return;
        }
        await workspace.actions.attachAudio(jobId, stored, elapsedRef.current * 1000);
      };
      media.start();
      recorder.current = media;
      elapsedRef.current = 0;
      setElapsed(0);
      setRecording(true);
      const started = Date.now();
      timer.current = window.setInterval(() => {
        const seconds = Math.min(60, Math.round((Date.now() - started) / 1000));
        elapsedRef.current = seconds;
        setElapsed(seconds);
        if (seconds >= 60) stopRecording();
      }, 250);
    } catch {
      setAudioNote("Microphone permission was denied or this device has no microphone. Type the note instead.");
    }
  }

  function stopRecording() {
    if (timer.current) window.clearInterval(timer.current);
    recorder.current?.stop();
    setRecording(false);
  }

  async function onPhoto(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    try {
      await workspace.actions.attachPhoto(jobId, file);
    } catch (error) {
      setAudioNote(error instanceof Error ? error.message : "The photo could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  async function create() {
    setBusy(true);
    try {
      const invoiceId = await workspace.actions.createDraft(jobId, replace);
      setReplace(false);
      router.push(`${base}/jobs/${jobId}/review?invoice=${invoiceId}`);
    } catch (error) {
      const code = error && typeof error === "object" && "code" in error ? String((error as { code: string }).code) : "";
      if (code === "preserve_edits") setReplace(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-[#5C6B8A]">{customer?.name ?? "No customer yet"}</p>
            <h1 className="text-3xl font-extrabold tracking-tight text-[#1258F5]">Capture the job</h1>
          </div>
          <Stepper current="capture" />
        </div>
        <Card>
          <Field label="Job title">
            <input className={inputClass} value={job.title} onChange={(event) => workspace.actions.updateCapture(jobId, { title: event.target.value })} />
          </Field>
          <div className="mt-4">
            <CustomerPicker jobId={jobId} customerId={job.customerId} />
          </div>
        </Card>
        <Card>
          <div className="flex items-center justify-between">
            <h2 className="font-extrabold">Job photo</h2>
            <span className="text-xs font-semibold text-[#5C6B8A]">{job.photo ? "Saved" : "Add a photo"}</span>
          </div>
          {job.photo?.url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={job.photo.url} alt="Current job photo" className="mt-3 max-h-80 w-full rounded-[22px] object-contain bg-[#EEF2F7]" />
          ) : (
            <div className="mt-3 grid h-56 place-items-center rounded-[22px] bg-[#EEF2F7] text-sm text-[#5C6B8A]">Take or upload a photo of the finished work.</div>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full bg-[#1258F5] px-4 text-sm font-semibold text-white">
              <Camera className="h-4 w-4" /> Take photo
              <input className="sr-only" type="file" accept="image/*" capture="environment" onChange={(event) => onPhoto(event.target.files?.[0])} />
            </label>
            <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border border-[#E1E7F0] bg-white px-4 text-sm font-semibold">
              <Upload className="h-4 w-4" /> Upload photo
              <input className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => onPhoto(event.target.files?.[0])} />
            </label>
            <Button variant="ghost" onClick={() => workspace.actions.useSamplePhoto(jobId)}>Use sample kitchen photo</Button>
          </div>
          {busy ? <p className="mt-2 text-sm text-[#5C6B8A]">Saving photo…</p> : null}
        </Card>
        <Card>
          <h2 className="font-extrabold">Note</h2>
          <textarea className={`${inputClass} mt-3 min-h-32 py-3`} value={job.transcript?.text ?? ""} onChange={(event) => workspace.actions.updateCapture(jobId, { transcriptText: event.target.value })} placeholder="What did you replace, how long did it take, and what did the customer supply?" />
          <p className="mt-2 text-xs text-[#8B98B3]">{job.transcript?.source === "sample" ? "Sample note" : job.transcript?.source === "gemini" ? "Transcribed — edit anything that is wrong" : "Typed note"} · saved as revision {job.transcript?.revisionId.slice(0, 8)}</p>
        </Card>
      </div>
      <div className="space-y-4">
        <section className="rounded-[26px] bg-gradient-to-br from-[#1258F5] to-[#5287F6] p-5 text-white">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-extrabold">Voice note</h2>
            <span className="font-mono text-sm">{recording ? formatClock(elapsed) : job.audio ? formatClock(Math.round(job.audio.durationMs / 1000)) : "0:00"}</span>
          </div>
          <p className="mt-2 text-sm text-white/85">{workspace.mode === "demo" ? "Local playback only. Typing always works if the microphone doesn't." : "Record up to 60 seconds. You can transcribe it on the next step."}</p>
          <div className="mt-4 flex gap-2">
            {recording ? (
              <button className="inline-flex min-h-11 items-center gap-2 rounded-full bg-white px-4 text-sm font-semibold text-[#1258F5]" onClick={stopRecording}><Square className="h-4 w-4" /> Stop</button>
            ) : (
              <button className="inline-flex min-h-11 items-center gap-2 rounded-full bg-white px-4 text-sm font-semibold text-[#1258F5]" onClick={startRecording}><Mic className="h-4 w-4" /> Record</button>
            )}
            {job.audio?.url ? <audio controls src={job.audio.url} className="h-11 max-w-full" /> : null}
          </div>
        </section>
        {audioNote ? <p className="rounded-2xl bg-white p-3 text-sm text-[#5C6B8A]">{audioNote}</p> : null}
        <Card>
          <h2 className="font-extrabold">Create draft invoice</h2>
          <p className="mt-2 text-sm text-[#5C6B8A]">The photo, note, and customer are saved before any suggestion runs. You can still edit every line.</p>
          <Button className="mt-4 w-full" disabled={busy || !(job.transcript?.text.trim())} onClick={create}>Create draft invoice</Button>
          {workspace.mode === "paypal_sandbox" ? (
            <div className="mt-2 flex flex-col gap-2">
              <Button variant="ghost" disabled={!job.audio} onClick={() => workspace.actions.transcribe(jobId)}>Transcribe recording</Button>
              <Button variant="ghost" disabled={!job.transcript?.text.trim()} onClick={() => workspace.actions.extract(jobId)}>Suggest lines with Gemini</Button>
            </div>
          ) : null}
          {replace ? (
            <Button
              className="mt-2 w-full"
              variant="danger"
              onClick={async () => {
                setBusy(true);
                try {
                  const invoiceId = await workspace.actions.createDraft(jobId, true);
                  router.push(`${base}/jobs/${jobId}/review?invoice=${invoiceId}`);
                } finally {
                  setBusy(false);
                }
              }}
            >
              Replace my edited lines
            </Button>
          ) : null}
          <div className="mt-3 flex flex-col gap-2">
            <Button variant="ghost" onClick={async () => { const id = await workspace.actions.loadSample(); router.push(`${base}/jobs/${id}`); }}>Load sample job</Button>
            <Button variant="ghost" onClick={async () => { const id = await workspace.actions.loadDuration(); router.push(`${base}/jobs/${id}/review`); }}>Load missing-duration example</Button>
          </div>
        </Card>
      </div>
    </div>
  );
}

function formatClock(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function CustomerPicker({ jobId, customerId }: { jobId: string; customerId: string | null }) {
  const workspace = useWorkspace();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [query, setQuery] = useState("");
  const customers = workspace.snapshot?.customers.filter((customer) => customer.name.toLowerCase().includes(query.toLowerCase()) || customer.email.toLowerCase().includes(query.toLowerCase())) ?? [];
  return (
    <div>
      <Field label="Customer">
        <input className={inputClass} value={query} placeholder="Search customers" onChange={(event) => setQuery(event.target.value)} />
      </Field>
      <div className="mt-2 max-h-40 overflow-auto rounded-2xl border border-[#E1E7F0]">
        {customers.map((customer) => (
          <button key={customer.id} className={`block w-full px-3 py-2 text-left text-sm ${customer.id === customerId ? "bg-[#EEF3FF] font-semibold" : "hover:bg-[#F7F9FC]"}`} onClick={() => workspace.actions.updateCapture(jobId, { customerId: customer.id })}>
            {customer.name} · {customer.email || "No email"}
          </button>
        ))}
        {customers.length === 0 ? <p className="px-3 py-3 text-sm text-[#5C6B8A]">No matching customers.</p> : null}
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
        <input className={inputClass} placeholder="New customer name" value={name} onChange={(event) => setName(event.target.value)} />
        <input className={inputClass} placeholder="Email" value={email} onChange={(event) => setEmail(event.target.value)} />
        <Button variant="ghost" onClick={async () => {
          const id = await workspace.actions.addCustomer({ name, email });
          await workspace.actions.updateCapture(jobId, { customerId: id });
          setName("");
          setEmail("");
        }}>Add</Button>
      </div>
      {workspace.mode === "paypal_sandbox" ? <p className="mt-2 text-xs text-[#8B98B3]">Use an authorized PayPal Sandbox buyer email. The demo address is never copied into this workspace.</p> : null}
    </div>
  );
}

export function NewJobScreen() {
  const workspace = useWorkspace();
  const router = useRouter();
  const base = workspace.mode === "demo" ? "/demo" : "/app";
  useEffect(() => {
    let cancel = false;
    workspace.actions.newJob().then((id) => {
      if (!cancel) router.replace(`${base}/jobs/${id}`);
    });
    return () => {
      cancel = true;
    };
    // Create once when the new-job route opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <p className="text-sm text-[#5C6B8A]">Starting a new job…</p>;
}
