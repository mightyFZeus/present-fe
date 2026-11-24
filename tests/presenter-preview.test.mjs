import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { resolveObjectURL } from "node:buffer";
import axios from "axios";

process.env.NEXT_PUBLIC_API_BASE_URL = "http://localhost:8080";
const load = createRequire(import.meta.url);
const React = load("react");
const { renderToStaticMarkup } = load("react-dom/server");
const { Provider } = load("react-redux");
const hooks = load("../src/store/hooks.ts");
const { makeStore } = load("../src/store/store.ts");
const { api } = load("../src/store/services/api.ts");
const { sessionEstablished, sessionCleared } = load("../src/features/auth/authSlice.ts");
const { deckSelected, snapshotChanged, micChanged, imageChanged } = load("../src/features/workspace/workspaceSlice.ts");
const { presentationEntered, presentationExited } = load("../src/features/workspace/presentationSlice.ts");
const { installPresentationStore } = load("../src/features/workspace/presentationStore.ts");
const { initialSnapshot, manualSlide, orderedSlides } = load("../src/features/workspace/navigationHelpers.ts");
const { WorkspaceController } = load("../src/features/workspace/WorkspaceController.ts");
const { PresenterPreview } = load("../src/features/workspace/PresenterPreview.tsx");
const { nextPreviewSlide, presenterCue } = load("../src/features/workspace/presenterPreviewHelpers.ts");

const ID = "11111111-1111-4111-8111-111111111111";
const OTHER = "44444444-4444-4444-8444-444444444444";
const slides = [1, 3, 7].map((position) => ({
  id: `22222222-2222-4222-8222-${String(position).padStart(12, "0")}`,
  position,
  title: `Topic ${position}`,
  notes: position === 3 ? "Explain the next topic." : "",
  meaning: `The meaning of topic ${position}.`,
  text: `Visible text for topic ${position}.`,
}));
const deck = {
  id: ID,
  filename: "Preview test.pdf",
  format: "pdf",
  status: "ready",
  outline: "",
  slideCount: slides.length,
  createdAt: "2026-11-23T10:00:00Z",
  updatedAt: "2026-11-23T10:00:00Z",
};
function find(node, predicate) {
  if (!node || typeof node !== "object") return;
  if (predicate(node)) return node;
  for (const child of [node.props?.children].flat(Infinity)) {
    const found = find(child, predicate);
    if (found) return found;
  }
}
const pause = () => new Promise((done) => setImmediate(done));
async function until(predicate) {
  const deadline = performance.now() + 1500;
  while (!predicate()) {
    if (performance.now() > deadline) throw new Error("Preview fixture did not settle");
    await pause();
  }
}
function fixture(t) {
  const calls = [];
  const store = makeStore({
    client: axios.create({ adapter: async (config) => {
      calls.push(config);
      return {
        status: 200,
        statusText: "Test",
        config,
        headers: {},
        data: new Blob(["test image"], { type: "image/png" }),
      };
    } }),
    socketFactory() { throw new Error("Preview must not open a socket"); },
  });
  const auth = store.getState().auth;
  store.dispatch(sessionEstablished({
    generation: auth.generation,
    attempt: auth.loginAttempt,
    accessToken: "memory-only-preview-test-token",
    expiresAt: Date.now() + 3600_000,
    user: {
      id: ID,
      firstName: "Test",
      lastName: "Presenter",
      createdAt: deck.createdAt,
      updatedAt: deck.updatedAt,
    },
  }));
  store.dispatch(deckSelected({ id: ID, filename: deck.filename }));
  store.dispatch(snapshotChanged({ snapshot: initialSnapshot(slides), source: "control", at: 0 }));
  installPresentationStore(store);
  const controller = new WorkspaceController(store);
  controller.attach();
  t.after(() => {
    controller.detach();
    store.dispatch(sessionCleared({ reason: "Test finished" }));
    store.dispatch(api.util.resetApiState());
  });
  return { store, controller, calls };
}
function html(fixture, overrides = {}) {
  return renderToStaticMarkup(React.createElement(Provider, { store: fixture.store },
    React.createElement(PresenterPreview, { deck, slides, controller: fixture.controller, ...overrides }),
  ));
}
function tree(t, fixture) {
  t.mock.method(hooks, "useAppSelector", (select) => select(fixture.store.getState()));
  return PresenterPreview({ deck, slides, controller: fixture.controller });
}

