import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { resolveObjectURL } from "node:buffer";
import axios from "axios";

process.env.NEXT_PUBLIC_API_BASE_URL = "http://localhost:8080";
const load = createRequire(import.meta.url);
load.extensions[".css"] = () => {};
const React = load("react");
const { renderToStaticMarkup } = load("react-dom/server");
const { Provider } = load("react-redux");
const { makeStore } = load("../src/store/store.ts");
const { api } = load("../src/store/services/api.ts");
const { sessionEstablished, sessionCleared } = load("../src/features/auth/authSlice.ts");
const queries = load("../src/features/presentations/presentationsApi.ts");
const { presentationsApi } = queries;
const hooks = load("../src/store/hooks.ts");
const { WorkspaceController } = load("../src/features/workspace/WorkspaceController.ts");
const { Workspace } = load("../src/features/workspace/Workspace.tsx");
const { PresentationLibrary } = load("../src/features/workspace/PresentationLibrary.tsx");
const { SavedPresentations } = load("../src/features/workspace/SavedPresentations.tsx");
const { SlideStage } = load("../src/features/workspace/SlideStage.tsx");
const { UploadPanel } = load("../src/features/workspace/UploadPanel.tsx");
const { presentationHref } = load("../src/features/workspace/libraryHelpers.ts");
const { initialSnapshot } = load("../src/features/workspace/navigationHelpers.ts");
const { snapshotChanged, micChanged, savedPresentationDeleted } = load("../src/features/workspace/workspaceSlice.ts");
const A = "aaaaaaaa-1111-4111-8111-111111111111";
const B = "bbbbbbbb-2222-4222-8222-222222222222";
const SA = "cccccccc-3333-4333-8333-333333333333";
const SB = "dddddddd-4444-4444-8444-444444444444";
const DATE = "2026-11-16T10:00:00Z";
const deck = (id = A) => ({ id, filename: id === A ? "Fictional A.pdf" : "Fictional B.pdf", format: "pdf", status: "ready", outline: "", slideCount: 1, createdAt: DATE, updatedAt: DATE });
const slide = (id) => [{ id: id === A ? SA : SB, position: 1, title: id === A ? "Topic in A" : "Topic in B", text: "", notes: "", meaning: "" }];
const reply = (data, status = 200) => ({ data, status });
const pause = () => new Promise((done) => setImmediate(done));
function deferred() { let resolve; const promise = new Promise((done) => { resolve = done; }); return { promise, resolve }; }
async function until(check) {
  const deadline = performance.now() + 2000;
  while (!check()) { if (performance.now() > deadline) throw new Error("Expected condition did not occur"); await pause(); }
}
function authenticate(store, user = A) {
  const auth = store.getState().auth;
  store.dispatch(sessionEstablished({ generation: auth.generation, attempt: auth.loginAttempt, accessToken: "test-token", expiresAt: Date.now() + 3600_000, user: { id: user, firstName: "Fictional", lastName: "Presenter", createdAt: DATE, updatedAt: DATE } }));
}
function fixture(t, handler = (config) => reply(config.responseType === "blob" ? new Blob(["image"], { type: "image/png" }) : { data: deck() })) {
  const calls = [];
  const client = axios.create({ adapter: async (config) => {
    calls.push(config);
    const result = await handler(config);
    const response = { status: result.status ?? 200, data: result.data, headers: {}, statusText: "Test", config };
    if (response.status >= 400) throw new axios.AxiosError("Failed", "ERR_BAD_RESPONSE", config, undefined, response);
    return response;
  } });
  const store = makeStore({ client });
  authenticate(store);
  t.after(() => { store.dispatch(sessionCleared()); store.dispatch(api.util.resetApiState()); });
  return { store, calls };
}
function find(node, match) {
  if (!node || typeof node !== "object") return;
  if (match(node)) return node;
  for (const child of [node.props?.children].flat(Infinity)) { const result = find(child, match); if (result) return result; }
}
function presenter(t, f) {
  const originals = { memo: React.useMemo, effect: React.useEffect, selector: hooks.useAppSelector, store: hooks.useAppStore, metadata: queries.useGetPresentationQuery, slides: queries.useGetPresentationSlidesQuery };
  const slots = [], requests = [], models = new Map([[A, deck(A)], [B, deck(B)]]);
  let cursor = 0, effects = [];
  const changed = (old, next) => !old || old.length !== next.length || next.some((value, i) => value !== old[i]);
  React.useMemo = (create, deps) => {
    const i = cursor++;
    if (changed(slots[i]?.deps, deps)) slots[i] = { value: create(), deps };
    return slots[i].value;
  };
  React.useEffect = (create, deps) => {
    const i = cursor++;
    if (changed(slots[i]?.deps, deps)) effects.push({ i, create, deps });
  };
  hooks.useAppStore = () => f.store;
  hooks.useAppSelector = (select) => select(f.store.getState());
  queries.useGetPresentationQuery = (id, options) => {
    requests.push({ kind: "metadata", id, skip: options.skip });
    return { currentData: options.skip ? undefined : models.get(id), isFetching: false, refetch() {} };
  };
  queries.useGetPresentationSlidesQuery = (id, options) => {
    requests.push({ kind: "slides", id, skip: options.skip });
    return { currentData: options.skip ? undefined : slide(id), isFetching: false, refetch() {} };
  };
  let unmounted = false;
  const unmount = () => {
    if (unmounted) return;
    unmounted = true;
    for (const slot of slots) slot?.cleanup?.();
  };
  t.after(() => {
    unmount();
    React.useMemo = originals.memo; React.useEffect = originals.effect;
    hooks.useAppSelector = originals.selector; hooks.useAppStore = originals.store;
    queries.useGetPresentationQuery = originals.metadata; queries.useGetPresentationSlidesQuery = originals.slides;
  });
  return {
    requests, models, unmount,
    render(id) {
      cursor = 0; effects = [];
      const tree = Workspace({ presentationId: id });
      for (const effect of effects) slots[effect.i]?.cleanup?.();
      for (const effect of effects) slots[effect.i] = { deps: effect.deps, cleanup: effect.create() };
      return tree;
    },
  };
}

