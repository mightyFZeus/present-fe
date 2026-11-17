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
const { makeStore } = load("../src/store/store.ts");
const { api } = load("../src/store/services/api.ts");
const { sessionEstablished, sessionCleared } = load("../src/features/auth/authSlice.ts");
const { presentationsApi } = load("../src/features/presentations/presentationsApi.ts");
const { uploadPresentation } = load("../src/features/presentations/presentationThunks.ts");
const { WorkspaceController } = load("../src/features/workspace/WorkspaceController.ts");
const { SavedPresentations } = load("../src/features/workspace/SavedPresentations.tsx");
const { visibleSavedPresentations, latestPresentationLabel } = load("../src/features/workspace/libraryHelpers.ts");
const { snapshotChanged, micChanged, deckCleared } = load("../src/features/workspace/workspaceSlice.ts");
const { liveEventReceived } = load("../src/features/live/liveSlice.ts");
const { initialSnapshot } = load("../src/features/workspace/navigationHelpers.ts");
const ID = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const SLIDE = "33333333-3333-4333-8333-333333333333";
const OLD = "2026-11-16T10:00:00.123456Z";
const NEW = "2026-11-16T10:00:00.123457Z";
const deck = (id = ID, filename = "Fictional workshop.pdf") => ({
  id, filename, format: "pdf", status: "ready", outline: "Prepared context", slideCount: 1,
  createdAt: OLD, updatedAt: OLD,
});
const summary = (value = deck()) => { const { outline: _outline, ...metadata } = value; void _outline; return metadata; };
const slides = [{ id: SLIDE, position: 1, title: "Fictional workshop", text: "", notes: "", meaning: "" }];
const page = (...presentations) => ({ presentations: presentations.map(summary), nextCursor: "" });
const reply = (data, status = 200) => ({ data, status });
function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}
const pause = () => new Promise((done) => setImmediate(done));
async function until(check) {
  const deadline = performance.now() + 2000;
  while (!check()) {
    if (performance.now() > deadline) throw new Error("Expected async condition did not occur");
    await pause();
  }
}
function authenticate(store, id = ID) {
  const auth = store.getState().auth;
  store.dispatch(sessionEstablished({
    generation: auth.generation, attempt: auth.loginAttempt,
    accessToken: "private-memory-test-token", expiresAt: Date.now() + 3600_000,
    user: { id, firstName: "Test", lastName: "Presenter", createdAt: OLD, updatedAt: OLD },
  }));
}
function fixture(t, handler) {
  const calls = [];
  const client = axios.create({ adapter: async (config) => {
    calls.push(config);
    const value = await handler(config);
    const response = { status: value.status ?? 200, statusText: "Test", headers: {}, config, data: value.data };
    if (response.status >= 400) {
      throw new axios.AxiosError("Request failed", "ERR_BAD_RESPONSE", config, undefined, response);
    }
    return response;
  } });
  const store = makeStore({ client });
  authenticate(store);
  const controller = new WorkspaceController(store);
  controller.attach();
  t.after(() => {
    controller.detach();
    store.dispatch(sessionCleared({ reason: "Test complete" }));
    store.dispatch(api.util.resetApiState());
  });
  return { store, controller, calls };
}
const list = (store, options) => store.dispatch(presentationsApi.endpoints.listPresentations.initiate(undefined, options));
const visible = (store) => visibleSavedPresentations(
  presentationsApi.endpoints.listPresentations.select(undefined)(store.getState()).data?.pages ?? [],
  store.getState().workspace.savedChanges,
);
const html = (f) => renderToStaticMarkup(React.createElement(Provider, { store: f.store },
  React.createElement(SavedPresentations, { controller: f.controller }),
));

