import type { AppStore } from "@/store/store";
import { uploadPresentation } from "@/features/presentations/presentationThunks";
import type { PresentationSlide, PresentationSummary } from "@/features/presentations/presentationTypes";
import { presentationsApi } from "@/features/presentations/presentationsApi";
import { uuid } from "@/lib/api/responseHelpers";
import { liveReset } from "@/features/live/liveSlice";
import { CaptureController } from "@/features/audio/CaptureController";
import { SlideAssets } from "./SlideAssets";
import { StateBridge } from "./StateBridge";
import { initialSnapshot, manualSlide } from "./navigationHelpers";
import { latestPresentationLabel } from "./libraryHelpers";
import { deckCleared, savedPresentationDeleted, savedPresentationRenamed, savedMutationStarted, savedMutationFinished, deckSelected, snapshotChanged, uploadStarted, uploadFinished, uploadFailed, uploadCancelled } from "./workspaceSlice";

export interface SavedDeletionBatch {
  deleted: string[];
  failed: { id: string; message: string }[];
  unattempted: string[];
  stopped: boolean;
}

export class WorkspaceController {
  readonly assets: SlideAssets;
  readonly capture: CaptureController;
  readonly bridge: StateBridge;
  private slides: PresentationSlide[] = [];
  private uploadTask?: { abort(): void };
  private unbind?: () => void;
  private mutations = new Map<string, { abort(): void }>();
  constructor(private store: AppStore) {
    this.assets = new SlideAssets(store); this.capture = new CaptureController(store); this.bridge = new StateBridge(store);
  }
  private hidden = () => { if (document.hidden && ["connecting", "permission", "listening"].includes(this.store.getState().workspace.mic.status)) this.capture.hold("Following paused while this tab is hidden.", true); };
  private pagehide = () => this.capture.hold(undefined, true);
  attach() {
    this.assets.attach(); this.capture.attach(); this.bridge.attach();
    this.unbind?.(); this.unbind = this.store.resources.registerCleanup("session", () => { this.cancelUpload(); this.abortMutations(); this.slides = []; this.bridge.setSlides([]); });
    if (typeof document !== "undefined") document.addEventListener("visibilitychange", this.hidden);
    if (typeof window !== "undefined") window.addEventListener("pagehide", this.pagehide);
  }
  detach(preserveCurrentSession = false) {
    this.unbind?.(); this.unbind = undefined; this.cancelUpload();
    // Route changes leave CRUD requests alive. Auth reset still aborts all HTTP
    // work through ApiRuntime, while request-ID locks survive controller instances.
    this.bridge.detach(); this.assets.detach(); this.capture.detach(!preserveCurrentSession);
    if (typeof document !== "undefined") document.removeEventListener("visibilitychange", this.hidden);
    if (typeof window !== "undefined") window.removeEventListener("pagehide", this.pagehide);
  }
  setSlides(deck: string, slides: PresentationSlide[], intent: number) {
    const w = this.store.getState().workspace;
    if (w.deck?.id !== deck || w.deckIntent !== intent) return;
    this.slides = slides; this.bridge.setSlides(slides);
    if (!w.snapshot) {
      const snapshot = initialSnapshot(slides);
      if (snapshot) this.store.dispatch(snapshotChanged({ snapshot, source: "control", at: Date.now() }));
    }
    this.assets.load(deck, slides, intent);
  }
  navigate(id: string) {
    const s = this.store.getState().workspace.snapshot;
    if (!s) return;
    const next = manualSlide(s, id, this.slides);
    if (next !== s) this.store.dispatch(snapshotChanged({ snapshot: next, source: "manual", at: Date.now() }));
  }
  openSaved(presentation: Pick<PresentationSummary, "id" | "filename" | "updatedAt">) {
    if (!this.store.getState().auth.accessToken) return;
    this.ensureSavedAvailable(presentation.id);
    const change = this.store.getState().workspace.savedChanges[presentation.id];
    this.cancelUpload();
    this.capture.stop();
    this.assets.clear();
    this.slides = [];
    this.bridge.setSlides([]);
    this.store.dispatch(liveReset());
    const cached = presentationsApi.endpoints.getPresentation.select(presentation.id)(this.store.getState()).data;
    const label = latestPresentationLabel(presentation, cached, change && !("deleted" in change) ? change : undefined);
    this.store.dispatch(deckSelected({
      id: presentation.id,
      filename: label.filename,
      updatedAt: label.updatedAt,
    }));
  }

  async renameSaved(id: string, filename: string) {
    const { generation, requestId } = this.beginSavedMutation(id, "rename");
    const task = this.store.dispatch(presentationsApi.endpoints.renamePresentation.initiate({
      presentationId: id,
      filename,
    }));
    this.mutations.set(id, task);
    try {
      const presentation = await task.unwrap();
      if (this.store.getState().auth.generation === generation) {
        void this.store.dispatch(presentationsApi.util.upsertQueryData("getPresentation", id, presentation));
        this.store.dispatch(presentationsApi.util.updateQueryData("listPresentations", undefined, (draft) => {
          for (const page of draft.pages) {
            const saved = page.presentations.find((row) => row.id === id);
            if (saved) {
              saved.filename = presentation.filename;
              saved.updatedAt = presentation.updatedAt;
            }
          }
        }));
        this.store.dispatch(savedPresentationRenamed({
          id,
          filename: presentation.filename,
          updatedAt: presentation.updatedAt,
        }));
      }
      return presentation;
    } finally {
      if (this.mutations.get(id) === task) this.mutations.delete(id);
      this.store.dispatch(savedMutationFinished({ id, requestId }));
      task.reset();
    }
  }

