"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useAppStore } from "@/store/hooks";
import type { CaptureController } from "@/features/audio/CaptureController";
import { PresenterVoiceRecorder } from "./PresenterVoiceRecorder";
import {
  saveGuestVoice,
  usePresenterVoiceStatusQuery,
  type GuestVoice,
} from "./presenterVoiceApi";

export interface PresenterVoiceControls {
  guest: boolean;
  change: () => void;
  start: () => void;
}
export function PresenterVoiceOverride({ children, presentationId, capture }: {
  children: (voice: PresenterVoiceControls | null) => ReactNode;
  presentationId: string;
  capture: CaptureController;
}) {
  const { data } = usePresenterVoiceStatusQuery();
  const store = useAppStore();
  const dialog = useRef<HTMLDialogElement>(null);
  const [guest, setGuest] = useState<GuestVoice | null>(null);
  const [open, setOpen] = useState(false);
  const enabled = data?.enabled && data.enrolled;
  useEffect(() => {
    if (enabled && open && !dialog.current?.open) dialog.current?.showModal();
  }, [enabled, open]);

  const start = useCallback(() => {
    if (guest && Date.parse(guest.expiresAt) <= Date.now()) {
      setOpen(true);
      return;
    }
    void capture.start(guest?.presenterVoiceId);
  }, [capture, guest]);

  function close() {
    dialog.current?.close();
    setOpen(false);
  }

  return <>
    {children(enabled ? { guest: guest !== null, change: () => setOpen(true), start } : null)}
    {enabled && <dialog
      ref={dialog}
      className="presenter-voice-dialog"
      data-presenter-voice-dialog
      aria-labelledby="guest-voice-title"
      onClose={() => setOpen(false)}
    >
      {open && <>
        <h2 id="guest-voice-title">Change presenter voice</h2>
        <p>Ask the person presenting to record their voice. This sample applies to this presentation only.</p>
        <PresenterVoiceRecorder
          beforeRecord={() => capture.hold(undefined, true)}
          onSave={async (sample, signal) => {
            const voice = await store.dispatch(saveGuestVoice(presentationId, sample, signal));
            if (signal.aborted) return;
            setGuest(voice);
            close();
          }}
        />
        <div className="voice-dialog-actions">
          {guest && <button type="button" className="voice-secondary" onClick={() => {
            capture.hold(undefined, true);
            setGuest(null);
            close();
          }}>Use my saved voice</button>}
          <button type="button" className="voice-secondary" onClick={close}>Cancel</button>
        </div>
      </>}
    </dialog>}
  </>;
}