test("next preview follows the displayed slide through jumps and revisits without wrapping", () => {
  const ordered = orderedSlides([...slides].reverse());
  assert.equal(nextPreviewSlide(ordered, slides[0].id), slides[1]);
  assert.equal(nextPreviewSlide(ordered, slides[1].id), slides[2]);
  assert.equal(nextPreviewSlide(ordered, slides[2].id), undefined);
  assert.equal(nextPreviewSlide(ordered, "unknown"), undefined);
  assert.equal(nextPreviewSlide([], slides[0].id), undefined);
  let snapshot = manualSlide(initialSnapshot(slides), slides[2].id, slides);
  snapshot = manualSlide(snapshot, slides[0].id, slides);
  assert.equal(snapshot.mainSlideId, slides[2].id);
  assert.equal(nextPreviewSlide(slides, snapshot.displayedSlideId), slides[1]);
});

test("cue priority skips blank fields, stays bounded and preserves literal text", () => {
  const base = { ...slides[1] };
  assert.deepEqual(presenterCue(base), { text: "Explain the next topic.", source: "Speaker notes" });
  const summary = presenterCue({ ...base, notes: " \n\t " });
  assert.deepEqual(summary, { text: base.meaning, source: "Slide summary" });
  assert.equal(presenterCue({ ...base, notes: "", meaning: "" }).source, "Slide text");
  assert.equal(presenterCue({ ...base, notes: "", meaning: "", text: "" }).source, "Slide title");
  assert.equal(presenterCue({ ...base, notes: "", meaning: "", text: "", title: "" }), null);
  assert.equal(presenterCue({ ...base, notes: "  Explain\n this\tpoint.  " }).text, "Explain this point.");
  const long = presenterCue({ ...base, notes: "A long cue with a clear transition. ".repeat(30) });
  assert.ok(Array.from(long.text).length <= 240);
  assert.ok(long.text.endsWith("…"));
  const unicode = presenterCue({ ...base, notes: "🙂".repeat(300) });
  assert.equal(Array.from(unicode.text).length, 240);
  assert.equal(unicode.text.isWellFormed(), true);
  assert.equal(presenterCue({ ...base, notes: "<script>do not execute</script>" }).text,
    "<script>do not execute</script>");
});

test("preview shows next metadata without requests or navigation and handles the final slide", (t) => {
  const f = fixture(t);
  const snapshot = f.store.getState().workspace.snapshot;
  const markup = html(f);
  assert.match(markup, /Next slide/);
  assert.match(markup, /Topic 3/);
  assert.match(markup, /Speaker notes/);
  assert.match(markup, /Explain the next topic/);
  assert.match(markup, /Loading preview/);
  assert.equal(f.calls.length, 0);
  assert.equal(f.store.getState().workspace.snapshot, snapshot);
  assert.equal(f.store.getState().workspace.mic.status, "off");
  f.store.dispatch(snapshotChanged({
    snapshot: manualSlide(snapshot, slides[2].id, slides),
    source: "manual",
    at: 1,
  }));
  const end = html(f);
  assert.match(end, /Final slide/);
  assert.doesNotMatch(end, /<img|Speaker notes|Explain the next topic|Loading preview/);
});

