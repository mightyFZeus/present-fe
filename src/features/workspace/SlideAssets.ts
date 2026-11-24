import type { AppStore } from "@/store/store";
import type { PresentationSlide, AssetResource } from "@/features/presentations/presentationTypes";
import { loadSlideImage, releaseAsset } from "@/features/presentations/presentationThunks";
import { presentationPath, uuid } from "@/lib/api/responseHelpers";
import { imageChanged } from "./workspaceSlice";

interface Entry { id: string; key: string; deck: string; intent: number; resource?: AssetResource; abort?: () => void }
export class SlideAssets {
  private records = new Map<string, Entry>();
  private queue: Entry[] = [];
  private workers = 0;
  private unbind?: () => void;
  constructor(private store: AppStore) {}
  attach() { this.unbind?.(); this.unbind = this.store.resources.registerCleanup("session", () => this.clear()); }
  detach() { this.unbind?.(); this.unbind = undefined; this.clear(); }
  load(deck: string, slides: PresentationSlide[], intent: number) {
    if ([...this.records.values()].every((entry) => entry.deck === deck && entry.intent === intent) && this.records.size === slides.length) return;
    this.clear();
    for (const slide of slides) this.enqueue(deck, slide.id, intent);
    this.drain();
  }
  retry(deck: string, id: string, intent: number) {
    const previous = this.records.get(id);
    if (!previous || !this.current(previous) || previous.deck !== deck || previous.intent !== intent) return;
    previous.abort?.();
    if (previous.resource) void this.store.dispatch(releaseAsset({ key: previous.key, url: previous.resource.url }));
    this.enqueue(deck, id, intent); this.drain();
  }
  private enqueue(deck: string, id: string, intent: number) {
    const entry = { deck, id, intent, key: `${presentationPath(deck)}/slides/${uuid(id)}/image` };
    this.records.set(id, entry); this.queue.push(entry);
    this.store.dispatch(imageChanged({ deckIntent: intent, id, status: "loading" }));
  }
  private current(entry: Entry) {
    const w = this.store.getState().workspace;
    return this.records.get(entry.id) === entry && w.deck?.id === entry.deck && w.deckIntent === entry.intent;
  }
  private drain() {
    while (this.workers < 3 && this.queue.length) {
      this.workers += 1;
      void this.worker().finally(() => { this.workers -= 1; this.drain(); });
    }
  }
  private async worker() {
    while (this.queue.length) {
      const entry = this.queue.shift()!;
      if (!this.current(entry)) continue;
      const task = this.store.dispatch(loadSlideImage({ presentationId: entry.deck, slideId: entry.id }));
      entry.abort = task.abort;
      try {
        const resource = await task.unwrap(); entry.resource = resource;
        if (!this.current(entry)) { void this.store.dispatch(releaseAsset({ key: resource.key, url: resource.url })); continue; }
        this.store.dispatch(imageChanged({ deckIntent: entry.intent, id: entry.id, status: "ready" }));
      } catch {
        if (this.current(entry)) this.store.dispatch(imageChanged({ deckIntent: entry.intent, id: entry.id, status: "error", error: "This slide image could not be loaded." }));
      }
    }
  }
  decodeFailed(id: string, url: string) {
    const entry = this.records.get(id);
    if (!entry || !this.current(entry) || entry.resource?.url !== url) return;
    void this.store.dispatch(releaseAsset({ key: entry.key, url })); entry.resource = undefined;
    this.store.dispatch(imageChanged({ deckIntent: entry.intent, id, status: "error", error: "This preview could not be displayed." }));
  }
  clear() {
    this.queue = [];
    for (const entry of this.records.values()) {
      entry.abort?.();
      const resource = entry.resource ?? this.store.getState().assets.byKey[entry.key];
      if (resource) void this.store.dispatch(releaseAsset({ key: entry.key, url: resource.url }));
    }
    this.records.clear();
  }
}