// Real RTK Query, Axios base query, store, controller and resources; only HTTP is fake.
test("saved list encodes opaque cursors, sends Bearer and renders real statuses", async (t) => {
  let count = 0;
  const cursor = "opaque+/=cursor";
  const f = fixture(t, () => reply({ data: ++count === 1
    ? { ...page(deck()), nextCursor: cursor }
    : page({ ...deck(OTHER, "Fictional follow-up.pptx"), format: "pptx", status: "processing" }) }));
  await list(f.store).unwrap();
  assert.match(html(f), /Open Fictional workshop.pdf/);
  assert.match(html(f), /Rename Fictional workshop.pdf/);
  assert.match(html(f), /Delete Fictional workshop.pdf/);
  assert.match(html(f), /Load more/);
  await list(f.store, { direction: "forward" }).unwrap();
  assert.deepEqual(visible(f.store).map((row) => row.id), [ID, OTHER]);
  assert.match(html(f), /Preparing/);
  assert.match(html(f), /View status for Fictional follow-up.pptx/);
  assert.doesNotMatch(html(f), /Load more/);
  assert.equal(new URL(f.calls[1].url, "http://localhost").searchParams.get("cursor"), cursor);
  assert.equal(f.calls[0].headers.get("Authorization"), "Bearer private-memory-test-token");
  assert.equal(JSON.stringify(f.store.getState().api).includes("private-memory-test-token"), false);
});

test("empty library and recoverable list errors stay honest", async (t) => {
  let fail = false;
  const f = fixture(t, () => fail ? reply({ error: "Please retry the library" }, 500) : reply({ data: page() }));
  await list(f.store).unwrap();
  assert.match(html(f), /No presentations yet/);
  fail = true;
  await list(f.store, { forceRefetch: true });
  assert.match(html(f), /Please retry the library/);
  assert.match(html(f), /Try again/);
});

test("only DELETE's exact HTTP 204 contract accepts an empty response", async (t) => {
  let status = 200;
  const f = fixture(t, () => reply(undefined, status));
  await assert.rejects(f.controller.deleteSaved(ID), (error) => error.status === "INVALID_RESPONSE");
  assert.deepEqual(f.store.getState().workspace.savedChanges, {});
  status = 204;
  const get = await f.store.dispatch(presentationsApi.endpoints.getPresentation.initiate(ID));
  assert.equal(get.error.status, "INVALID_RESPONSE");
  await f.controller.deleteSaved(ID);
  assert.deepEqual(f.store.getState().workspace.savedChanges[ID], { deleted: true });
});

test("reopening resets navigation/transcript/assets without uploading or starting capture", async (t) => {
  const f = fixture(t, (config) => config.responseType === "blob"
    ? reply(new Blob(["image"], { type: "image/png" }))
    : reply({ data: config.url.endsWith("/slides") ? slides : deck() }));
  f.controller.openSaved(summary());
  const start = t.mock.method(f.controller.capture, "start", async () => { throw new Error("Explicit microphone action required"); });
  f.controller.setSlides(ID, slides, f.store.getState().workspace.deckIntent);
  await until(() => f.store.getState().workspace.images[SLIDE]?.status === "ready");
  const resource = Object.values(f.store.getState().assets.byKey)[0];
  assert.ok(resolveObjectURL(resource.url));
  f.store.dispatch(snapshotChanged({ snapshot: { ...initialSnapshot(slides), version: 12 }, source: "manual", at: 9 }));
  f.store.dispatch(liveEventReceived({ event: {
    type: "transcript", epoch: OTHER, sessionId: OTHER, generation: 1, version: 12,
    transcriptSeq: 1, held: true, acceptsAudio: false, text: "Old speech", isFinal: true,
  }, at: Date.now() }));
  const intent = f.store.getState().workspace.deckIntent;
  const calls = f.calls.length;
  f.controller.openSaved(summary());
  assert.equal(f.store.getState().workspace.deckIntent, intent + 1);
  assert.equal(f.store.getState().workspace.snapshot, null);
  assert.deepEqual(f.store.getState().live.segments, []);
  assert.equal(resolveObjectURL(resource.url), undefined);
  assert.equal(f.calls.length, calls);
  await f.store.dispatch(presentationsApi.endpoints.getPresentation.initiate(ID)).unwrap();
  await f.store.dispatch(presentationsApi.endpoints.getPresentationSlides.initiate(ID)).unwrap();
  f.controller.setSlides(ID, slides, f.store.getState().workspace.deckIntent);
  assert.equal(f.store.getState().workspace.snapshot.displayedSlideId, SLIDE);
  assert.equal(f.store.getState().workspace.snapshot.held, true);
  assert.equal(f.calls.every((call) => call.method === "get"), true);
  assert.equal(start.mock.callCount(), 0);
});

