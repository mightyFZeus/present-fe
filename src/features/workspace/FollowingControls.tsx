"use client";
import { ChevronLeft, ChevronRight, CornerUpLeft, Maximize, Mic, Pause, Square } from "lucide-react";
import { useAppSelector, useAppStore } from "@/store/hooks";
import type { PresentationSlide } from "@/features/presentations/presentationTypes";
import type { WorkspaceController } from "./WorkspaceController";
import { presentationEntered } from "./presentationSlice";
export function FollowingControls({ slides, ready, controller }: { slides: PresentationSlide[]; ready: boolean; controller: WorkspaceController }) {
  const store = useAppStore();
  const w = useAppSelector((state) => state.workspace);
  const live = useAppSelector((state) => state.live);
  const authenticated = useAppSelector((state) => !!state.auth.accessToken);
  const index = slides.findIndex((slide) => slide.id === w.snapshot?.displayedSlideId);
  const busy = w.mic.status === "permission" || w.mic.status === "connecting";
  const following = w.mic.status === "listening";
  const error = w.mic.error || (live.status === "error" ? live.error : null);
  const label = w.mic.status === "permission" ? "Waiting for microphone" : w.mic.status === "connecting" ? "Connecting live session" : following ? live.status === "ready" && live.acceptsAudio ? "Following your voice" : "Changing slide" : w.mic.status === "held" ? "Following is on hold" : w.mic.status === "error" ? "Following paused" : "Microphone is off";
  return <section className="following-panel" aria-label="Presentation controls">
    <div className="control-row">
      <div className="manual-controls"><span className="control-label">Navigate</span><button className="icon-button" aria-label="Previous slide" disabled={index <= 0} onClick={() => controller.navigate(slides[index - 1].id)}><ChevronLeft size={20} aria-hidden="true" /></button><button className="icon-button" aria-label="Next slide" disabled={index < 0 || index >= slides.length - 1} onClick={() => controller.navigate(slides[index + 1].id)}><ChevronRight size={20} aria-hidden="true" /></button>{w.snapshot?.returnPointId && <button className="button quiet return-button" onClick={() => controller.navigate(w.snapshot!.returnPointId!)}><CornerUpLeft size={15} aria-hidden="true" /> Return to main</button>}</div>
      <div className="mic-controls">
        <button className="button secondary" data-presentation-entry disabled={!ready || !w.snapshot} onClick={() => store.dispatch(presentationEntered())}><Maximize size={16} aria-hidden="true" /> Presentation view</button>
        {following ? <button className="button primary" onClick={() => controller.capture.hold()}><Pause size={17} aria-hidden="true" /> Hold</button> : <button className="button primary" disabled={!authenticated || !ready || !w.snapshot || busy} onClick={() => void controller.capture.start()}><Mic size={17} aria-hidden="true" />{busy ? "Starting…" : w.mic.status === "held" || w.mic.status === "error" ? "Resume following" : "Start following"}</button>}
        <button className="icon-button stop-control" aria-label={busy ? "Cancel microphone startup" : "Stop following"} disabled={!busy && !following && w.mic.status !== "held" && w.mic.status !== "error"} onClick={() => controller.capture.stop()}><Square size={16} aria-hidden="true" /></button>
      </div>
    </div>
    <div className="listening-status"><span className={`status-dot ${following && live.acceptsAudio ? "active" : ""}`} aria-hidden="true" /><span role="status">{label}</span><meter min="0" max="1" value={w.mic.level} aria-label="Microphone input level" /><span className="privacy-label">Audio streams only while following</span></div>
    {error && <p className="error-text" role="alert">{error}</p>}
    {following && live.error && <p className="supporting" role="status">{live.error} Following remains active while the connection is ready.</p>}
  </section>;
}
