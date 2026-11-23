"use client";

import type { ReactNode } from "react";
import { useAppStore } from "@/store/hooks";
import { logout } from "@/features/auth/authThunks";
import { saveAccountVoice, usePresenterVoiceStatusQuery } from "./presenterVoiceApi";
import { PresenterVoiceRecorder } from "./PresenterVoiceRecorder";

export function PresenterVoiceGate({ children }: { children: ReactNode }) {
  const status = usePresenterVoiceStatusQuery();
  const store = useAppStore();
  if (status.data && (!status.data.enabled || status.data.enrolled)) return children;

  return <main className="auth-page">
    <section className="auth-login presenter-voice-setup" aria-labelledby="voice-setup-title">
      <h1 id="voice-setup-title">Set up your presenter voice</h1>
      {status.data?.enabled ? <>
        <p>Prezntly uses your voice sample to follow you during a presentation.</p>
        <p>Your account saves an encrypted voice profile. Prezntly discards the original recording.</p>
        <PresenterVoiceRecorder onSave={async (sample, signal) => {
          await store.dispatch(saveAccountVoice(sample, signal));
        }} />
      </> : status.isError ? <>
        <p className="voice-error" role="alert">Could not check your voice setup.</p>
        <button className="voice-primary" type="button" onClick={() => void status.refetch()}>Try again</button>
      </> : <p className="voice-status" role="status">Checking your voice setup…</p>}
      <button className="voice-secondary" type="button" onClick={() => store.dispatch(logout())}>Sign out</button>
    </section>
  </main>;
}
