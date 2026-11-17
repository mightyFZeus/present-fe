import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { AssetResource } from "./presentationTypes";

const slice = createSlice({
  name: "assets",
  initialState: { byKey: {} as Record<string, AssetResource> },
  reducers: {
    assetLoaded(state, action: PayloadAction<AssetResource>) {
      state.byKey[action.payload.key] = action.payload;
    },
    assetRemoved(state, action: PayloadAction<{ key: string; url?: string }>) {
      if (!action.payload.url || state.byKey[action.payload.key]?.url === action.payload.url) delete state.byKey[action.payload.key];
    },
    assetsCleared(state) { state.byKey = {}; },
  },
});
export const { assetLoaded, assetRemoved, assetsCleared } = slice.actions;
export const assetsReducer = slice.reducer;
