import type { AppStore } from "@/store/store";
import type { WorkspaceController } from "./WorkspaceController";
import {
  presentationControlsHidden, presentationControlsShown, presentationEntered,
  presentationExited, presentationFullscreenChanged, presentationFullscreenError,
  selectPresentation,
} from "./presentationSlice";

interface Clock {
  later(callback: () => void, delay: number): ReturnType<typeof setTimeout>;
  cancel(handle: ReturnType<typeof setTimeout>): void;
  frame(callback: () => void): number;
  cancelFrame(handle: number): void;
}
interface FullscreenScope {
  root: HTMLElement;
  document: Document;
  token: object;
  operation: number;
  auth: number;
  deck: number;
}
const fullscreenOwner = Symbol.for("present.presentation.fullscreenOwner");
const browserClock: Clock = {
  later: (callback, delay) => setTimeout(callback, delay),
  cancel: (handle) => clearTimeout(handle),
  frame: (callback) => requestAnimationFrame(callback),
  cancelFrame: (handle) => cancelAnimationFrame(handle),
};
export class PresentationController {
  private root?: HTMLElement;
  private document?: Document;
  private unsubscribe?: () => void;
  private timer?: ReturnType<typeof setTimeout>;
  private focusFrame?: number;
  private wasActive = false;
  private syncing = false;
  private previousOverflow?: string;
  private returnTarget?: HTMLElement;
  private operation = 0;
  private lastAuth?: number;
  private lastDeck?: number;
  private lastMicStatus?: string;

  constructor(
    private store: AppStore,
    private workspace: WorkspaceController,
    private clock: Clock = browserClock,
  ) {}

  enter() { this.operation++; this.store.dispatch(presentationEntered()); }

  private scope(): FullscreenScope | undefined {
    if (!this.root || !this.document) return;
    const state = this.store.getState();
    return {
      root: this.root,
      document: this.document,
      token: {},
      operation: ++this.operation,
      auth: state.auth.generation,
      deck: state.workspace.deckIntent,
    };
  }
  private current(scope: FullscreenScope) {
    const state = this.store.getState();
    return this.root === scope.root && this.document === scope.document &&
      this.operation === scope.operation && selectPresentation(state).active &&
      state.auth.generation === scope.auth && state.workspace.deckIntent === scope.deck;
  }
  private cleanupStaleRequest(scope: FullscreenScope) {
    if (Reflect.get(scope.root, fullscreenOwner) === scope.token &&
        scope.document.fullscreenElement === scope.root) {
      void scope.document.exitFullscreen().catch(() => {});
    }
  }

  async exit() {
    this.operation++;
    this.workspace.capture.hold(undefined, true);
    const scope = this.scope();
    if (scope && scope.document.fullscreenElement === scope.root) {
      Reflect.set(scope.root, fullscreenOwner, scope.token);
      try { await scope.document.exitFullscreen(); }
      catch {
        if (this.current(scope)) this.store.dispatch(presentationFullscreenError("Use Escape to leave full screen, then return to the workspace."));
        return;
      }
      if (!this.current(scope)) return;
    }
    this.store.dispatch(presentationExited());
  }

  async toggleFullscreen() {
    if (!selectPresentation(this.store.getState()).active) return;
    const scope = this.scope();
    if (!scope) return;
    Reflect.set(scope.root, fullscreenOwner, scope.token);
    this.store.dispatch(presentationFullscreenError(null));
    const entering = scope.document.fullscreenElement !== scope.root;
    try {
      if (!entering) await scope.document.exitFullscreen();
      else if (typeof scope.root.requestFullscreen === "function") await scope.root.requestFullscreen();
      else throw new Error("Unsupported");
      if (!this.current(scope)) {
        if (entering) this.cleanupStaleRequest(scope);
        return;
      }
      this.fullscreenChanged();
    } catch {
      if (this.current(scope)) this.store.dispatch(presentationFullscreenError("Full screen is unavailable. Presentation view is still active."));
    }
  }

  attach(root: HTMLElement) {
    this.root = root;
    this.document = root.ownerDocument;
    root.addEventListener("pointermove", this.reveal);
    root.addEventListener("pointerdown", this.reveal);
    root.addEventListener("focusin", this.reveal);
    root.addEventListener("focusout", this.sync);
    this.document.addEventListener("keydown", this.keydown);
    this.document.addEventListener("fullscreenchange", this.fullscreenChanged);
    this.unsubscribe = this.store.subscribe(this.sync);
    this.fullscreenChanged();
    this.sync();
  }

  detach() {
    this.operation++;
    this.unsubscribe?.(); this.unsubscribe = undefined;
    this.clearTimer();
    if (this.focusFrame !== undefined) this.clock.cancelFrame(this.focusFrame);
    this.focusFrame = undefined;
    const root = this.root, document = this.document;
    root?.removeEventListener("pointermove", this.reveal);
    root?.removeEventListener("pointerdown", this.reveal);
    root?.removeEventListener("focusin", this.reveal);
    root?.removeEventListener("focusout", this.sync);
    document?.removeEventListener("keydown", this.keydown);
    document?.removeEventListener("fullscreenchange", this.fullscreenChanged);
    this.restoreOverflow();
    if (root && document?.fullscreenElement === root) void document.exitFullscreen().catch(() => {});
    this.root = undefined; this.document = undefined; this.wasActive = false;
  }

