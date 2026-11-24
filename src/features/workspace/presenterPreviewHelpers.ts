import type { PresentationSlide } from "@/features/presentations/presentationTypes";

export interface PresenterCue {
  text: string;
  source: "Speaker notes" | "Slide summary" | "Slide text" | "Slide title";
}

const cueLength = 240;

// The caller supplies the same ordered slides used by manual navigation.
export function nextPreviewSlide(
  slides: readonly PresentationSlide[],
  displayedSlideId: string,
): PresentationSlide | undefined {
  const index = slides.findIndex((slide) => slide.id === displayedSlideId);
  return index < 0 ? undefined : slides[index + 1];
}

export function presenterCue(slide: PresentationSlide): PresenterCue | null {
  const sources: [string, PresenterCue["source"]][] = [
    [slide.notes, "Speaker notes"],
    [slide.meaning, "Slide summary"],
    [slide.text, "Slide text"],
    [slide.title, "Slide title"],
  ];
  for (const [value, source] of sources) {
    const text = value.replace(/\s+/gu, " ").trim();
    if (!text) continue;
    const characters = Array.from(text);
    if (characters.length <= cueLength) return { text, source };
    const prefix = characters.slice(0, cueLength - 1).join("");
    const boundary = prefix.lastIndexOf(" ");
    const shortened = boundary >= prefix.length / 2 ? prefix.slice(0, boundary) : prefix;
    return { text: `${shortened.trimEnd()}…`, source };
  }
  return null;
}