test("workspace and dynamic presenter pages are distinct protected routes with awaited canonical params", async () => {
  const libraryPage = load("../src/app/workspace/page.tsx").default();
  assert.equal(libraryPage.props.children.type, PresentationLibrary);
  const page = load("../src/app/workspace/[presentationId]/page.tsx").default;
  const presentation = await page({ params: Promise.resolve({ presentationId: A.toUpperCase() }) });
  assert.equal(presentation.props.children.type, Workspace);
  assert.equal(presentation.props.children.props.presentationId, A);
  assert.equal(presentation.props.children.key, A);
  assert.equal(presentationHref(A.toUpperCase()), `/workspace/${A}`);
  assert.throws(() => presentationHref("javascript:alert(1)"));
});

test("library cards are native links with sibling actions and an empty upload state", async (t) => {
  let populated = true;
  const f = fixture(t, () => reply({ data: { presentations: populated ? [deck()] : [], nextCursor: "" } }));
  const controller = new WorkspaceController(f.store);
  await f.store.dispatch(presentationsApi.endpoints.listPresentations.initiate(undefined)).unwrap();
  const render = () => renderToStaticMarkup(React.createElement(Provider, { store: f.store }, React.createElement(SavedPresentations, { controller })));
  const filled = render();
  assert.match(filled, /saved-grid/);
  assert.match(filled, new RegExp(`href="/workspace/${A}"`));
  assert.match(filled, /Rename Fictional A.pdf/);
  assert.match(filled, /Delete Fictional A.pdf/);
  assert.equal([...filled.matchAll(/<a\b[^>]*>[\s\S]*?<\/a>/g)].some(([link]) => /<button|<input/.test(link)), false);
  assert.doesNotMatch(filled, /slide-stage|Presentation setup/);
  populated = false;
  await f.store.dispatch(presentationsApi.endpoints.listPresentations.initiate(undefined, { forceRefetch: true }));
  assert.match(render(), /No presentations yet/);
  assert.match(render(), /presentation-file-input/);
});

