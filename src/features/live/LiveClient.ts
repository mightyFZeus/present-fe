import type { LiveEvent, LiveHandle, LiveSessionMetadata, LiveSessionResponse, NavigationSnapshot } from "./liveTypes";
import { parseLiveEvent, validSnapshot } from "./liveValidationHelpers";

const MAX_BUFFERED_AUDIO_BYTES = 6400;
const AUDIO_BACKLOG_LIMIT_MS = 1000;
const SERVER_CLOSE_GRACE_MS = 500;
const CONNECTION_ENDED = "The live connection ended. Resume following when ready.";
const TRANSCRIPT_SAVE_FAILED = "Transcript saving stopped. Download the saved text, select Stop, then start a new session.";
const TRANSCRIPTION_UNAVAILABLE = "Speech recognition is unavailable. Resume following to try again.";

function closeMessage(code: number, reason: string): string {
  if (code === 1000 && reason === "presentation unavailable") {
    return "The server could not access this presentation. Reopen it and try again.";
  }
  if (code === 1008 && reason === "audio rate exceeded") {
    return "The server received audio too quickly. Resume following when ready.";
  }
  if (code === 1008 && reason === "input queue exceeded") {
    return "The server could not keep up with the audio. Resume following when ready.";
  }
  if (code === 1008 && reason === "invalid or premature audio") {
    return "The server could not accept the audio stream. Resume following when ready.";
  }
  if (code === 1011 && reason === "transcription unavailable") {
    return TRANSCRIPTION_UNAVAILABLE;
  }
  if (code === 1011 && reason === "transcript saving unavailable") return TRANSCRIPT_SAVE_FAILED;
  return CONNECTION_ENDED;
}

export interface LiveCallbacks {
  active(): boolean;
  event(event: LiveEvent): void;
  error(message: string): void;
  ended(): void;
}

export class LiveClient implements LiveHandle {
  readonly metadata: LiveSessionMetadata;
  private ticket?: string;
  private snapshot: NavigationSnapshot;
  private socket?: WebSocket;
  private epoch?: string;
  private generation = 0;
  private lastFinal = 0;
  private lastPublished = 0;
  private ready = false;
  private awaitingAck = false;
  private closed = false;
  private serverEnded = false;
  private authSent = false;
  private audioBlockedAt?: number;
  private timer?: ReturnType<typeof setTimeout>;
  private expiry?: ReturnType<typeof setTimeout>;
  private resolve?: (value: LiveSessionMetadata) => void;
  private reject?: (error: Error) => void;

  constructor(
    session: LiveSessionResponse,
    snapshot: NavigationSnapshot,
    private origin: string,
    private factory: (url: string) => WebSocket,
    private callbacks: LiveCallbacks,
  ) {
    const { ticket, ...metadata } = session;
    this.ticket = ticket;
    this.metadata = metadata;
    this.snapshot = structuredClone(snapshot);
  }

  connect(): Promise<LiveSessionMetadata> {
    return new Promise((resolve, reject) => {
      if (this.closed || !this.callbacks.active() || Date.parse(this.metadata.expiresAt) <= Date.now()) {
        reject(new Error("The live connection is no longer active.")); return;
      }
      this.resolve = resolve; this.reject = reject;
      const url = new URL(this.metadata.wsPath, this.origin);
      if (url.origin !== this.origin || url.search || url.hash || url.username || url.password ||
          url.pathname !== `/v1/live-sessions/${this.metadata.sessionId}/stream` || !validSnapshot(this.snapshot)) {
        this.fail("Invalid live connection configuration."); return;
      }
      url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
      try { this.socket = this.factory(url.toString()); }
      catch { this.fail("The live connection could not be opened."); return; }
      this.timeout(Math.min(10_000, Date.parse(this.metadata.ticketExpiresAt) - Date.now()));
      this.socket.onopen = () => {
        if (!this.callbacks.active() || Date.parse(this.metadata.ticketExpiresAt) <= Date.now()) {
          this.fail("The live ticket expired."); return;
        }
        try {
          // Sent immediately on open, never in a URL or Redux result.
          this.socket!.send(JSON.stringify({ type: "auth", ticket: this.ticket, snapshot: this.snapshot }));
          this.ticket = undefined;
          this.authSent = true;
          this.timeout(20_000);
        } catch { this.fail("Live authentication could not be sent."); }
      };
      this.socket.onmessage = (event) => this.receive(event.data);
      this.socket.onerror = () => {
        if (!this.serverEnded) this.fail("The live connection is unavailable.");
      };
      this.socket.onclose = ({ code, reason }) => this.fail(closeMessage(code, reason));
      this.expiry = setTimeout(() => {
        if (!this.closed && this.callbacks.active()) this.callbacks.ended();
        this.close();
      }, Math.max(0, Date.parse(this.metadata.expiresAt) - Date.now()));
    });
  }

  private timeout(milliseconds: number) {
    if (this.timer) clearTimeout(this.timer);
    const remaining = Date.parse(this.metadata.expiresAt) - Date.now();
    this.timer = setTimeout(() => this.fail("Live readiness timed out."), Math.max(0, Math.min(milliseconds, remaining)));
  }

  private usable() {
    if (this.closed) return false;
    if (!this.callbacks.active()) { this.close(); return false; }
    if (Date.parse(this.metadata.expiresAt) <= Date.now()) {
      this.callbacks.ended(); this.close(); return false;
    }
    return true;
  }

