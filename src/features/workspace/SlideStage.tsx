"use client";
import Image from "next/image";
import { FileImage, FileText, Presentation, RotateCcw } from "lucide-react";
import { useAppSelector } from "@/store/hooks";
import { presentationPath, uuid } from "@/lib/api/responseHelpers";
import type { Presentation as Deck, PresentationSlide } from "@/features/presentations/presentationTypes";
import type { WorkspaceController } from "./WorkspaceController";
interface Props { deck?: Deck; slides: PresentationSlide[]; loading: boolean; error: boolean; retry(): void; controller: WorkspaceController }
export function SlideStage({ deck, slides, loading, error, retry, controller }: Props) {
  const w = useAppSelector((state) => state.workspace);
  const assets = useAppSelector((state) => state.assets.byKey);
  const slide = slides.find((item) => item.id === w.snapshot?.displayedSlideId);
  const key = w.deck && slide ? `${presentationPath(w.deck.id)}/slides/${uuid(slide.id)}/image` : "";
  const resource = assets[key];
  const imageError = slide && w.images[slide.id]?.status === "error";
  const preparing = deck?.status === "queued" || deck?.status === "processing";
  return <section className="stage-section" aria-labelledby="stage-title">
    <div className="stage-heading"><div><p className="eyebrow">Slide preview</p><h1 id="stage-title">{slide?.title || w.deck?.filename || "Your presentation starts here"}</h1></div><span className="slide-count">{slide ? `${slide.position} / ${slides.length}` : "No slide selected"}</span></div>
    <div className={`slide-stage ${resource ? "has-slide" : ""}`} tabIndex={0} aria-label="Presentation slide viewer" onKeyDown={(event) => {
      if (event.target !== event.currentTarget || !slide) return;
      const index = slides.findIndex((item) => item.id === slide.id);
      const next = event.key === "ArrowLeft" ? slides[index - 1] : event.key === "ArrowRight" ? slides[index + 1] : undefined;
      if (next) { event.preventDefault(); controller.navigate(next.id); }
    }}>
      {resource && slide ? <Image src={resource.url} alt={`Slide ${slide.position}: ${slide.title || "Presentation slide"}`} fill sizes="(max-width: 860px) 100vw, calc(100vw - 330px)" className="stage-image" unoptimized priority onError={() => controller.assets.decodeFailed(slide.id, resource.url)} /> : <div className="stage-empty" role={preparing || loading ? "status" : undefined}>
        {preparing ? <FileText size={38} strokeWidth={1.2} aria-hidden="true" /> : imageError ? <FileImage size={38} strokeWidth={1.2} aria-hidden="true" /> : <Presentation size={42} strokeWidth={1.2} aria-hidden="true" />}
        <h2>{deck?.status === "failed" ? "This deck needs another try" : error ? "Presentation unavailable" : preparing ? deck.status === "queued" ? "Your deck is in the queue" : "Preparing your slides" : loading || (slide && !imageError) ? "Loading your slides" : imageError ? "This slide could not load" : "Your slide stage"}</h2>
        <p>{deck?.status === "failed" ? deck.error || "Preparation failed. Choose another file to try again." : error ? "Check the connection, then try again." : preparing ? "Reading your deck and preparing the context for following." : loading || (slide && !imageError) ? "The slide preview will appear here." : imageError ? "You can retry this preview or choose another slide." : "Choose a PDF or PowerPoint presentation from the setup panel."}</p>
        {(error || imageError) && <button className="button stage-retry" onClick={() => imageError && slide && w.deck ? controller.assets.retry(w.deck.id, slide.id, w.deckIntent) : retry()}><RotateCcw size={15} aria-hidden="true" /> Try again</button>}
      </div>}
    </div>
    <p className="stage-footnote">{preparing ? "You can start following once preparation is complete." : slide ? "Focus the viewer to navigate with the Left and Right arrow keys." : "Your microphone stays off until you choose to start."}</p>
  </section>;
}