test("opening a saved deck fences an older upload completion", async (t) => {
  const pending = deferred();
  const f = fixture(t, () => pending.promise);
  const upload = f.controller.upload(new File(["%PDF"], "new.pdf", { type: "application/pdf" }));
  await until(() => f.calls.length === 1);
  f.controller.openSaved(summary(deck(OTHER, "Already prepared.pdf")));
  pending.resolve(reply({ data: deck(ID, "new.pdf") }));
  await upload;
  assert.equal(f.store.getState().workspace.deck.id, OTHER);
  assert.equal(f.store.getState().workspace.upload.status, "idle");
});

test("rename updates only the selected label, preserving navigation and microphone", async (t) => {
  const f = fixture(t, (config) => config.method === "patch"
    ? reply({ data: { ...deck(), filename: "Renamed workshop", updatedAt: NEW } })
    : reply({ data: page(deck()) }));
  await list(f.store).unwrap();
  f.controller.openSaved(summary());
  f.store.dispatch(snapshotChanged({ snapshot: { ...initialSnapshot(slides), version: 9 }, source: "manual", at: 4 }));
  f.store.dispatch(micChanged({ status: "listening" }));
  const before = f.store.getState().workspace;
  const stop = t.mock.method(f.controller.capture, "stop");
  await f.controller.renameSaved(ID, "Renamed workshop");
  const after = f.store.getState().workspace;
  assert.equal(after.deck.filename, "Renamed workshop");
  assert.equal(after.deckIntent, before.deckIntent);
  assert.equal(after.snapshot, before.snapshot);
  assert.equal(after.mic, before.mic);
  assert.equal(stop.mock.callCount(), 0);
  assert.deepEqual(JSON.parse(f.calls.find((call) => call.method === "patch").data), { filename: "Renamed workshop" });
  assert.equal(visible(f.store)[0].filename, "Renamed workshop");
});

test("failed delete preserves resources; successful selected delete clears its deck", async (t) => {
  let fail = true;
  const f = fixture(t, (config) => config.responseType === "blob"
    ? reply(new Blob(["image"], { type: "image/png" }))
    : fail ? reply({ error: "Deletion failed" }, 500) : reply(undefined, 204));
  f.controller.openSaved(summary());
  f.controller.setSlides(ID, slides, f.store.getState().workspace.deckIntent);
  await until(() => f.store.getState().workspace.images[SLIDE]?.status === "ready");
  const resource = Object.values(f.store.getState().assets.byKey)[0];
  const before = f.store.getState().workspace;
  const stop = t.mock.method(f.controller.capture, "stop");
  await assert.rejects(f.controller.deleteSaved(ID));
  assert.deepEqual(f.store.getState().workspace, before);
  assert.ok(resolveObjectURL(resource.url));
  assert.equal(stop.mock.callCount(), 0);
  fail = false;
  await f.controller.deleteSaved(ID);
  assert.equal(f.store.getState().workspace.deck, null);
  assert.equal(f.store.getState().workspace.snapshot, null);
  assert.equal(resolveObjectURL(resource.url), undefined);
  assert.equal(stop.mock.callCount(), 1);
  assert.deepEqual(f.store.getState().workspace.savedChanges[ID], { deleted: true });
});

test("deleting A preserves newly selected B and serializes same-row writes", async (t) => {
  const pending = deferred();
  const f = fixture(t, () => pending.promise);
  f.controller.openSaved(summary());
  const operation = f.controller.deleteSaved(ID);
  await assert.rejects(f.controller.renameSaved(ID, "Cannot race"), /current action/);
  f.controller.openSaved(summary(deck(OTHER, "Fictional other.pdf")));
  const selected = f.store.getState().workspace;
  const stop = t.mock.method(f.controller.capture, "stop");
  pending.resolve(reply(undefined, 204));
  await operation;
  assert.equal(f.store.getState().workspace.deck.id, OTHER);
  assert.equal(f.store.getState().workspace.deckIntent, selected.deckIntent);
  assert.equal(stop.mock.callCount(), 0);
});

test("late rename/delete after account change cannot modify the new account's deck", async (t) => {
  for (const method of ["rename", "delete"]) {
    const pending = deferred();
    const f = fixture(t, () => pending.promise);
    f.controller.openSaved(summary());
    const operation = method === "rename" ? f.controller.renameSaved(ID, "Old account") : f.controller.deleteSaved(ID);
    await until(() => f.calls.length === 1);
    f.store.dispatch(sessionCleared({ reason: "Changed account" }));
    authenticate(f.store, OTHER);
    f.controller.openSaved(summary(deck(OTHER, "New account deck.pdf")));
    pending.resolve(method === "rename"
      ? reply({ data: { ...deck(), filename: "Old account", updatedAt: NEW } }) : reply(undefined, 204));
    await assert.rejects(operation);
    assert.equal(f.store.getState().workspace.deck.id, OTHER);
    assert.equal(f.store.getState().workspace.deck.filename, "New account deck.pdf");
    assert.deepEqual(f.store.getState().workspace.savedChanges, {});
  }
});

