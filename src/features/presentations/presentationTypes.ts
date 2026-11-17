export interface Presentation {
  id: string;
  filename: string;
  format: "pdf" | "pptx";
  status: "queued" | "processing" | "ready" | "failed";
  outline: string;
  slideCount: number;
  createdAt: string;
  updatedAt: string;
  error?: string;
}

export type PresentationSummary = Omit<Presentation, "outline">;

export interface PresentationPage {
  presentations: PresentationSummary[];
  nextCursor: string;
}

export interface PresentationSlide {
  id: string;
  position: number;
  title: string;
  text: string;
  notes: string;
  meaning: string;
}

export interface RetrievalMatch {
  slideId: string;
  position: number;
  content: string;
  score: number;
}

export interface AssetResource {
  key: string;
  url: string;
  contentType: string;
  size: number;
}
