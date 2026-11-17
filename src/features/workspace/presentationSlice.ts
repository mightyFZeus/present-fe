import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { RootState } from "@/store/store";
import { deckCleared, deckSelected, micChanged, workspaceReset } from "./workspaceSlice";

export interface PresentationState {
  active: boolean;
  controlsVisible: boolean;
  fullscreen: boolean;
  fullscreenError: string | null;
}
const initialState: PresentationState = {
  active: false,
  controlsVisible: true,
  fullscreen: false,
  fullscreenError: null,
};
const slice = createSlice({
  name: "presentation",
  initialState,
  reducers: {
    presentationEntered(state) { state.active = true; state.controlsVisible = true; },
    presentationExited: () => initialState,
    presentationControlsShown(state) { state.controlsVisible = true; },
    presentationControlsHidden(state) { if (state.active) state.controlsVisible = false; },
    presentationFullscreenChanged(state, action: PayloadAction<boolean>) {
      state.fullscreen = action.payload;
    },
    presentationFullscreenError(state, action: PayloadAction<string | null>) {
      state.fullscreenError = action.payload;
      if (action.payload) state.controlsVisible = true;
    },
  },
  extraReducers: (builder) => {
    builder.addCase(micChanged, (state, action) => {
      if (action.payload.status === "listening") state.active = true;
      if (action.payload.status !== "listening") state.controlsVisible = true;
    });
    builder.addCase(deckSelected, () => initialState);
    builder.addCase(deckCleared, () => initialState);
    builder.addCase(workspaceReset, () => initialState);
  },
});
export const {
  presentationEntered, presentationExited, presentationControlsShown,
  presentationControlsHidden, presentationFullscreenChanged, presentationFullscreenError,
} = slice.actions;
export const presentationReducer = slice.reducer;
export function selectPresentation(state: RootState): PresentationState {
  return (state as RootState & { presentation?: PresentationState }).presentation ?? initialState;
}
