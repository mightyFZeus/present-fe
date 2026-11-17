import type { AppStore } from "@/store/store";
import { sessionCleared } from "./authSlice";
import { restoreSession } from "./authThunks";

interface LogoutChannel {
  onmessage: ((event: MessageEvent) => void) | null;
  postMessage(value: unknown): void;
  close(): void;
}
interface SessionOptions { channel?: () => LogoutChannel | undefined }
const owners = new WeakMap<AppStore, AuthSessionController>();

// Provider lifecycle owns only local restoration and non-secret logout signals.
// Teardown never calls the server logout endpoint (including Strict Mode replay).
export class AuthSessionController {
  private attached = false;
  private channel?: LogoutChannel;
  constructor(private store: AppStore, private options: SessionOptions = {}) {}
  attach() {
    if (this.attached) return;
    this.attached = true;
    owners.set(this.store, this);
    this.store.resources.notifySignOut = () => this.broadcast();
    try {
      this.channel = this.options.channel ? this.options.channel() :
        typeof window !== "undefined" && typeof BroadcastChannel !== "undefined"
          ? new BroadcastChannel("present-auth-logout") : undefined;
      if (this.channel) this.channel.onmessage = (event) => {
        if (this.attached && event.data === "logout") {
          this.store.dispatch(sessionCleared({ signedOut: true }));
        }
      };
    } catch { this.channel = undefined; }
    const auth = this.store.getState().auth;
    if (!auth.accessToken && !auth.signedOut) void this.store.dispatch(restoreSession());
  }
  broadcast() {
    try { this.channel?.postMessage("logout"); } catch { /* Local cleanup still succeeds. */ }
  }
  detach() {
    if (!this.attached) return;
    this.attached = false;
    this.channel?.close();
    this.channel = undefined;
    if (owners.get(this.store) === this) {
      owners.delete(this.store);
      this.store.resources.notifySignOut = undefined;
    }
    const signedOut = this.store.getState().auth.signedOut;
    // Strict Mode can replay the child's route effect before provider reattach.
    // Clear private resources immediately, but keep local restoration pending so
    // a valid protected descendant is not redirected through login and lost.
    this.store.dispatch(sessionCleared({ signedOut, bootstrapPending: !signedOut }));
  }
}
