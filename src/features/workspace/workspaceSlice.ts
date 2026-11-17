import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import { labelIsAtLeastAsNew, type SavedPresentationChanges } from "./libraryHelpers";
import type { NavigationSnapshot } from "@/features/live/liveTypes";

export type MicStatus = "off" | "connecting" | "permission" | "listening" | "held" | "error";
export interface WorkspaceState {
  deck: { id: string; filename: string; updatedAt?: string } | null;
  deckIntent: number;
  savedChanges: SavedPresentationChanges;
  savedPending: Record<string, { requestId: string; kind: "rename" | "delete" }>;
  snapshot: NavigationSnapshot | null;
  upload: { status: "idle" | "uploading" | "error"; error: string | null; intent: number };
  images: Record<string, { status: "loading" | "ready" | "error"; error?: string }>;
  mic: { status: MicStatus; level: number; error: string | null };
  google: { status: "unconfigured" | "loading" | "ready" | "error"; retry: number };
  handledSession: string | null;
  handledSequence: number;
  lastManualAt: number;
  lastAutoAt: number;
}
const initialState: WorkspaceState = {
  deck: null, deckIntent: 0, savedChanges: {}, savedPending: {}, snapshot: null,
  upload: { status: "idle", error: null, intent: 0 }, images: {},
  mic: { status: "off", level: 0, error: null }, google: { status: "unconfigured", retry: 0 },
  handledSession: null, handledSequence: 0, lastManualAt: 0, lastAutoAt: 0,
};
const slice = createSlice({
  name: "workspace", initialState,
  reducers: {
    workspaceReset: () => initialState,
    deckSelected(state, action: PayloadAction<{ id: string; filename: string; updatedAt?: string }>) {
      state.deck = action.payload; state.deckIntent += 1; state.snapshot = null; state.images = {};
      state.handledSession = null; state.handledSequence = 0; state.lastAutoAt = 0; state.lastManualAt = 0;
      state.mic = { status: "off", level: 0, error: null };
    },
    deckRenamed(state, action: PayloadAction<{ id: string; filename: string; updatedAt: string }>) {
      if (state.deck?.id !== action.payload.id) return;
      if (state.deck.updatedAt && !labelIsAtLeastAsNew(action.payload.updatedAt, state.deck.updatedAt)) return;
      state.deck.filename = action.payload.filename;
      state.deck.updatedAt = action.payload.updatedAt;
    },
    savedMutationStarted(state, action: PayloadAction<{ id: string; requestId: string; kind: "rename" | "delete" }>) {
      if (!state.savedPending[action.payload.id]) {
        state.savedPending[action.payload.id] = {
          requestId: action.payload.requestId,
          kind: action.payload.kind,
        };
      }
    },
    savedMutationFinished(state, action: PayloadAction<{ id: string; requestId: string }>) {
      if (state.savedPending[action.payload.id]?.requestId === action.payload.requestId) {
        delete state.savedPending[action.payload.id];
      }
    },
    savedPresentationRenamed(state, action: PayloadAction<{ id: string; filename: string; updatedAt: string }>) {
      state.savedChanges[action.payload.id] = {
        filename: action.payload.filename,
        updatedAt: action.payload.updatedAt,
      };
      if (state.deck?.id === action.payload.id && (!state.deck.updatedAt ||
        labelIsAtLeastAsNew(action.payload.updatedAt, state.deck.updatedAt))) {
        state.deck.filename = action.payload.filename;
        state.deck.updatedAt = action.payload.updatedAt;
      }
    },
    savedPresentationDeleted(state, action: PayloadAction<string>) {
      state.savedChanges[action.payload] = { deleted: true };
    },
    deckCleared(state, action: PayloadAction<string>) {
      if (state.deck?.id !== action.payload) return;
      state.deck = null;
      state.deckIntent += 1;
      state.snapshot = null;
      state.images = {};
      state.handledSession = null;
      state.handledSequence = 0;
      state.lastAutoAt = 0;
      state.lastManualAt = 0;
      state.mic = { status: "off", level: 0, error: null };
    },
    snapshotChanged(state, action: PayloadAction<{ snapshot: NavigationSnapshot; source: "manual" | "auto" | "control"; at: number }>) {
      state.snapshot = action.payload.snapshot;
      if (action.payload.source === "manual") state.lastManualAt = action.payload.at;
      if (action.payload.source === "auto") state.lastAutoAt = action.payload.at;
    },
    proposalHandled(state, action: PayloadAction<{ session: string; sequence: number }>) {
      if (state.handledSession !== action.payload.session) { state.handledSession = action.payload.session; state.handledSequence = 0; }
      state.handledSequence = Math.max(state.handledSequence, action.payload.sequence);
    },
    uploadStarted(state) { state.upload.intent += 1; state.upload.status = "uploading"; state.upload.error = null; },
    uploadFinished(state) { state.upload.status = "idle"; state.upload.error = null; },
    uploadFailed(state, action: PayloadAction<string>) { state.upload.status = "error"; state.upload.error = action.payload; },
    uploadCancelled(state) { state.upload.intent += 1; state.upload.status = "idle"; state.upload.error = null; },
    imageChanged(state, action: PayloadAction<{ deckIntent: number; id: string; status: "loading" | "ready" | "error"; error?: string }>) {
      if (state.deckIntent === action.payload.deckIntent) state.images[action.payload.id] = { status: action.payload.status, error: action.payload.error };
    },
    micChanged(state, action: PayloadAction<{ status: MicStatus; error?: string | null }>) {
      state.mic.status = action.payload.status; state.mic.error = action.payload.error ?? null;
      if (action.payload.status !== "listening") state.mic.level = 0;
    },
    micLevel(state, action: PayloadAction<number>) { state.mic.level = Math.max(0, Math.min(1, action.payload)); },
    googleStatus(state, action: PayloadAction<WorkspaceState["google"]["status"]>) { state.google.status = action.payload; },
    googleRetry(state) { state.google.retry += 1; },
  },
});
export const { workspaceReset, deckSelected, deckRenamed, deckCleared, savedPresentationRenamed, savedPresentationDeleted, savedMutationStarted, savedMutationFinished, snapshotChanged, proposalHandled, uploadStarted, uploadFinished, uploadFailed, uploadCancelled, imageChanged, micChanged, micLevel, googleStatus, googleRetry } = slice.actions;
export const workspaceReducer = slice.reducer;
