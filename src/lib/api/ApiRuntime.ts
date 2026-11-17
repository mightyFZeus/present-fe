import type { AxiosInstance } from "axios";
import type { AuthState } from "@/features/auth/authSlice";
import type { LiveHandle } from "@/features/live/liveTypes";
import { axiosClient, getApiOrigin } from "./axiosClient";

export interface RuntimeOptions {
  client?: AxiosInstance;
  socketFactory?: (url: string) => WebSocket;
}

// Per-store infrastructure. None of these handles are Redux state or action data.
export class ApiRuntime {
  readonly client: AxiosInstance;
  readonly origin = getApiOrigin();
  readonly socketFactory: (url: string) => WebSocket;
  private getAuth?: () => AuthState;
  private controller = new AbortController();
  private timer?: ReturnType<typeof setTimeout>;
  private nextHandle = 0;
  private credentials = new Map<string, string>();
  private files = new Map<string, File>();
  private urls = new Map<string, string>();
  live?: LiveHandle;
  notifySignOut?: () => void;
  private liveIntent = 0;
  private sessionCleanups = new Set<() => void>();
  private liveCleanups = new Set<() => void>();

  constructor(options: RuntimeOptions = {}) {
    this.client = options.client ?? axiosClient;
    this.socketFactory = options.socketFactory ?? ((url) => new WebSocket(url));
  }

  bind(getAuth: () => AuthState) { this.getAuth = getAuth; }
  auth(): AuthState {
    if (!this.getAuth) throw new Error("API runtime is not attached to a store.");
    return this.getAuth();
  }
  isCurrent(generation: number) { return this.auth().generation === generation; }

  requestSignal(signal: AbortSignal) {
    const controller = new AbortController();
    const signals = [signal, this.controller.signal];
    const abort = () => controller.abort();
    for (const source of signals) {
      if (source.aborted) controller.abort();
      else source.addEventListener("abort", abort, { once: true });
    }
    return {
      signal: controller.signal,
      release: () => {
        for (const source of signals) source.removeEventListener("abort", abort);
      },
    };
  }

  putCredential(value: string) {
    const id = `credential-${++this.nextHandle}`;
    this.credentials.set(id, value);
    return id;
  }
  takeCredential(id: string) {
    const value = this.credentials.get(id);
    this.credentials.delete(id);
    return value;
  }
  putFile(file: File) {
    const id = `upload-${++this.nextHandle}`;
    this.files.set(id, file);
    return id;
  }
  takeFile(id: string) {
    const file = this.files.get(id);
    this.files.delete(id);
    return file;
  }

  replaceAsset(key: string, blob: Blob) {
    this.releaseAsset(key);
    const url = URL.createObjectURL(blob);
    this.urls.set(key, url);
    return url;
  }
  releaseAsset(key: string, expected?: string) {
    const url = this.urls.get(key);
    if (expected && url !== expected) return;
    if (url) URL.revokeObjectURL(url);
    this.urls.delete(key);
  }

  registerCleanup(kind: "session" | "live", cleanup: () => void) {
    const collection = kind === "session" ? this.sessionCleanups : this.liveCleanups;
    collection.add(cleanup);
    return () => { collection.delete(cleanup); };
  }

  beginLive() {
    this.cancelLive();
    return this.liveIntent;
  }
  isLiveIntent(intent: number) { return intent === this.liveIntent; }
  cancelLive() {
    this.liveIntent += 1;
    const previous = this.live;
    this.live = undefined;
    for (const cleanup of [...this.liveCleanups]) cleanup();
    previous?.close();
  }

  setLive(client: LiveHandle) {
    const previous = this.live;
    this.live = client;
    previous?.close();
  }

  armExpiry(expiresAt: number | null, expire: () => void) {
    if (this.timer) clearTimeout(this.timer);
    if (expiresAt === null) return;
    const generation = this.auth().generation;
    const check = () => {
      if (!this.isCurrent(generation)) return;
      const remaining = expiresAt - Date.now();
      if (remaining <= 0) expire();
      else this.timer = setTimeout(check, Math.min(remaining, 2_147_483_647));
    };
    this.timer = setTimeout(check, Math.max(0, Math.min(expiresAt - Date.now(), 2_147_483_647)));
  }

  reset() {
    this.controller.abort();
    this.controller = new AbortController();
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    this.cancelLive();
    for (const cleanup of [...this.sessionCleanups]) cleanup();
    for (const key of this.urls.keys()) this.releaseAsset(key);
    this.credentials.clear();
    this.files.clear();
  }
}
