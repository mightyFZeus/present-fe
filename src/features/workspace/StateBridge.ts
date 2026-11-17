import type { AppStore } from "@/store/store";
import type { PresentationSlide } from "@/features/presentations/presentationTypes";
import { updateLiveSnapshot, stopLiveSession } from "@/features/live/liveThunks";
import { proposalSnapshot } from "./navigationHelpers";
import { micChanged, proposalHandled, snapshotChanged } from "./workspaceSlice";

// One latest snapshot is read from Redux when the server becomes ready again.
export class StateBridge {
  private unsubscribe?: () => void;
  private busy = false;
  private slides: PresentationSlide[] = [];
  constructor(private store: AppStore) {}
  setSlides(slides: PresentationSlide[]) { this.slides = slides; this.sync(); }
  attach() { this.unsubscribe?.(); this.unsubscribe = this.store.subscribe(() => this.sync()); this.sync(); }
  detach() { this.unsubscribe?.(); this.unsubscribe = undefined; }
  sync() {
    if (this.busy) return;
    this.busy = true;
    try {
      let state = this.store.getState();
      const { workspace: w, live } = state;
      const s = w.snapshot;
      const session = live.session?.sessionId;
      if (session && live.proposal && (w.handledSession !== session || live.publishedSeq > w.handledSequence)) {
        this.store.dispatch(proposalHandled({ session, sequence: live.publishedSeq }));
        const now = Date.now();
        if (state.auth.accessToken && s && w.deck?.id === live.presentationId &&
            w.mic.status === "listening" && live.status === "ready" && !live.held &&
            live.epoch && live.version === s.version && live.generation > 0 &&
            now - w.lastManualAt >= 1500 && now - w.lastAutoAt >= 1500) {
          const next = proposalSnapshot(s, live.proposal, this.slides);
          if (next !== s) this.store.dispatch(snapshotChanged({ snapshot: next, source: "auto", at: now }));
        }
      }
      state = this.store.getState();
      const current = state.workspace.snapshot;
      if (current && state.workspace.deck?.id === state.live.presentationId &&
          state.live.status === "ready" && state.live.version < current.version && this.store.resources.live) {
        try { updateLiveSnapshot(this.store, current); }
        catch {
          void this.store.dispatch(stopLiveSession());
          if (!current.held) this.store.dispatch(snapshotChanged({ snapshot: { ...current, held: true, version: current.version + 1 }, source: "control", at: Date.now() }));
          this.store.dispatch(micChanged({ status: "error", error: "The live connection ended. Start following again when ready." }));
        }
      }
    } finally { this.busy = false; }
  }
}
