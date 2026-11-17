export interface NavigationSnapshot {
  displayedSlideId: string;
  mainSlideId: string;
  returnPointId: string | null;
  visitedSlideIds: string[];
  version: number;
  held: boolean;
}

export interface NavigationProposal {
  action: "stay" | "advance" | "revisit" | "return";
  slideId: string;
  confidence: number;
  version: number;
  returnPointId: string | null;
}

export interface LiveSessionResponse {
  sessionId: string;
  ticket: string;
  ticketExpiresAt: string;
  expiresAt: string;
  wsPath: string;
  audio: { encoding: "pcm_s16le"; sampleRate: 16000; channels: 1 };
}

export type LiveSessionMetadata = Omit<LiveSessionResponse, "ticket">;
export interface LiveEvent {
  type: "ready" | "stateAck" | "transcript" | "proposal" | "error" | "ended";
  sessionId: string;
  epoch: string;
  generation: number;
  version: number;
  transcriptSeq: number;
  held: boolean;
  acceptsAudio: boolean;
  isFinal: boolean;
  text?: string;
  proposal?: NavigationProposal;
  code?: string;
  message?: string;
}

export interface LiveHandle {
  close(): void;
  sendPcm(data: ArrayBuffer | Uint8Array): void;
  updateSnapshot(snapshot: NavigationSnapshot): void;
}
