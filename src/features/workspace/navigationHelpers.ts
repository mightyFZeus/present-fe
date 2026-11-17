import type { PresentationSlide } from "@/features/presentations/presentationTypes";
import type { NavigationProposal, NavigationSnapshot } from "@/features/live/liveTypes";

export function orderedSlides(slides: PresentationSlide[]) {
  return [...slides].sort((a, b) => a.position - b.position);
}
export function initialSnapshot(slides: PresentationSlide[]): NavigationSnapshot | null {
  const first = orderedSlides(slides)[0];
  return first ? { displayedSlideId: first.id, mainSlideId: first.id, returnPointId: null, visitedSlideIds: [first.id], version: 1, held: true } : null;
}
export function manualSlide(s: NavigationSnapshot, target: string, slides: PresentationSlide[]): NavigationSnapshot {
  if (target === s.displayedSlideId) return s;
  const selected = slides.find((slide) => slide.id === target);
  const main = slides.find((slide) => slide.id === s.mainSlideId);
  if (!selected || !main) return s;
  const revisit = selected.position < main.position;
  const mainId = revisit ? s.mainSlideId : target;
  const mainPosition = revisit ? main.position : selected.position;
  const visited = [...new Set([...s.visitedSlideIds, target])].filter((id) => {
    const slide = slides.find((item) => item.id === id);
    return slide && slide.position <= mainPosition;
  });
  return { ...s, displayedSlideId: target, mainSlideId: mainId, returnPointId: revisit ? mainId : null, visitedSlideIds: visited, version: s.version + 1 };
}
export function proposalSnapshot(s: NavigationSnapshot, p: NavigationProposal, slides: PresentationSlide[]): NavigationSnapshot {
  if (s.held || p.version !== s.version || !Number.isFinite(p.confidence) || p.confidence < 0.8 || p.confidence > 1) return s;
  const target = slides.find((slide) => slide.id === p.slideId);
  const main = slides.find((slide) => slide.id === s.mainSlideId);
  if (!target || !main || p.action === "stay") return s;
  if (p.action === "advance" && target.position > main.position) return manualSlide(s, target.id, slides);
  if (p.action === "revisit" && target.position < main.position) return manualSlide(s, target.id, slides);
  if (p.action === "return" && s.returnPointId === target.id) return manualSlide(s, target.id, slides);
  return s;
}
