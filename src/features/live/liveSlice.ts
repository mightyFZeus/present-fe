import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { LiveEvent, LiveSessionMetadata, NavigationProposal } from "./liveTypes";

export interface LiveState {
  status: "idle" | "connecting" | "ready" | "updating" | "ended" | "error";
  session: LiveSessionMetadata | null;
  presentationId: string | null;
  epoch: string | null;
  generation: number;
  version: number;
  held: boolean;
  acceptsAudio: boolean;
  transcriptSeq: number;
  publishedSeq: number;
  interim: string;
  segments: { text: string; sequence: number; at: number }[];
  proposal: NavigationProposal | null;
  error: string | null;
}
const initialState: LiveState = {
  status: "idle", session: null, presentationId: null, epoch: null, generation: 0, version: 0,
  held: true, acceptsAudio: false, transcriptSeq: 0, publishedSeq: 0,
  interim: "", segments: [], proposal: null, error: null,
};
const slice = createSlice({
  name: "live",
  initialState,
  reducers: {
    livePreparing: (_, action: PayloadAction<string>) => ({ ...initialState, presentationId: action.payload, status: "connecting" as const }),
    liveConnecting(state, action: PayloadAction<{ session: LiveSessionMetadata; presentationId: string }>) {
      Object.assign(state, initialState, { status: "connecting", session: action.payload.session, presentationId: action.payload.presentationId });
    },
    liveUpdating(state) { state.status = "updating"; state.acceptsAudio = false; state.proposal = null; },
    liveEventReceived(state, action: PayloadAction<{ event: LiveEvent; at: number }>) {
      const { event, at } = action.payload;
      state.epoch = event.epoch;
      state.generation = event.generation;
      state.version = event.version;
      state.held = event.held;
      state.acceptsAudio = event.acceptsAudio;
      if (event.type === "ready") state.status = "ready";
      if (event.type === "stateAck") {
        state.status = "updating";
        state.interim = ""; state.segments = []; state.proposal = null;
      }
      if (event.type === "transcript") {
        state.transcriptSeq = Math.max(state.transcriptSeq, event.transcriptSeq);
        if (event.isFinal && event.text) {
          state.interim = "";
          state.segments.push({ text: event.text, sequence: event.transcriptSeq, at });
          state.segments = state.segments.filter((item) => at - item.at <= 20_000).slice(-64);
          while (state.segments.length > 1 &&
              new TextEncoder().encode(state.segments.map((item) => item.text).join(" ")).length > 6000) {
            state.segments.shift();
          }
        } else state.interim = event.text ?? "";
      }
      if (event.type === "proposal" && event.proposal) {
        state.proposal = event.proposal;
        state.publishedSeq = event.transcriptSeq;
      }
      if (event.type === "error") state.error = event.message ?? "Live session error.";
      if (event.type === "ended") { state.status = "ended"; state.acceptsAudio = false; }
    },
    liveFailed(state, action: PayloadAction<string>) {
      state.status = "error"; state.acceptsAudio = false; state.error = action.payload;
    },
    liveStopped(state) { state.status = "ended"; state.acceptsAudio = false; state.proposal = null; },
    liveReset: () => initialState,
  },
});
export const { livePreparing, liveConnecting, liveUpdating, liveEventReceived, liveFailed, liveStopped, liveReset } = slice.actions;
export const liveReducer = slice.reducer;
