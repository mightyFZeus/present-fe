"use client";
import { ArrowLeft, ChevronLeft, ChevronRight, CornerUpLeft, Maximize, Mic, Minimize, Pause, Square } from "lucide-react";
import { useAppSelector } from "@/store/hooks";
import type { PresentationSlide } from "@/features/presentations/presentationTypes";
import type { WorkspaceController } from "./WorkspaceController";
import type { PresentationController } from "./PresentationController";
import { selectPresentation } from "./presentationSlice";

export function PresentationControls({ slides, ready, workspace, controller }: {
  slides: PresentationSlide[];
  ready: boolean;
  workspace: WorkspaceController;
  controller: PresentationController;
}) {
  const view = useAppSelector(selectPresentation);
  const state = useAppSelector((value) => value.workspace);
  const live = useAppSelector((value) => value.live);
  const authenticated = useAppSelector((value) => !!value.auth.accessToken);
  const index = slides.findIndex((slide) => slide.id === state.snapshot?.displayedSlideId);
  const following = state.mic.status === "listening" && !state.snapshot?.held;
  const busy = state.mic.status === "permission" || state.mic.status === "connecting";
  const paused = state.mic.status === "held" || state.mic.status === "error" ||
    state.mic.status === "listening" && !!state.snapshot?.held;
  const status = busy ? "Starting" : state.mic.status === "error" ? "Following paused" :
    state.mic.status === "off" ? "Microphone off" : following ?
      live.status === "ready" && live.acceptsAudio ? "Following" : "Changing slide" : "On hold";
  const error = state.mic.error || view.fullscreenError || live.error;
  return <div className={`presentation-toolbar ${view.controlsVisible ? "" : "is-hidden"}`} data-presentation-controls inert={!view.controlsVisible} aria-hidden={!view.controlsVisible}>
    <div className="presentation-control-row" role="toolbar" aria-label="Presentation controls">
      <button className="presentation-workspace-button" onClick={() => void controller.exit()}><ArrowLeft size={16} aria-hidden="true" /> Presenter controls</button>
      <div className="presentation-navigation">
        <button aria-label="Previous slide" disabled={index <= 0} onClick={() => workspace.navigate(slides[index - 1].id)}><ChevronLeft size={20} aria-hidden="true" /></button>
        <span className="presentation-count" aria-label={index >= 0 ? `Slide ${index + 1} of ${slides.length}` : "No slide selected"}>{index >= 0 ? `${index + 1} / ${slides.length}` : "- / -"}</span>
        <button aria-label="Next slide" disabled={index < 0 || index >= slides.length - 1} onClick={() => workspace.navigate(slides[index + 1].id)}><ChevronRight size={20} aria-hidden="true" /></button>
        {state.snapshot?.returnPointId && <button aria-label="Return to main slide" onClick={() => workspace.navigate(state.snapshot!.returnPointId!)}><CornerUpLeft size={17} aria-hidden="true" /></button>}
      </div>
      <span className="presentation-status" role="status"><span className={`status-dot ${following && live.acceptsAudio ? "active" : ""}`} aria-hidden="true" />{status}</span>
      {following ? <button onClick={() => workspace.capture.hold()}><Pause size={17} aria-hidden="true" /><span>Hold</span></button> :
        <button disabled={!authenticated || !ready || !state.snapshot || busy} onClick={() => void workspace.capture.start()}><Mic size={17} aria-hidden="true" /><span>{busy ? "Starting" : paused ? "Resume" : "Follow"}</span></button>}
      <button aria-label={busy ? "Cancel microphone startup" : "Stop following"} disabled={!busy && state.mic.status !== "listening" && state.mic.status !== "held" && state.mic.status !== "error"} onClick={() => workspace.capture.stop()}><Square size={16} aria-hidden="true" /></button>
      <button aria-label={view.fullscreen ? "Exit full screen" : "Enter full screen"} onClick={() => void controller.toggleFullscreen()}>{view.fullscreen ? <Minimize size={18} aria-hidden="true" /> : <Maximize size={18} aria-hidden="true" />}</button>
    </div>
    {error && <p className="presentation-error" role="alert">{error}</p>}
  </div>;
}