  private clearTimer() {
    if (this.timer !== undefined) this.clock.cancel(this.timer);
    this.timer = undefined;
  }
  private restoreOverflow() {
    if (this.previousOverflow !== undefined && this.document) {
      this.document.body.style.overflow = this.previousOverflow;
      this.previousOverflow = undefined;
    }
  }
  private canHide() {
    const state = this.store.getState();
    const view = selectPresentation(state);
    const toolbar = this.root?.querySelector("[data-presentation-controls]");
    return view.active && state.workspace.mic.status === "listening" &&
      !state.workspace.snapshot?.held &&
      !state.workspace.mic.error && !state.live.error && !view.fullscreenError &&
      !toolbar?.contains(this.document?.activeElement ?? null);
  }
  private canRestoreFocus(target?: HTMLElement | null): target is HTMLElement {
    return !!target && target !== this.document?.body && target !== this.document?.documentElement &&
      target.isConnected && target.tabIndex >= 0 && Reflect.get(target, "disabled") !== true &&
      target.getClientRects().length > 0;
  }
  private focus(callback: () => void) {
    if (this.focusFrame !== undefined) this.clock.cancelFrame(this.focusFrame);
    this.focusFrame = this.clock.frame(() => { this.focusFrame = undefined; callback(); });
  }
  private fullscreenChanged = () => {
    const active = selectPresentation(this.store.getState()).active;
    const owned = !!this.root && this.document?.fullscreenElement === this.root;
    if (!active && owned && this.document) void this.document.exitFullscreen().catch(() => {});
    this.store.dispatch(presentationFullscreenChanged(active && owned));
  };
  private keydown = (event: KeyboardEvent) => {
    if (this.root?.querySelector("[data-presenter-voice-dialog][open]")) return;
    const view = selectPresentation(this.store.getState());
    if (!view.active) return;
    const hiddenTab = event.key === "Tab" && !view.controlsVisible;
    if (hiddenTab) event.preventDefault();
    this.reveal();
    if (hiddenTab) {
      this.focus(() => {
        if (!selectPresentation(this.store.getState()).active) return;
        const toolbar = this.root?.querySelector<HTMLElement>("[data-presentation-controls]");
        const buttons = toolbar?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)");
        const target = event.shiftKey ? buttons?.[buttons.length - 1] : buttons?.[0];
        target?.focus();
      });
      return;
    }
    if (event.key !== "Escape") return;
    event.preventDefault();
    if (this.document?.fullscreenElement === this.root) void this.toggleFullscreen();
    else void this.exit();
  };
  private reveal = () => {
    this.clearTimer();
    if (selectPresentation(this.store.getState()).active) {
      this.store.dispatch(presentationControlsShown());
      this.sync();
    }
  };
  private sync = () => {
    if (this.syncing || !this.root || !this.document) return;
    this.syncing = true;
    try {
      const state = this.store.getState();
      const view = selectPresentation(state);
      if (state.workspace.mic.status === "listening" && this.lastMicStatus !== "listening") {
        this.operation++;
      }
      this.lastMicStatus = state.workspace.mic.status;
      if (this.lastAuth !== state.auth.generation || this.lastDeck !== state.workspace.deckIntent) {
        this.operation++;
        this.lastAuth = state.auth.generation;
        this.lastDeck = state.workspace.deckIntent;
      }
      if (view.active && !this.wasActive) {
        this.operation++;
        this.wasActive = true;
        const target = this.document.activeElement as HTMLElement | null;
        this.returnTarget = target && typeof target.focus === "function" ? target : undefined;
        this.previousOverflow = this.document.body.style.overflow;
        this.document.body.style.overflow = "hidden";
        this.focus(() => this.root?.querySelector<HTMLElement>(".slide-stage")?.focus());
      } else if (!view.active && this.wasActive) {
        this.operation++;
        this.wasActive = false;
        this.restoreOverflow();
        if (this.document.fullscreenElement === this.root) void this.document.exitFullscreen().catch(() => {});
        this.focus(() => {
          const entry = this.root?.querySelector<HTMLElement>("[data-presentation-entry]");
          const target = this.canRestoreFocus(this.returnTarget) ? this.returnTarget : entry;
          if (this.canRestoreFocus(target)) target.focus();
          if (this.document?.activeElement !== target) this.root?.focus();
        });
      }
      if (!this.canHide()) {
        this.clearTimer();
        if (!view.controlsVisible) this.store.dispatch(presentationControlsShown());
      } else if (view.controlsVisible && this.timer === undefined) {
        this.timer = this.clock.later(() => {
          this.timer = undefined;
          if (this.canHide()) this.store.dispatch(presentationControlsHidden());
        }, 2500);
      }
    } finally { this.syncing = false; }
  };
}