  async deleteSaved(id: string) {
    const { generation, requestId } = this.beginSavedMutation(id, "delete");
    const task = this.store.dispatch(presentationsApi.endpoints.deletePresentation.initiate(id));
    this.mutations.set(id, task);
    try {
      await task.unwrap();
      const state = this.store.getState();
      if (state.auth.generation !== generation) return;
      this.store.dispatch(savedPresentationDeleted(id));
      this.store.dispatch(presentationsApi.util.updateQueryData("listPresentations", undefined, (draft) => {
        for (const page of draft.pages) {
          page.presentations = page.presentations.filter((row) => row.id !== id);
        }
      }));
      if (state.workspace.deck?.id !== id) return;
      this.capture.stop();
      this.assets.clear();
      this.slides = [];
      this.bridge.setSlides([]);
      this.store.dispatch(liveReset());
      this.store.dispatch(deckCleared(id));
    } finally {
      if (this.mutations.get(id) === task) this.mutations.delete(id);
      this.store.dispatch(savedMutationFinished({ id, requestId }));
      task.reset();
    }
  }

  async deleteSavedMany(
    selectedIds: readonly string[],
    canStart: () => boolean,
    onProgress?: (completed: number) => void,
  ): Promise<SavedDeletionBatch> {
    const ids = [...new Set(selectedIds)];
    const generation = this.store.getState().auth.generation;
    const result: SavedDeletionBatch = {
      deleted: [],
      failed: [],
      unattempted: [],
      stopped: false,
    };
    let attempted = 0;
    const sameAccount = () => this.store.getState().auth.generation === generation &&
      !!this.store.getState().auth.accessToken;
    for (const id of ids) {
      if (!sameAccount() || !canStart()) {
        result.stopped = true;
        break;
      }
      attempted += 1;
      try {
        // Sequential requests reuse per-store locks and confirmed tombstones.
        await this.deleteSaved(id);
        if (!sameAccount()) {
          result.stopped = true;
          break;
        }
        result.deleted.push(id);
      } catch (error) {
        if (!sameAccount()) {
          result.stopped = true;
          break;
        }
        const message = typeof error === "object" && error !== null && "message" in error &&
          typeof error.message === "string" ?
            error.message : "The presentation could not be deleted.";
        result.failed.push({
          id,
          message,
        });
      }
      if (canStart()) onProgress?.(attempted);
    }
    result.unattempted = ids.slice(attempted);
    return result;
  }

  ensureSavedAvailable(id: string) {
    if (!this.store.getState().auth.accessToken) throw new Error("Sign in to continue.");
    uuid(id);
    const change = this.store.getState().workspace.savedChanges[id];
    if (change && "deleted" in change) throw new Error("This presentation was deleted.");
  }

  private beginSavedMutation(id: string, kind: "rename" | "delete") {
    this.ensureSavedAvailable(id);
    if (this.store.getState().workspace.savedPending[id]) {
      throw new Error("Wait for this presentation's current action to finish.");
    }
    const generation = this.store.getState().auth.generation;
    const requestId = crypto.randomUUID();
    this.store.dispatch(savedMutationStarted({ id, requestId, kind }));
    return { generation, requestId };
  }

  leavePresentation(id: string, intent: number, generation: number) {
    const state = this.store.getState();
    if (state.auth.generation !== generation || state.workspace.deck?.id !== id ||
      state.workspace.deckIntent !== intent) return false;
    this.capture.stop();
    this.assets.clear();
    this.slides = [];
    this.bridge.setSlides([]);
    this.store.dispatch(liveReset());
    this.store.dispatch(deckCleared(id));
    return true;
  }

  clearSelection() {
    const state = this.store.getState();
    if (state.workspace.deck) {
      this.leavePresentation(state.workspace.deck.id, state.workspace.deckIntent, state.auth.generation);
    }
  }

  private abortMutations() {
    for (const task of this.mutations.values()) task.abort();
    this.mutations.clear();
  }

  async upload(file: File) {
    if (!this.store.getState().auth.accessToken) return;
    this.cancelUpload(); this.capture.hold();
    this.store.dispatch(uploadStarted());
    const state = this.store.getState(); const intent = state.workspace.upload.intent; const auth = state.auth.generation;
    const task = uploadPresentation(this.store, file); this.uploadTask = task;
    const current = () => this.store.getState().auth.generation === auth && this.store.getState().workspace.upload.intent === intent;
    try {
      const presentation = await task.unwrap();
      if (!current()) return;
      this.assets.clear(); this.slides = []; this.capture.stop();
      this.store.dispatch(deckSelected({ id: presentation.id, filename: presentation.filename }));
      this.store.dispatch(uploadFinished());
      return presentation;
    } catch (error: unknown) {
      if (!current()) return;
      const message = typeof error === "object" && error !== null && "message" in error && typeof error.message === "string" ? error.message : "The presentation could not be uploaded.";
      this.store.dispatch(uploadFailed(message));
    } finally { if (this.uploadTask === task) this.uploadTask = undefined; }
  }
  cancelUpload() {
    this.uploadTask?.abort(); this.uploadTask = undefined;
    this.store.dispatch(uploadCancelled());
  }
}
