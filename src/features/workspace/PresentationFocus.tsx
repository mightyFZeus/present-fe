"use client";
import { useEffect, useMemo, useRef, type ReactNode } from "react";
import { useAppSelector, useAppStore } from "@/store/hooks";
import type { PresentationSlide } from "@/features/presentations/presentationTypes";
import type { WorkspaceController } from "./WorkspaceController";
import { PresentationController } from "./PresentationController";
import { PresentationControls } from "./PresentationControls";
import { selectPresentation } from "./presentationSlice";
import "./presentation.css";

export function PresentationFocus({ children, slides, ready, workspace }: {
  children: ReactNode;
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
    {children}
    {view.active && <PresentationControls slides={slides} ready={ready} workspace={workspace} controller={controller} />}
  </div>;
}
