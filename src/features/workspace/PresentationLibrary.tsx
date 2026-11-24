"use client";

import { useEffect, useMemo } from "react";
import { useAppStore } from "@/store/hooks";
import { WorkspaceController } from "./WorkspaceController";
import { WorkspaceHeader } from "./WorkspaceHeader";
import { SavedPresentations } from "./SavedPresentations";
import "./workspace.css";

export function PresentationLibrary() {
  const store = useAppStore();
  const controller = useMemo(() => new WorkspaceController(store), [store]);
  useEffect(() => {
    controller.attach();
    controller.clearSelection();
    return () => controller.detach(true);
  }, [controller]);
  return <div className="present-library">
    <a className="skip-link" href="#saved-presentations-title">Skip to presentations</a>
    <WorkspaceHeader />
    <main className="library-main">
      <SavedPresentations controller={controller} />
    </main>
  </div>;
}