  private receive(data: unknown) {
    if (this.serverEnded || !this.usable()) return;
    const event = parseLiveEvent(data);
    if (!event) { this.fail("The live server sent an invalid event."); return; }
    if (event.sessionId !== this.metadata.sessionId || (this.epoch && event.epoch !== this.epoch)) return;
    if (event.version !== this.snapshot.version) return;
    if (!this.epoch) {
      if (!["ready", "error", "ended"].includes(event.type)) { this.fail("Live readiness is required."); return; }
      this.epoch = event.epoch;
      if (event.type === "error" || event.type === "ended") this.generation = event.generation;
    }
    if (event.type === "stateAck") {
      if (!this.awaitingAck || event.generation !== this.generation + 1 || event.acceptsAudio) return;
      this.generation = event.generation;
      this.awaitingAck = false;
      this.callbacks.event(event);
      return;
    }
    if (event.type === "ready") {
      if (this.awaitingAck || (this.generation !== 0 && event.generation !== this.generation) ||
          event.held !== this.snapshot.held || event.acceptsAudio !== !event.held) return;
      this.generation = event.generation; this.ready = true;
      if (this.timer) clearTimeout(this.timer);
      this.callbacks.event(event);
      this.resolve?.(this.metadata); this.resolve = undefined; this.reject = undefined;
      return;
    }
    if (event.generation !== this.generation) return;
    if (event.type === "transcript") {
      if (!this.ready || this.snapshot.held || event.transcriptSeq < this.lastFinal) return;
      if (event.isFinal) {
        if (event.transcriptSeq <= this.lastFinal) return;
        this.lastFinal = event.transcriptSeq;
      }
    }
    if (event.type === "proposal") {
      if (!this.ready || this.snapshot.held || event.transcriptSeq <= this.lastPublished) return;
      // A valid active result can precede newer pending speech: do not compare to lastFinal.
      this.lastPublished = event.transcriptSeq;
    }
    if (event.type === "error" && !event.acceptsAudio) {
      this.serverEnded = true;
      this.ready = false;
      this.fail(event.code === "transcription_unavailable" ? TRANSCRIPTION_UNAVAILABLE :
        event.code === "transcript_save_failed" ? TRANSCRIPT_SAVE_FAILED : CONNECTION_ENDED);
      return;
    }
    if (event.type === "ended") {
      this.serverEnded = true;
      this.ready = false;
      this.clearTimers();
      // The server sends the close frame with its reason after this event.
      this.timer = setTimeout(() => this.fail(CONNECTION_ENDED), SERVER_CLOSE_GRACE_MS);
    }
    this.callbacks.event(event);
  }

  updateSnapshot(snapshot: NavigationSnapshot) {
    if (!this.usable() || !this.ready || !this.socket || this.socket.readyState !== 1 || !validSnapshot(snapshot) ||
        snapshot.version <= this.snapshot.version) throw new Error("A ready session and increasing valid snapshot are required.");
    this.ready = false; this.awaitingAck = true; this.snapshot = structuredClone(snapshot);
    this.audioBlockedAt = undefined;
    this.socket.send(JSON.stringify({ type: "state", snapshot: this.snapshot }));
    this.timeout(20_000);
  }

  sendPcm(data: ArrayBuffer | Uint8Array) {
    if (!this.usable() || !this.ready || this.snapshot.held || !this.socket) throw new Error("Audio is not currently accepted.");
    // The native socket can start closing before it delivers the close event.
    if (this.socket.readyState !== 1) return;
    if (!(data instanceof ArrayBuffer) && !(data instanceof Uint8Array)) throw new Error("PCM bytes are required.");
    const length = data.byteLength;
    if (!length || length > 3200 || length % 2) throw new Error("Audio must be nonempty PCM16 frames of at most 3200 bytes.");
    if (this.socket.bufferedAmount + length > MAX_BUFFERED_AUDIO_BYTES) {
      const now = performance.now();
      this.audioBlockedAt ??= now;
      if (now - this.audioBlockedAt >= AUDIO_BACKLOG_LIMIT_MS) {
        this.fail("The connection could not keep up with the audio. Resume following when ready.");
        throw new Error("Audio buffer exceeded.");
      }
      // Drop the current audio frame. Sending it later would replay old speech.
      return;
    }
    this.audioBlockedAt = undefined;
    const bytes = data instanceof ArrayBuffer ? data.slice(0) : Uint8Array.from(data).buffer;
    this.socket.send(bytes);
  }

  private clearTimers() {
    if (this.timer) clearTimeout(this.timer);
    if (this.expiry) clearTimeout(this.expiry);
  }
  private fail(message: string) {
    if (this.closed) return;
    this.reject?.(new Error(message)); this.reject = undefined;
    if (this.callbacks.active()) this.callbacks.error(message);
    this.close();
  }
  close() {
    if (this.closed) return;
    this.closed = true; this.ready = false; this.ticket = undefined; this.clearTimers();
    this.reject?.(new Error("The live connection ended.")); this.reject = undefined;
    if (this.socket) {
      this.socket.onopen = null; this.socket.onmessage = null;
      this.socket.onerror = null; this.socket.onclose = null;
      if (this.socket.readyState === 1 && this.authSent && !this.serverEnded) {
        try { this.socket.send(JSON.stringify({ type: "stop" })); } catch { /* Closing is best effort. */ }
      }
      try { this.socket.close(1000, "Session ended"); } catch { /* Already closed. */ }
    }
  }
}