test("confirmed delete survives a stale page and failed refresh, and cannot reopen", async (t) => {
  const stale = deferred(), fresh = deferred();
  let reads = 0;
  const f = fixture(t, (config) => config.method === "delete" ? reply(undefined, 204)
    : ++reads === 1 ? reply({ data: page(deck(), deck(OTHER, "Keep this deck.pdf")) })
    : reads === 2 ? stale.promise : fresh.promise);
  await list(f.store).unwrap();
  const pending = list(f.store, { forceRefetch: true });
  await until(() => reads === 2);
  f.controller.openSaved(summary(deck(OTHER, "Keep this deck.pdf")));
  await f.controller.deleteSaved(ID);
  stale.resolve(reply({ data: page(deck(), deck(OTHER, "Keep this deck.pdf")) }));
  await pending;
  await until(() => reads === 3);
  const before = f.store.getState().workspace;
  const stop = t.mock.method(f.controller.capture, "stop");
  assert.deepEqual(visible(f.store).map((row) => row.id), [OTHER]);
  assert.throws(() => f.controller.openSaved(summary()), /deleted/);
  assert.equal(f.store.getState().workspace, before);
  assert.equal(stop.mock.callCount(), 0);
  fresh.resolve(reply({ error: "Refresh unavailable" }, 500));
  await until(() => presentationsApi.endpoints.listPresentations.select(undefined)(f.store.getState()).isError);
  assert.doesNotMatch(html(f), /Fictional workshop/);
  assert.match(html(f), /Keep this deck/);
  f.store.dispatch(deckCleared(OTHER));
  assert.deepEqual(f.store.getState().workspace.savedChanges[ID], { deleted: true });
  f.store.dispatch(sessionCleared({ reason: "Signed out" }));
  assert.deepEqual(f.store.getState().workspace.savedChanges, {});
});

test("confirmed rename survives stale pages/metadata and preserves submillisecond ordering", async (t) => {
  const stale = deferred(), fresh = deferred();
  let reads = 0;
  const renamed = { ...deck(), filename: "Latest workshop title", updatedAt: NEW };
  const f = fixture(t, (config) => config.method === "patch" ? reply({ data: renamed })
    : ++reads === 1 ? reply({ data: page(deck()) }) : reads === 2 ? stale.promise : fresh.promise);
  await list(f.store).unwrap();
  const pending = list(f.store, { forceRefetch: true });
  await until(() => reads === 2);
  await f.controller.renameSaved(ID, renamed.filename);
  stale.resolve(reply({ data: page(deck()) }));
  await pending;
  await until(() => reads === 3);
  fresh.resolve(reply({ error: "Refresh unavailable" }, 500));
  await until(() => presentationsApi.endpoints.listPresentations.select(undefined)(f.store.getState()).isError);
  assert.equal(visible(f.store)[0].filename, renamed.filename);
  f.controller.openSaved(summary());
  assert.equal(f.store.getState().workspace.deck.filename, renamed.filename);
  assert.equal(latestPresentationLabel(summary(), renamed).filename, renamed.filename);
  assert.doesNotMatch(html(f), /Fictional workshop/);
  assert.match(html(f), /Latest workshop title/);
});

test("successful upload invalidates the subscribed saved library", async (t) => {
  let reads = 0;
  const uploaded = { ...deck(OTHER, "New upload.pdf"), status: "queued" };
  const f = fixture(t, (config) => config.method === "post"
    ? reply({ data: uploaded }, 202)
    : reply({ data: ++reads === 1 ? page() : page(uploaded) }));
  await list(f.store).unwrap();
  await uploadPresentation(f.store, new File(["%PDF"], "New upload.pdf", { type: "application/pdf" })).unwrap();
  await until(() => visible(f.store).some((row) => row.id === OTHER));
  assert.equal(reads, 2);
  assert.equal(visible(f.store)[0].status, "queued");
});
