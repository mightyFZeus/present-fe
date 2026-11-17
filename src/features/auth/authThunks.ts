import { createAsyncThunk } from "@reduxjs/toolkit";
import type { AppDispatch, AppStore } from "@/store/store";
import type { ApiThunkConfig } from "@/lib/api/thunkTypes";
import { request } from "@/lib/api/request";
import { invalidResponse, isRecord, unwrapData } from "@/lib/api/responseHelpers";
import { signInStarted, signInFailed, sessionEstablished, sessionCleared, restoreStarted, restoreFinished } from "./authSlice";
import { orderedCookieRequest, cookieCoordinationError } from "./authSessionHelpers";
import type { PublicUser, SignedInSession } from "./authTypes";

function readSession(value: unknown): {
  accessToken: string;
  expiresAt: number;
  user: PublicUser;
} | undefined {
  if (!isRecord(value) || typeof value.accessToken !== "string" ||
      !value.accessToken || typeof value.expiresIn !== "number" ||
      !Number.isFinite(value.expiresIn) || value.expiresIn <= 0 || !isRecord(value.user)) return;
  const user = value.user;
  if (["id", "firstName", "lastName", "createdAt", "updatedAt"].some((key) => typeof user[key] !== "string")) return;
  try {
    // This unverified decode is ONLY an expiry bound; the backend verifies tokens.
    const payload = value.accessToken.split(".")[1];
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const decoded: unknown = JSON.parse(atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=")));
    if (!isRecord(decoded) || typeof decoded.exp !== "number" || !Number.isFinite(decoded.exp)) return;
    const expiresAt = Math.min(Date.now() + value.expiresIn * 1000, decoded.exp * 1000);
    if (!Number.isSafeInteger(expiresAt) || expiresAt <= Date.now()) return;
    return {
      accessToken: value.accessToken,
      expiresAt,
      user: {
        id: user.id as string,
        firstName: user.firstName as string,
        lastName: user.lastName as string,
        createdAt: user.createdAt as string,
        updatedAt: user.updatedAt as string,
      },
    };
  } catch { return; }
}

const signInRequest = createAsyncThunk<
  SignedInSession, { credentialId: string }, ApiThunkConfig
>("auth/signIn", async ({ credentialId }, context) => {
  const idToken = context.extra.takeCredential(credentialId);
  context.dispatch(signInStarted());
  const { generation, loginAttempt: attempt } = context.getState().auth;
  const current = () => context.extra.isCurrent(generation) &&
    context.getState().auth.loginAttempt === attempt;
  const fail = (message: string) => {
    if (current()) context.dispatch(signInFailed({ generation, attempt, message }));
  };
  if (!idToken?.trim() || idToken.length > 16_384) {
    fail("A valid Google ID token is required.");
    return context.rejectWithValue({ status: 400, message: "A valid Google ID token is required." });
  }
  const result = await orderedCookieRequest(context.extra.origin, async () => {
    if (!current()) return { error: { status: "STALE_SESSION" as const, message: "The sign-in was superseded." } };
    return request({
      url: "/v1/users/auth/google", method: "POST", data: { idToken },
      authenticated: false, cookieSession: true,
    }, context);
  }).catch(cookieCoordinationError);
  if (result.error) { fail(result.error.message); return context.rejectWithValue(result.error); }
  if (!current()) return context.rejectWithValue({ status: "STALE_SESSION", message: "The sign-in was superseded." });
  const session = readSession(unwrapData(result.data));
  if (!session) { fail("The backend returned an invalid session."); return context.rejectWithValue(invalidResponse()); }
  context.dispatch(sessionEstablished({ generation, attempt, ...session }));
  return { user: session.user, expiresAt: session.expiresAt };
});

// Google credentials stay in a one-use runtime handle, not Redux action arguments.
export function signInWithGoogle(store: AppStore, idToken: string) {
  return store.dispatch(signInRequest({ credentialId: store.resources.putCredential(idToken) }));
}

export const restoreSession = createAsyncThunk<void, void, ApiThunkConfig>(
  "auth/restoreSession", async (_, context) => {
    context.dispatch(restoreStarted());
    const { generation, loginAttempt: attempt } = context.getState().auth;
    const current = () => context.extra.isCurrent(generation) &&
      context.getState().auth.loginAttempt === attempt;
    const result = await orderedCookieRequest(context.extra.origin, async () => {
      if (!current()) return { error: { status: "STALE_SESSION" as const, message: "Restoration was superseded." } };
      return request({ url: "/v1/users/auth/session", authenticated: false, cookieSession: true }, context);
    }).catch(cookieCoordinationError);
    if (!current()) return;
    if (result.error) {
      context.dispatch(restoreFinished({ generation, attempt,
        message: result.error.status === 401 ? undefined : result.error.status === "CONFIGURATION_ERROR"
          ? result.error.message : "Your session could not be restored. Retry or sign in with Google.",
      }));
      return;
    }
    const session = readSession(unwrapData(result.data));
    if (!session) {
      context.dispatch(restoreFinished({ generation, attempt, message: "The backend returned an invalid session. Retry or sign in with Google." }));
      return;
    }
    context.dispatch(sessionEstablished({ generation, attempt, ...session }));
  },
);

// Redux cleanup is synchronous; cookie clearing is ordered after older logins.
export const logout = () => (dispatch: AppDispatch, getState: AppStore["getState"], extra: ApiThunkConfig["extra"]) => {
  dispatch(sessionCleared({ signedOut: true }));
  const { generation, loginAttempt: attempt } = getState().auth;
  const current = () => extra.isCurrent(generation) && getState().auth.loginAttempt === attempt && getState().auth.signedOut;
  // Broadcast the current user intent once; a late HTTP completion never rebroadcasts.
  extra.notifySignOut?.();
  return orderedCookieRequest(extra.origin, async () => {
    const result = await request({
      url: "/v1/users/auth/logout", method: "POST", data: {}, authenticated: false, cookieSession: true,
    }, { extra, dispatch, signal: new AbortController().signal });
    if (result.error && current()) {
      dispatch(sessionCleared({ signedOut: true, reason: "Signed out here. Browser sign-out could not be confirmed; sign in again to replace it." }));
    }
  }).catch(() => {
    if (current()) dispatch(sessionCleared({ signedOut: true,
      reason: "Signed out here. Browser sign-out could not be confirmed; sign in again to replace it.",
    }));
  });
};
