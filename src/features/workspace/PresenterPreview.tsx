"use client";

import Image from "next/image";
import { FileImage, Flag, LoaderCircle, RotateCcw } from "lucide-react";
import { useAppSelector } from "@/store/hooks";
import { presentationPath, uuid } from "@/lib/api/responseHelpers";
import type { Presentation, PresentationSlide } from "@/features/presentations/presentationTypes";
import type { WorkspaceController } from "./WorkspaceController";
import { selectPresentation } from "./presentationSlice";
import { nextPreviewSlide, presenterCue } from "./presenterPreviewHelpers";

interface Props {
  deck?: Presentation;
  slides: PresentationSlide[];
  controller: WorkspaceController;
}

export function PresenterPreview({ deck, slides, controller }: Props) {
  const workspace = useAppSelector((state) => state.workspace);
  const authenticated = useAppSelector((state) => !!state.auth.accessToken);
  const assets = useAppSelector((state) => state.assets.byKey);
  const view = useAppSelector(selectPresentation);
  const displayed = workspace.snapshot?.displayedSlideId;
  if (!authenticated || view.active || !deck || deck.status !== "ready" ||
    workspace.deck?.id !== deck.id || !displayed ||
    !slides.some((slide) => slide.id === displayed)) return null;

  const next = nextPreviewSlide(slides, displayed);
  const cue = next ? presenterCue(next) : null;
  const key = next ? `${presentationPath(deck.id)}/slides/${uuid(next.id)}/image` : "";
  const resource = assets[key];
  const imageError = next && workspace.images[next.id]?.status === "error";

  return <section className="presenter-preview" aria-labelledby="presenter-preview-title">
    <div className="section-heading">
      <h2 id="presenter-preview-title">Next slide</h2>
      {next && <span>{next.position} / {slides.length}</span>}
    </div>
    {next ? <>
      <div className="presenter-preview-image">
        {resource && !imageError ? <Image
          src={resource.url}
          alt={`Next slide ${next.position}: ${next.title || "Untitled slide"}`}
          fill
          sizes="(max-width: 560px) 100vw, (max-width: 900px) 50vw, 224px"
          unoptimized
          onError={() => controller.assets.decodeFailed(next.id, resource.url)}
        /> : <div className="presenter-preview-placeholder" role={imageError ? undefined : "status"}>
          {imageError ? <FileImage size={20} aria-hidden="true" /> :
            <LoaderCircle size={18} className="spin" aria-hidden="true" />}
          <span>{imageError ? "Preview unavailable" : "Loading preview"}</span>
        </div>}
      </div>
      <h3 className="presenter-preview-name" title={next.title || `Slide ${next.position}`}>
        {next.title || `Slide ${next.position}`}
      </h3>
      {imageError && <button
        type="button"
        className="button secondary presenter-preview-retry"
        onClick={() => controller.assets.retry(deck.id, next.id, workspace.deckIntent)}
      >
        <RotateCcw size={14} aria-hidden="true" /> Retry preview
      </button>}
      <div className="presenter-preview-cue">
        <div className="presenter-preview-cue-heading">
          <h3>Cue</h3>
          {cue && <span>{cue.source}</span>}
        </div>
        <p>{cue?.text || "No cue text is available for this slide."}</p>
      </div>
    </> : <p className="presenter-preview-end">
      <Flag size={16} aria-hidden="true" />
      <span>Final slide. There is no next slide.</span>
    </p>}
  </section>;
}
