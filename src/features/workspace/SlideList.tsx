"use client";
import Image from "next/image";
import { FileImage, LoaderCircle } from "lucide-react";
import { useAppSelector } from "@/store/hooks";
import { presentationPath, uuid } from "@/lib/api/responseHelpers";
import type { PresentationSlide } from "@/features/presentations/presentationTypes";
import type { WorkspaceController } from "./WorkspaceController";
export function SlideList({ slides, controller }: { slides: PresentationSlide[]; controller: WorkspaceController }) {
  const w = useAppSelector((state) => state.workspace);
  const assets = useAppSelector((state) => state.assets.byKey);
  if (!w.deck || !slides.length) return null;
  return <section className="slides-section" aria-label="Slides">
    <div className="section-heading"><h2>Slides</h2><span>{slides.length} total</span></div>
    <div className="slide-list">
      {slides.map((slide) => {
        const key = `${presentationPath(w.deck!.id)}/slides/${uuid(slide.id)}/image`;
        const resource = assets[key]; const selected = w.snapshot?.displayedSlideId === slide.id;
        return <button type="button" key={slide.id} className={`slide-item ${selected ? "selected" : ""}`} aria-current={selected ? "true" : undefined} aria-label={`Show slide ${slide.position}: ${slide.title || "Untitled slide"}`} onClick={() => controller.navigate(slide.id)}>
          <span className="thumbnail">{resource ? <Image src={resource.url} alt="" width={80} height={50} unoptimized onError={() => controller.assets.decodeFailed(slide.id, resource.url)} /> : w.images[slide.id]?.status === "error" ? <FileImage size={18} aria-hidden="true" /> : <LoaderCircle size={16} className="spin" aria-hidden="true" />}</span>
          <span className="slide-item-copy"><span className="slide-number">{String(slide.position).padStart(2, "0")}</span><span className="slide-item-title" title={slide.title || `Slide ${slide.position}`}>{slide.title || `Slide ${slide.position}`}</span></span>
        </button>;
      })}
    </div>
  </section>;
}
