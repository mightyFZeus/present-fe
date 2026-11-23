"use client";
import { useEffect, useMemo, useRef, type ReactNode } from "react";
import { useAppSelector, useAppStore } from "@/store/hooks";
import { PresenterVoiceOverride } from "@/features/presenter-voice/PresenterVoiceOverride";
import type { PresentationSlide } from "@/features/presentations/presentationTypes";
import type { WorkspaceController } from "./WorkspaceController";
import { PresentationController } from "./PresentationController";
import { PresentationControls } from "./PresentationControls";
import { FollowingControls } from "./FollowingControls";
import { RecentSpeech } from "./RecentSpeech";
import { selectPresentation } from "./presentationSlice";
import "./presentation.css";

export function PresentationFocus({ children, presentationId, slides, ready, workspace }: {
  children: ReactNode;
  presentationId: string;
  slides: PresentationSlide[];
  ready: boolean;
  workspace: WorkspaceController;
}) {
  const store = useAppStore();
  const view = useAppSelector(selectPresentation);
  const controller = useMemo(() => new PresentationController(store, workspace), [store, workspace]);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!root.current) return;
    controller.attach(root.current);
    return () => controller.detach();
  }, [controller]);
  return <div className={`studio presentation-host ${view.active ? "presentation-active" : ""}`} id="presentation-stage" tabIndex={-1} ref={root}>
    <PresenterVoiceOverride key={presentationId} presentationId={presentationId} capture={workspace.capture}>
      {(voice) => <>
        {children}
        <FollowingControls slides={slides} ready={ready} controller={workspace} voice={voice} />
        <RecentSpeech />
        {view.active && <PresentationControls
          slides={slides}
          ready={ready}
          workspace={workspace}
          controller={controller}
          voice={voice}
        />}
      </>}
    </PresenterVoiceOverride>
  </div>;
}
