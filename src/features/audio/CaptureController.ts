import type { AppStore } from "@/store/store";
import { connectLiveSession, sendLivePcm, stopLiveSession } from "@/features/live/liveThunks";
import { sessionCleared } from "@/features/auth/authSlice";
import { presentationsApi } from "@/features/presentations/presentationsApi";
import { micChanged, micLevel, snapshotChanged } from "@/features/workspace/workspaceSlice";

export interface CaptureEnvironment {
  context(): AudioContext;
  media(): Promise<MediaStream>;
  worklet(context: AudioContext): AudioWorkletNode;
}
const browserEnvironment: CaptureEnvironment = {
  context: () => new AudioContext(),
  media: () => navigator.mediaDevices.getUserMedia({ audio: { channelCount: { ideal: 1 }, echoCancellation: true, noiseSuppression: true }, video: false }),
  worklet: (context) => new AudioWorkletNode(context, "present-capture", { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1] }),
};
interface Operation {
  context: AudioContext;
  auth: number;
  deck: number;
  version: number;
  cancelled: boolean;
  listening: boolean;
  revision: string;
  stream?: MediaStream;
  sessionId?: string;
  source?: MediaStreamAudioSourceNode;
  node?: AudioWorkletNode;
  gain?: GainNode;
  abort?: () => void;
  unbindSession?: () => void;
  unbindLive?: () => void;
}

export class CaptureController {
  private operation?: Operation;
  private unsubscribe?: () => void;
  constructor(private store: AppStore, private environment = browserEnvironment) {}
  attach() { this.unsubscribe?.(); this.unsubscribe = this.store.subscribe(() => this.sync()); }
  detach(stopTransport = true) {
    this.unsubscribe?.();
    this.unsubscribe = undefined;
    if (stopTransport) this.stop();
    else if (this.operation) this.dispose(this.operation);
  }

  private owned(op: Operation) {
    const state = this.store.getState();
    return this.operation === op && !op.cancelled && state.auth.generation === op.auth &&
      state.workspace.deckIntent === op.deck && !!state.auth.accessToken &&
      !!state.auth.expiresAt && state.auth.expiresAt > Date.now() &&
      (!op.sessionId || (state.live.session?.sessionId === op.sessionId && Date.parse(state.live.session.expiresAt) > Date.now()));
  }
  private valid(op: Operation) {
    if (this.owned(op)) return true;
    this.dispose(op, false);
    const auth = this.store.getState().auth;
    if (auth.accessToken && auth.expiresAt && auth.expiresAt <= Date.now()) this.store.dispatch(sessionCleared({ reason: "Session expired." }));
    return false;
  }
  private dispose(op: Operation, abortConnection = true) {
    if (op.cancelled) return;
    op.cancelled = true;
    if (this.operation === op) this.operation = undefined;
    op.unbindLive?.(); op.unbindSession?.();
    for (const track of op.stream?.getTracks() ?? []) { track.onended = null; track.stop(); }
    if (abortConnection) op.abort?.();
    if (op.node) {
      op.node.port.onmessage = null; op.node.onprocessorerror = null;
      try { op.node.port.postMessage({ type: "revision", enabled: false, revision: "stopped" }); op.node.disconnect(); } catch { /* Closing graph. */ }
    }
    try { op.source?.disconnect(); op.gain?.disconnect(); } catch { /* Closing graph. */ }
    op.context.onstatechange = null;
    void op.context.close().catch(() => {});
  }
  private externalStop(op: Operation, awaitingClose = false) {
    const state = this.store.getState();
    const active = this.operation === op && !op.cancelled &&
      state.auth.generation === op.auth && state.workspace.deckIntent === op.deck &&
      !!state.auth.accessToken && (!op.sessionId || state.live.session?.sessionId === op.sessionId);
    this.dispose(op, false);
    if (!active) return;
    if (state.auth.expiresAt && state.auth.expiresAt <= Date.now()) {
      this.store.dispatch(sessionCleared({ reason: "Session expired." }));
      return;
    }
    this.markHeld();
    const current = this.store.getState();
    if (this.operation || current.auth.generation !== op.auth || current.workspace.deckIntent !== op.deck) return;
    const error = awaitingClose ? undefined :
      (state.live.status === "error" && state.live.error) ||
      "The live connection ended. Start following when you are ready.";
    this.store.dispatch(micChanged({ status: "error", error }));
  }
  private markHeld() {
    const s = this.store.getState().workspace.snapshot;
    if (s && !s.held) this.store.dispatch(snapshotChanged({ snapshot: { ...s, held: true, version: s.version + 1 }, source: "control", at: Date.now() }));
  }

