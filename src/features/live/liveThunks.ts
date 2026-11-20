import { createAsyncThunk } from "@reduxjs/toolkit";
import type { AppStore } from "@/store/store";
import type { ApiError } from "@/lib/api/apiTypes";
import type { ApiThunkConfig } from "@/lib/api/thunkTypes";
import { request } from "@/lib/api/request";
import { invalidResponse, presentationPath, unwrapData } from "@/lib/api/responseHelpers";
import { LiveClient } from "./LiveClient";
import { readLiveSession, validSnapshot } from "./liveValidationHelpers";
import { livePreparing, liveConnecting, liveEventReceived, liveFailed, liveStopped, liveUpdating } from "./liveSlice";
import type { LiveSessionMetadata, NavigationSnapshot } from "./liveTypes";

export const connectLiveSession = createAsyncThunk<
  LiveSessionMetadata, { presentationId: string; snapshot: NavigationSnapshot }, ApiThunkConfig
>("live/connect", async ({ presentationId, snapshot }, context) => {
  if (!validSnapshot(snapshot)) return context.rejectWithValue({ status: 400, message: "A valid navigation snapshot is required." });
  let path: string;
  try { path = `${presentationPath(presentationId)}/live-sessions`; }
  catch { return context.rejectWithValue({ status: 400, message: "A valid presentation UUID is required." }); }
  const runtime = context.extra;
  const generation = runtime.auth().generation;
  const intent = runtime.beginLive();
  context.dispatch(livePreparing(presentationId));
  const owned = () => runtime.isCurrent(generation) && runtime.isLiveIntent(intent);
  const fail = (error: ApiError) => {
    if (owned()) {
      context.dispatch(error.status === "CANCELLED" ? liveStopped() : liveFailed(error.message));
      if (owned()) runtime.cancelLive();
    }
    return context.rejectWithValue(error);
  };
  if (context.signal.aborted || !owned()) return fail({ status: "CANCELLED", message: "The live connection was cancelled." });
  const result = await request({ url: path, method: "POST", data: {} }, context);
  if (result.error) return fail(result.error);
  const session = runtime.origin ? readLiveSession(unwrapData(result.data), runtime.origin) : undefined;
  if (!runtime.isCurrent(generation) || !runtime.isLiveIntent(intent)) {
    return context.rejectWithValue({ status: "STALE_SESSION", message: "The live connection was superseded." });
  }
  if (context.signal.aborted) return fail({ status: "CANCELLED", message: "The live connection was cancelled." });
  if (!session) return fail(invalidResponse());
  // Tickets are only transient local variables and the socket's one-use auth field.
  const { ticket: _ticket, ...metadata } = session;
  void _ticket;
  const finish = (message: string) => {
    if (!owned()) return;
    context.dispatch(liveFailed(message));
    if (owned()) runtime.cancelLive();
  };
  const client: LiveClient = new LiveClient(session, snapshot, runtime.origin!, runtime.socketFactory, {
    active: (): boolean => owned() && runtime.live === client,
    event: (event) => {
      context.dispatch(liveEventReceived({ event, at: Date.now() }));
    },
    error: finish,
    ended: () => finish("The live session expired. Resume following when ready."),
  });
  runtime.setLive(client);
  context.dispatch(liveConnecting({ session: metadata, presentationId }));
  const stop = () => {
    if (runtime.isCurrent(generation) && runtime.isLiveIntent(intent)) {
      runtime.cancelLive();
      context.dispatch(liveStopped());
    }
  };
  context.signal.addEventListener("abort", stop, { once: true });
  try {
    if (context.signal.aborted || !owned()) {
      stop();
      return fail({ status: "CANCELLED", message: "The live connection was cancelled." });
    }
    const connected = await client.connect();
    if (!runtime.isCurrent(generation) || !runtime.isLiveIntent(intent)) {
      return context.rejectWithValue({ status: "STALE_SESSION", message: "The live connection was superseded." });
    }
    return connected;
  } catch {
    return fail({
      status: context.signal.aborted ? "CANCELLED" : "NETWORK_ERROR",
      message: "The live session could not become ready.",
    });
  } finally {
    context.signal.removeEventListener("abort", stop);
  }
});

export function sendLivePcm(store: AppStore, pcm: ArrayBuffer | Uint8Array) {
  if (!store.resources.live) throw new Error("Connect a live session first.");
  store.resources.live.sendPcm(pcm);
}
export function updateLiveSnapshot(store: AppStore, snapshot: NavigationSnapshot) {
  if (!store.resources.live) throw new Error("Connect a live session first.");
  store.resources.live.updateSnapshot(snapshot);
  store.dispatch(liveUpdating());
}
export const stopLiveSession = createAsyncThunk<void, void, ApiThunkConfig>(
  "live/stop", (_, context) => {
    context.extra.cancelLive();
    context.dispatch(liveStopped());
  },
);