test("cue HTML is escaped and empty cues have an honest placeholder", (t) => {
  const f = fixture(t);
  const hostile = [slides[0], { ...slides[1], notes: "<script>alert(1)</script>" }];
  const markup = html(f, { slides: hostile });
  assert.match(markup, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(markup, /<script>/);
  const empty = [slides[0], { ...slides[1], notes: "", meaning: "", text: "", title: "" }];
  assert.match(html(f, { slides: empty }), /No cue text is available/);
});

test("preview is absent for preparation, mismatched decks, unknown current slides and session reset", (t) => {
  const f = fixture(t);
  for (const status of ["queued", "processing", "failed"]) {
    assert.equal(html(f, { deck: { ...deck, status } }), "");
  }
  assert.equal(html(f, { deck: undefined }), "");
  assert.equal(html(f, { slides: [] }), "");
  assert.equal(html(f, { deck: { ...deck, id: OTHER } }), "");
  const current = f.store.getState().workspace.snapshot;
  f.store.dispatch(snapshotChanged({
    snapshot: { ...current, displayedSlideId: OTHER },
    source: "control",
    at: 1,
  }));
  assert.equal(html(f), "");
  f.store.dispatch(deckSelected({ id: OTHER, filename: "Other deck.pdf" }));
  assert.equal(html(f), "");
  f.store.dispatch(sessionCleared({ reason: "Account changed" }));
  assert.equal(html(f), "");
});

test("shared assets supply the preview without another fetch or URL owner", async (t) => {
  const f = fixture(t);
  f.controller.setSlides(ID, slides, f.store.getState().workspace.deckIntent);
  await until(() => slides.every((slide) => f.store.getState().workspace.images[slide.id]?.status === "ready"));
  const key = `/v1/presentations/${ID}/slides/${slides[1].id}/image`;
  const resource = f.store.getState().assets.byKey[key];
  const requests = f.calls.length;
  assert.ok(resolveObjectURL(resource.url));
  assert.ok(html(f).includes(resource.url));
  assert.equal(f.calls.length, requests);
  f.store.dispatch(presentationEntered());
  assert.equal(html(f), "");
  assert.ok(resolveObjectURL(resource.url));
  assert.equal(f.store.getState().assets.byKey[key], resource);
  f.store.dispatch(presentationExited());
  assert.ok(html(f).includes(resource.url));
  assert.equal(f.calls.length, requests);
  f.store.dispatch(sessionCleared({ reason: "Changed account" }));
  assert.equal(resolveObjectURL(resource.url), undefined);
  assert.equal(html(f), "");
});

test("image errors and retries use the existing asset owner without navigating", (t) => {
  const f = fixture(t);
  const failed = t.mock.method(f.controller.assets, "decodeFailed");
  const retried = t.mock.method(f.controller.assets, "retry");
  const { assetLoaded } = load("../src/features/presentations/assetsSlice.ts");
  const key = `/v1/presentations/${ID}/slides/${slides[1].id}/image`;
  f.store.dispatch(assetLoaded({ key, url: "blob:preview-test", contentType: "image/png", size: 10 }));
  let view = tree(t, f);
  find(view, (node) => node.props?.src === "blob:preview-test").props.onError();
  assert.deepEqual(failed.mock.calls[0].arguments, [slides[1].id, "blob:preview-test"]);
  f.store.dispatch(imageChanged({ deckIntent: f.store.getState().workspace.deckIntent, id: slides[1].id, status: "error" }));
  view = PresenterPreview({ deck, slides, controller: f.controller });
  const retry = find(view, (node) => node.type === "button");
  assert.ok(retry);
  retry.props.onClick();
  assert.deepEqual(retried.mock.calls[0].arguments, [ID, slides[1].id, f.store.getState().workspace.deckIntent]);
  assert.equal(f.store.getState().workspace.snapshot.displayedSlideId, slides[0].id);
});

test("focused and fullscreen presentation modes omit private previews through Hold and Stop", (t) => {
  const f = fixture(t);
  f.store.dispatch(micChanged({ status: "listening" }));
  assert.equal(html(f), "");
  for (const status of ["held", "off", "error"]) {
    f.store.dispatch(micChanged({ status }));
    assert.equal(html(f), "");
  }
  f.store.dispatch(presentationExited());
  assert.match(html(f), /Explain the next topic/);
});

test("the real Workspace omits the preview component when presentation view is active", (t) => {
  const f = fixture(t);
  const queries = load("../src/features/presentations/presentationsApi.ts");
  t.mock.method(React, "useMemo", (create) => create());
  t.mock.method(React, "useEffect", () => {});
  t.mock.method(hooks, "useAppStore", () => f.store);
  t.mock.method(hooks, "useAppSelector", (select) => select(f.store.getState()));
  t.mock.method(queries, "useGetPresentationQuery", () => ({ currentData: deck, isFetching: false }));
  t.mock.method(queries, "useGetPresentationSlidesQuery", () => ({ currentData: [...slides].reverse(), isFetching: false }));
  const originalCss = load.extensions[".css"];
  load.extensions[".css"] = () => {};
  t.after(() => {
    if (originalCss) load.extensions[".css"] = originalCss;
    else delete load.extensions[".css"];
  });
  const { Workspace } = load("../src/features/workspace/Workspace.tsx");
  let view = Workspace({ presentationId: ID });
  const preview = find(view, (node) => node.type === PresenterPreview);
  assert.ok(preview);
  assert.deepEqual(preview.props.slides.map((slide) => slide.id), slides.map((slide) => slide.id));
  assert.equal(nextPreviewSlide(preview.props.slides, f.store.getState().workspace.snapshot.displayedSlideId), slides[1]);
  f.store.dispatch(presentationEntered());
  for (const status of ["off", "held", "error"]) {
    f.store.dispatch(micChanged({ status }));
    view = Workspace({ presentationId: ID });
    assert.equal(find(view, (node) => node.type === PresenterPreview), undefined);
  }
  f.store.dispatch(presentationExited());
  assert.ok(find(Workspace({ presentationId: ID }), (node) => node.type === PresenterPreview));
});

test("stale preview retry cannot revoke replacement assets or create a detached owner", async (t) => {
  const f = fixture(t);
  const originalIntent = f.store.getState().workspace.deckIntent;
  f.controller.setSlides(ID, slides, originalIntent);
  await until(() => slides.every((slide) => f.store.getState().workspace.images[slide.id]?.status === "ready"));
  const key = `/v1/presentations/${ID}/slides/${slides[1].id}/image`;
  const first = f.store.getState().assets.byKey[key];
  f.controller.openSaved({ id: ID, filename: deck.filename, updatedAt: deck.updatedAt });
  const newIntent = f.store.getState().workspace.deckIntent;
  assert.notEqual(newIntent, originalIntent);
  f.controller.setSlides(ID, slides, newIntent);
  await until(() => slides.every((slide) => f.store.getState().workspace.images[slide.id]?.status === "ready"));
  const replacement = f.store.getState().assets.byKey[key];
  assert.notEqual(replacement.url, first.url);
  let requests = f.calls.length;
  f.controller.assets.retry(ID, slides[1].id, originalIntent);
  await pause();
  assert.equal(f.calls.length, requests);
  assert.equal(f.store.getState().assets.byKey[key], replacement);
  assert.ok(resolveObjectURL(replacement.url));

  f.controller.detach();
  const current = new WorkspaceController(f.store);
  current.attach();
  t.after(() => current.detach());
  current.setSlides(ID, slides, newIntent);
  await until(() => slides.every((slide) => f.store.getState().workspace.images[slide.id]?.status === "ready"));
  const currentResource = f.store.getState().assets.byKey[key];
  requests = f.calls.length;
  f.controller.assets.retry(ID, slides[1].id, newIntent);
  await pause();
  assert.equal(f.calls.length, requests);
  assert.equal(f.store.getState().assets.byKey[key], currentResource);
  assert.ok(resolveObjectURL(currentResource.url));
});