  // Warm the context in the click; acquire muted permission before opening a paid stream.
  async start() {
    const state = this.store.getState();
    const deck = state.workspace.deck; const snapshot = state.workspace.snapshot;
    const ready = deck ? presentationsApi.endpoints.getPresentation.select(deck.id)(state).data?.status === "ready" : false;
    if (!state.auth.accessToken || !ready || !deck || !snapshot) return;
    if (this.operation) this.dispose(this.operation);
    void this.store.dispatch(stopLiveSession());
    let context: AudioContext;
    try { context = this.environment.context(); }
    catch { this.store.dispatch(micChanged({ status: "error", error: "This browser cannot start audio capture." })); return; }
    const warming = context.resume().then(() => true, () => false);
    const next = { ...snapshot, held: false, version: snapshot.version + 1 };
    this.store.dispatch(snapshotChanged({ snapshot: next, source: "control", at: Date.now() }));
    const op: Operation = { context, auth: state.auth.generation, deck: state.workspace.deckIntent, version: next.version, cancelled: false, listening: false, revision: "" };
    this.operation = op;
    op.unbindSession = this.store.resources.registerCleanup("session", () => this.externalStop(op));
    op.unbindLive = this.store.resources.registerCleanup("live", () => this.externalStop(op));
    this.store.dispatch(micChanged({ status: "permission" }));
    try {
      if (!await warming || !this.valid(op)) throw new Error("Audio could not be resumed.");
      const stream = await this.environment.media();
      if (!this.valid(op)) { for (const track of stream.getTracks()) track.stop(); return; }
      op.stream = stream;
      for (const track of stream.getTracks()) {
        track.enabled = false;
        track.onended = () => { if (this.valid(op)) this.hold("Your microphone disconnected. Start again when it is available.", true); };
      }
      // Our own beginLive invalidates previous streams. Keep session cleanup bound,
      // then rebind this operation's live cleanup immediately after that transition.
      op.unbindLive?.(); op.unbindLive = undefined;
      this.store.dispatch(micChanged({ status: "connecting" }));
      const connection = this.store.dispatch(connectLiveSession({ presentationId: deck.id, snapshot: next }));
      op.abort = connection.abort;
      if (!this.valid(op)) { connection.abort(); return; }
      op.unbindLive = this.store.resources.registerCleanup("live", () => this.externalStop(op));
      const session = await connection.unwrap();
      if (!this.valid(op)) return;
      op.sessionId = session.sessionId;
      await context.audioWorklet.addModule("/audio/present-capture-worklet.mjs");
      if (!this.valid(op)) return;
      op.node = this.environment.worklet(context);
      op.source = context.createMediaStreamSource(stream);
      op.gain = context.createGain(); op.gain.gain.value = 0;
      op.node.port.onmessage = ({ data }) => this.message(op, data);
      op.node.onprocessorerror = () => { if (this.valid(op)) this.hold("Audio processing stopped. Start following again.", true); };
      context.onstatechange = () => { if (this.valid(op) && op.listening && context.state !== "running") this.hold("Audio was paused by the browser. Resume when ready.", true); };
      op.source.connect(op.node); op.node.connect(op.gain); op.gain.connect(context.destination);
      if (context.state !== "running" || !this.valid(op)) throw new Error("Audio is not active.");
      for (const track of stream.getTracks()) track.enabled = true;
      op.listening = true;
      this.store.dispatch(micChanged({ status: "listening" })); this.sync();
    } catch (error: unknown) {
      if (!this.valid(op)) return;
      const denied = error instanceof DOMException && error.name === "NotAllowedError";
      this.dispose(op); void this.store.dispatch(stopLiveSession()); this.markHeld();
      this.store.dispatch(micChanged({ status: "error", error: denied ? "Microphone permission was denied. Allow access in your browser, then try again." : "Following could not start. Check microphone access and the live connection, then try again." }));
    }
  }

  private message(op: Operation, data: unknown) {
    if (!this.valid(op) || !op.listening || typeof data !== "object" || data === null) return;
    const value = data as { type?: string; revision?: string; buffer?: ArrayBuffer; time?: number; rms?: number };
    const state = this.store.getState(); const s = state.workspace.snapshot; const live = state.live;
    if (value.revision !== op.revision || !s || s.held || live.status !== "ready" ||
        !live.acceptsAudio || live.version !== s.version || live.presentationId !== state.workspace.deck?.id) return;
    if (value.type === "level" && typeof value.rms === "number" && Number.isFinite(value.rms)) {
      this.store.dispatch(micLevel(Math.min(1, Math.max(0, value.rms * 3))));
    }
    if (value.type === "pcm" && value.buffer instanceof ArrayBuffer &&
        typeof value.time === "number" && op.context.currentTime - value.time <= 0.2) {
      try { sendLivePcm(this.store, value.buffer); }
      catch {
        if (this.valid(op)) this.hold("The connection could not keep up. Resume when it is stable.", true);
      }
    }
  }

  sync() {
    const op = this.operation; if (!op) return;
    const state = this.store.getState(); const s = state.workspace.snapshot; const live = state.live;
    if (op.sessionId && live.session?.sessionId === op.sessionId &&
        (live.status === "ended" || live.status === "error")) {
      this.externalStop(op, live.status === "ended");
      return;
    }
    if (!this.valid(op)) return;
    if (!op.listening && s?.version !== op.version) { this.hold("Following paused after navigation. Start again when ready.", true); return; }
    if (!op.node || !s) return;
    const enabled = live.status === "ready" && live.acceptsAudio && !s.held &&
      live.version === s.version && live.presentationId === state.workspace.deck?.id;
    const revision = `${live.session?.sessionId ?? "none"}:${live.generation}:${s.version}:${enabled}`;
    if (revision !== op.revision) {
      op.revision = revision;
      op.node.port.postMessage({ type: "revision", revision, enabled });
      if (!enabled) this.store.dispatch(micLevel(0));
    }
  }

  hold(message?: string, closeTransport = false) {
    const pending = this.operation && !this.operation.listening;
    if (this.operation) this.dispose(this.operation);
    if (closeTransport || pending || this.store.getState().live.status !== "ready") void this.store.dispatch(stopLiveSession());
    this.markHeld();
    this.store.dispatch(micChanged({ status: "held", error: message }));
  }
  stop() {
    if (this.operation) this.dispose(this.operation);
    void this.store.dispatch(stopLiveSession()); this.markHeld();
    this.store.dispatch(micChanged({ status: "off" }));
  }
}
