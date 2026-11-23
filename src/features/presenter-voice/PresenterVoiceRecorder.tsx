"use client";

import { useEffect, useRef, useState } from "react";
import { Mic } from "lucide-react";
import { recordPresenterVoice } from "./recordPresenterVoice";
import "./presenterVoice.css";

export function PresenterVoiceRecorder({ onSave, beforeRecord }: {
  onSave: (sample: ArrayBuffer, signal: AbortSignal) => Promise<void>;
  beforeRecord?: () => void;
}) {
  const active = useRef<AbortController>(null);
  const [state, setState] = useState<"idle" | "permission" | "recording" | "saving">("idle");
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState("");
  useEffect(() => () => active.current?.abort(), []);

  async function record() {
    if (active.current) return;
    beforeRecord?.();
    const action = new AbortController();
    active.current = action;
    const { signal } = action;
    setError("");
    setSeconds(0);
    setState("permission");
    let sample: ArrayBuffer | undefined;
    try {
      sample = await recordPresenterVoice(signal, (elapsed) => {
        if (signal.aborted) return;
        setState("recording");
        setSeconds(elapsed);
      });
      if (signal.aborted) return;
      setState("saving");
      await onSave(sample, signal);
    } catch (failure) {
      if (signal.aborted) return;
      if (failure instanceof DOMException && failure.name === "NotAllowedError") {
        setError("Allow microphone access in your browser, then try again.");
      } else {
        setError(failure instanceof Error ? failure.message : "Could not save the sample. Try again.");
      }
    } finally {
      if (sample) new Uint8Array(sample).fill(0);
      if (active.current === action) active.current = null;
      if (!signal.aborted) setState("idle");
    }
  }

  const status = state === "permission" ? "Waiting for microphone access…" :
    state === "recording" ? `Recording ${seconds} of 10 seconds` :
    state === "saving" ? "Saving voice sample…" : "";
  return <div className="voice-recorder">
    <p>Read this out loud. Keep speaking until the recording ends.</p>
    <p className="voice-reading-sample">
      Welcome to my presentation. Today I will explain what we learned, why it matters,
      and what we can do next. Let us start with the first slide.
    </p>
    {state === "recording" && <progress value={seconds} max={10} aria-label="Recording progress" />}
    <button className="voice-primary" type="button" onClick={() => void record()} disabled={state !== "idle"}>
      <Mic size={18} aria-hidden="true" /> Record 10 seconds
    </button>
    {status && <p role="status" className="voice-status">{status}</p>}
    {error && <p role="alert" className="voice-error">{error}</p>}
  </div>;
}