test("cold and uppercase deep links initialize by URL, and A-to-B never renders the old stage", (t) => {
  const f = fixture(t);
  const p = presenter(t, f);
  const first = p.render(A.toUpperCase());
  assert.equal(find(first, (node) => node.type === SlideStage), undefined);
  assert.equal(f.store.getState().workspace.deck.id, A);
  const ready = p.render(A.toUpperCase());
  const stageA = find(ready, (node) => node.type === SlideStage);
  assert.equal(stageA.props.deck.id, A);
  assert.equal(f.store.getState().workspace.snapshot.held, true);
  const before = f.store.getState().workspace.deckIntent;
  p.models.set(A, { ...deck(A), filename: "Updated metadata.pdf" });
  p.render(A.toUpperCase());
  assert.equal(f.store.getState().workspace.deckIntent, before);
  assert.equal(f.store.getState().workspace.deck.filename, "Updated metadata.pdf");
  const switching = p.render(B);
  assert.equal(find(switching, (node) => node.type === SlideStage), undefined);
  assert.equal(f.store.getState().workspace.deck.id, B);
  const stageB = find(p.render(B), (node) => node.type === SlideStage);
  assert.equal(stageB.props.deck.id, B);
  assert.equal(stageB.props.slides[0].id, SB);
  assert.equal(p.requests.filter((request) => !request.skip).every((request) => request.id === A || request.id === B), true);
  assert.equal(f.calls.some((call) => call.method === "post"), false);
});

test("invalid and deleted links show a back path without document HTTP or selecting stale data", (t) => {
  const f = fixture(t);
  const p = presenter(t, f);
  const invalid = p.render("not-a-uuid");
  assert.ok(find(invalid, (node) => node.props?.href === "/workspace"));
  assert.equal(f.store.getState().workspace.deck, null);
  assert.equal(p.requests.every((request) => request.skip), true);
  f.store.dispatch(savedPresentationDeleted(A));
  p.requests.length = 0;
  const deleted = p.render(A);
  assert.equal(find(deleted, (node) => node.type === SlideStage), undefined);
  assert.equal(p.requests.every((request) => request.skip), true);
  assert.equal(f.calls.length, 0);
});

test("returning from a presenter releases URLs/navigation/live while preserving saved-write guards", async (t) => {
  const f = fixture(t);
  const p = presenter(t, f);
  p.render(A); p.render(A);
  await until(() => f.store.getState().workspace.images[SA]?.status === "ready");
  const url = Object.values(f.store.getState().assets.byKey)[0].url;
  f.store.dispatch(savedPresentationDeleted(B));
  let closed = 0;
  f.store.resources.live = { close() { closed++; } };
  p.unmount();
  assert.equal(f.store.getState().workspace.deck, null);
  assert.equal(f.store.getState().workspace.snapshot, null);
  assert.equal(f.store.getState().live.status, "idle");
  assert.equal(resolveObjectURL(url), undefined);
  assert.equal(closed, 1);
  assert.deepEqual(f.store.getState().workspace.savedChanges[B], { deleted: true });
});

test("old A cleanup cannot stop B's session but still disposes A's owned capture", async (t) => {
  const f = fixture(t);
  const old = new WorkspaceController(f.store); old.attach(); old.openSaved(deck(A));
  const oldIntent = f.store.getState().workspace.deckIntent, generation = f.store.getState().auth.generation;
  let oldTracks = 0, oldContexts = 0, newClosed = 0;
  old.capture.operation = { cancelled: false, context: { close() { oldContexts++; return Promise.resolve(); } }, stream: { getTracks: () => [{ stop() { oldTracks++; } }] } };
  const next = new WorkspaceController(f.store); next.attach(); next.openSaved(deck(B));
  t.after(() => next.detach());
  f.store.dispatch(snapshotChanged({ snapshot: initialSnapshot(slide(B)), source: "control", at: 0 }));
  f.store.dispatch(micChanged({ status: "listening" }));
  const current = f.store.getState().workspace;
  const live = { close() { newClosed++; } }; f.store.resources.live = live;
  assert.equal(old.leavePresentation(A, oldIntent, generation), false);
  old.detach(true);
  assert.equal(oldTracks, 1); assert.equal(oldContexts, 1);
  assert.equal(newClosed, 0);
  assert.equal(f.store.resources.live, live);
  assert.equal(f.store.getState().workspace.snapshot, current.snapshot);
  assert.equal(f.store.getState().workspace.mic, current.mic);
});

test("cross-route mutations keep per-store locks and record success after the library unmounts", async (t) => {
  for (const kind of ["rename", "delete"]) {
    const pending = deferred();
    const f = fixture(t, () => pending.promise);
    const old = new WorkspaceController(f.store); old.attach();
    const operation = kind === "rename" ? old.renameSaved(A, "Updated.pdf") : old.deleteSaved(A);
    old.detach(true);
    const next = new WorkspaceController(f.store); next.attach(); t.after(() => next.detach());
    await assert.rejects(next.renameSaved(A, "Cannot overlap"), /current action/);
    await assert.rejects(next.deleteSaved(A), /current action/);
    next.openSaved(deck(B));
    pending.resolve(kind === "rename" ? reply({ data: { ...deck(), filename: "Updated.pdf", updatedAt: "2026-11-16T11:00:00Z" } }) : reply(undefined, 204));
    await operation;
    assert.equal(f.store.getState().workspace.deck.id, B);
    assert.equal(f.store.getState().workspace.savedPending[A], undefined);
    assert.equal(kind === "rename" ? f.store.getState().workspace.savedChanges[A].filename : f.store.getState().workspace.savedChanges[A].deleted, kind === "rename" ? "Updated.pdf" : true);
  }
});

