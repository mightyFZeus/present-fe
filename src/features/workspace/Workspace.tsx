"use client";
import { useEffect, useMemo } from "react";
import Link from "next/link";
import { presentationsApi, useGetPresentationQuery, useGetPresentationSlidesQuery } from "@/features/presentations/presentationsApi";
import { useAppSelector, useAppStore } from "@/store/hooks";
import { WorkspaceController } from "./WorkspaceController";
import { WorkspaceHeader } from "./WorkspaceHeader";
import { orderedSlides } from "./navigationHelpers";
import { canonicalPresentationId, isPresentationId } from "./libraryHelpers";
import { SlideList } from "./SlideList";
import { SlideStage } from "./SlideStage";
import { PresenterPreview } from "./PresenterPreview";
import { FollowingControls } from "./FollowingControls";
import { SessionTranscripts } from "@/features/transcripts/SessionTranscripts";
import { PresentationFocus } from "./PresentationFocus";
import { deckRenamed } from "./workspaceSlice";
import { selectPresentation } from "./presentationSlice";
import { installPresentationStore } from "./presentationStore";
import "./workspace.css";
import "./presenterPreview.css";

export function Workspace({ presentationId }: { presentationId?: string } = {}) {
  const store = useAppStore();
  const controller = useMemo(() => new WorkspaceController(store), [store]);
  const view = useAppSelector(selectPresentation);
  useEffect(() => { installPresentationStore(store); }, [store]);
  const auth = useAppSelector((state) => state.auth);
  const w = useAppSelector((state) => state.workspace);
  const routeId = presentationId === undefined ? undefined : canonicalPresentationId(presentationId);
  const id = routeId ?? w.deck?.id ?? "";
  const valid = isPresentationId(id);
  const deleted = !!w.savedChanges[id] && "deleted" in w.savedChanges[id];
  const selected = w.deck?.id === id ? w.deck : null;
  const cached = useAppSelector((state) => valid ? presentationsApi.endpoints.getPresentation.select(id)(state).data : undefined);
  const preparing = cached?.status === "queued" || cached?.status === "processing";
  const metadata = useGetPresentationQuery(id, {
    skip: !auth.accessToken || !valid || deleted,
    pollingInterval: preparing ? 1500 : 0,
    refetchOnMountOrArgChange: true,
  });
  const presentation = metadata.currentData;
  const slideQuery = useGetPresentationSlidesQuery(id, {
    skip: !auth.accessToken || !valid || deleted || presentation?.status !== "ready",
  });
  const slides = useMemo(() => orderedSlides(slideQuery.currentData ?? []), [slideQuery.currentData]);
  useEffect(() => {
    controller.attach();
    if (!routeId) return () => controller.detach();
    if (!isPresentationId(routeId)) return () => controller.detach(true);
    const state = store.getState();
    const change = state.workspace.savedChanges[routeId];
    if (change && "deleted" in change) return () => controller.detach(true);
    if (state.workspace.deck?.id !== routeId) {
      const saved = presentationsApi.endpoints.getPresentation.select(routeId)(state).data;
      controller.openSaved({
        id: routeId,
        filename: saved?.filename ?? "Opening presentation…",
        updatedAt: saved?.updatedAt ?? "1970-01-01T00:00:00Z",
      });
    }
    const intent = store.getState().workspace.deckIntent;
    const generation = state.auth.generation;
    return () => {
      controller.leavePresentation(routeId, intent, generation);
      controller.detach(true);
    };
  }, [controller, store, routeId, auth.generation, deleted]);
  useEffect(() => {
    if (!deleted && selected && presentation?.id === id && presentation.status === "ready" && slides.length) {
      controller.setSlides(id, slides, w.deckIntent);
    }
  }, [controller, id, selected, w.deckIntent, presentation, slides, deleted]);
  useEffect(() => {
    if (!deleted && selected && presentation?.id === id && presentation.filename !== selected.filename) {
      store.dispatch(deckRenamed({ id, filename: presentation.filename, updatedAt: presentation.updatedAt }));
    }
  }, [store, id, selected, presentation, deleted]);
  const status = presentation?.status;
  const unavailable = !!presentationId && (!valid || deleted);
  const opening = !!presentationId && !unavailable && !selected;
  return <div className={`present-workspace ${view.active && selected ? "is-presenting" : ""}`}>
    <a className="skip-link" href="#presentation-stage">Skip to presentation</a>
    <WorkspaceHeader presenter />
    {unavailable ? <main className="presentation-unavailable">
      <h1>Presentation unavailable</h1>
      <p>{deleted ? "This saved presentation was deleted." : "This presentation link is invalid."}</p>
      <Link href="/workspace" className="button secondary">Back to workspace</Link>
    </main> : opening ? <main className="presentation-opening" role="status">Opening your presentation…</main> :
      <main className="workspace-body"><aside className="deck-sidebar" aria-label="Presentation setup">
        <div className="rail-heading"><span className="eyebrow">Current presentation</span><h2>Slides</h2></div>
        {selected && <div className="active-deck">
          <span className="eyebrow">Selected deck</span><strong title={selected.filename}>{selected.filename}</strong>
          <div className="deck-details">
            {presentation && <span>{presentation.format.toUpperCase()}{presentation.slideCount > 0 ? ` · ${presentation.slideCount} ${presentation.slideCount === 1 ? "slide" : "slides"}` : ""}</span>}
            <span className={`preparation-status ${status ?? ""}`}><span className="status-dot" aria-hidden="true" />{status === "ready" ? "Ready" : status === "queued" ? "Queued" : status === "processing" ? "Preparing" : status === "failed" ? "Preparation failed" : "Loading"}</span>
          </div>
        </div>}
        {!view.active && <PresenterPreview deck={presentation} slides={slides} controller={controller} />}
        <SlideList slides={slides} controller={controller} />
      </aside>
        <PresentationFocus slides={slides} ready={presentation?.status === "ready" && slides.length > 0} workspace={controller}>
          <SlideStage deck={presentation} slides={slides} loading={!!id && (metadata.isFetching && !presentation || presentation?.status === "ready" && slideQuery.isFetching && !slides.length)} error={!!metadata.error || !!slideQuery.error} retry={() => { if (presentation?.status === "ready") void slideQuery.refetch(); else void metadata.refetch(); }} controller={controller} />
          <FollowingControls slides={slides} ready={presentation?.status === "ready" && slides.length > 0} controller={controller} />
          {selected && <SessionTranscripts key={selected.id} presentationId={selected.id} />}
        </PresentationFocus>
      </main>}
  </div>;
}
