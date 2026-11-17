import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { PublicUser } from "./authTypes";

export interface AuthState {
  accessToken: string | null;
  user: PublicUser | null;
  expiresAt: number | null;
  generation: number;
  loginAttempt: number;
  isSigningIn: boolean;
  error: string | null;
  restoreStatus: "idle" | "restoring" | "ready";
  restoreFailed: boolean;
  signedOut: boolean;
}

const initialState: AuthState = {
  accessToken: null,
  user: null,
  expiresAt: null,
  generation: 0,
  loginAttempt: 0,
  isSigningIn: false,
  error: null,
  restoreStatus: "idle",
  restoreFailed: false,
  signedOut: false,
};

const slice = createSlice({
  name: "auth",
  initialState,
  reducers: {
    restoreStarted(state) {
      state.loginAttempt += 1;
      state.restoreStatus = "restoring";
      state.restoreFailed = false;
      state.error = null;
    },
    restoreFinished(state, action: PayloadAction<{
      generation: number; attempt: number; message?: string;
    }>) {
      if (state.generation !== action.payload.generation ||
          state.loginAttempt !== action.payload.attempt) return;
      state.restoreStatus = "ready";
      state.restoreFailed = !!action.payload.message;
      state.error = action.payload.message ?? null;
    },
    signInStarted(state) {
      state.restoreStatus = "ready";
      state.restoreFailed = false;
      state.signedOut = false;
      state.loginAttempt += 1;
      state.isSigningIn = true;
      state.error = null;
    },
    signInFailed(state, action: PayloadAction<{
      generation: number;
      attempt: number;
      message: string;
    }>) {
      if (state.generation !== action.payload.generation ||
          state.loginAttempt !== action.payload.attempt) return;
      state.isSigningIn = false;
      state.error = action.payload.message;
    },
    sessionEstablished(state, action: PayloadAction<{
      generation: number;
      attempt: number;
      accessToken: string;
      expiresAt: number;
      user: PublicUser;
    }>) {
      if (state.generation !== action.payload.generation ||
          state.loginAttempt !== action.payload.attempt) return;
      state.restoreStatus = "ready";
      state.restoreFailed = false;
      state.signedOut = false;
      state.accessToken = action.payload.accessToken;
      state.user = action.payload.user;
      state.expiresAt = action.payload.expiresAt;
      state.generation += 1;
      state.isSigningIn = false;
      state.error = null;
    },
    sessionCleared(state, action: PayloadAction<{ reason?: string; signedOut?: boolean; bootstrapPending?: boolean } | undefined>) {
      state.restoreStatus = action.payload?.bootstrapPending ? "idle" : "ready";
      state.restoreFailed = false;
      state.signedOut = action.payload?.signedOut ?? false;
      state.accessToken = null;
      state.user = null;
      state.expiresAt = null;
      state.generation += 1;
      state.loginAttempt += 1;
      state.isSigningIn = false;
      state.error = action.payload?.reason ?? null;
    },
  },
});

export const { signInStarted, signInFailed, sessionEstablished, sessionCleared, restoreStarted, restoreFinished } = slice.actions;
export const authReducer = slice.reducer;