test("a delete completing after direct presenter activation releases the new route's image URLs", async (t) => {
  const pending = deferred();
  const f = fixture(t, (config) => config.method === "delete" ? pending.promise : reply(new Blob(["image"], { type: "image/png" })));
  const library = new WorkspaceController(f.store); library.attach();
  const deletion = library.deleteSaved(A); library.detach(true);
  const p = presenter(t, f); p.render(A); p.render(A);
  await until(() => f.store.getState().workspace.images[SA]?.status === "ready");
  const url = Object.values(f.store.getState().assets.byKey)[0].url;
  assert.ok(resolveObjectURL(url));
  pending.resolve(reply(undefined, 204)); await deletion;
  const tree = p.render(A);
  assert.equal(find(tree, (node) => node.type === SlideStage), undefined);
  assert.equal(resolveObjectURL(url), undefined);
  assert.deepEqual(f.store.getState().assets.byKey, {});
});

test("auth reset fences a CRUD response even after its owning route detached", async (t) => {
  const pending = deferred();
  const f = fixture(t, () => pending.promise);
  const old = new WorkspaceController(f.store); old.attach();
  const operation = old.renameSaved(A, "Old account.pdf");
  old.detach(true);
  f.store.dispatch(sessionCleared()); authenticate(f.store, B);
  const next = new WorkspaceController(f.store); next.openSaved(deck(B));
  pending.resolve(reply({ data: { ...deck(), filename: "Old account.pdf" } }));
  await assert.rejects(operation);
  assert.deepEqual(f.store.getState().workspace.savedPending, {});
  assert.deepEqual(f.store.getState().workspace.savedChanges, {});
  assert.equal(f.store.getState().workspace.deck.id, B);
});

function uploadControl(f, controller, completed) {
  const original = { ref: React.useRef, effect: React.useEffect, store: hooks.useAppStore, selector: hooks.useAppSelector };
  const cleanups = [];
  React.useRef = (initial) => ({ current: initial });
  React.useEffect = (effect) => { const cleanup = effect(); if (cleanup) cleanups.push(cleanup); };
  hooks.useAppStore = () => f.store; hooks.useAppSelector = (select) => select(f.store.getState());
  const tree = UploadPanel({ controller, library: true, onUploaded: completed });
  React.useRef = original.ref; React.useEffect = original.effect;
  hooks.useAppStore = original.store; hooks.useAppSelector = original.selector;
  return {
    choose() { find(tree, (node) => node.type === "input").props.onChange({ currentTarget: { files: [new File(["%PDF"], "Fictional.pdf", { type: "application/pdf" })], value: "" } }); },
    unmount() { for (const cleanup of cleanups) cleanup(); },
  };
}

test("upload handoff routes only accepted current success, never failures or late canceled/unmounted/accounts", async (t) => {
  for (const reason of ["success", "failed", "cancel", "unmount", "account"]) {
    const pending = deferred(), paths = [];
    const f = fixture(t, () => pending.promise);
    const controller = new WorkspaceController(f.store); controller.attach();
    t.after(() => controller.detach());
    const control = uploadControl(f, controller, (id) => paths.push(presentationHref(id)));
    control.choose(); await until(() => f.calls.length === 1);
    if (reason === "cancel") controller.cancelUpload();
    if (reason === "unmount") { control.unmount(); controller.detach(true); }
    if (reason === "account") { f.store.dispatch(sessionCleared()); authenticate(f.store, B); }
    pending.resolve(reason === "failed" ? reply({ error: "Upload failed" }, 500) : reply({ data: { ...deck(A), status: "queued" } }, 202));
    await until(() => f.store.getState().workspace.upload.status !== "uploading");
    await pause();
    assert.deepEqual(paths, reason === "success" ? [`/workspace/${A}`] : [], reason);
    control.unmount();
  }
});
