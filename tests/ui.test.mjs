import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { resolveObjectURL } from "node:buffer";
import axios from "axios";
import { PcmStreamEncoder, pcm16, lowpass } from "../public/audio/pcm-resampler.mjs";

process.env.NEXT_PUBLIC_API_BASE_URL = "http://localhost:8080";
const load = createRequire(import.meta.url);
const { makeStore } = load("../src/store/store.ts");
const { api } = load("../src/store/services/api.ts");
const { presentationsApi } = load("../src/features/presentations/presentationsApi.ts");
const { logout } = load("../src/features/auth/authThunks.ts");
const { sessionEstablished } = load("../src/features/auth/authSlice.ts");
const { releaseAsset } = load("../src/features/presentations/presentationThunks.ts");
const { liveConnecting, liveEventReceived } = load("../src/features/live/liveSlice.ts");
const { deckSelected, snapshotChanged, micChanged } = load("../src/features/workspace/workspaceSlice.ts");
const { initialSnapshot, manualSlide, proposalSnapshot } = load("../src/features/workspace/navigationHelpers.ts");
const { StateBridge } = load("../src/features/workspace/StateBridge.ts");
const { SlideAssets } = load("../src/features/workspace/SlideAssets.ts");
const { WorkspaceController } = load("../src/features/workspace/WorkspaceController.ts");
const { CaptureController } = load("../src/features/audio/CaptureController.ts");
const { GoogleIdentityBroker } = load("../src/features/auth/googleIdentity.ts");
const ID = "11111111-1111-4111-8111-111111111111";
const SESSION = "33333333-3333-4333-8333-333333333333";
const EPOCH = "55555555-5555-4555-8555-555555555555";
const slides = [1, 2, 3, 4].map((position) => ({ id: `22222222-2222-4222-8222-${String(position).padStart(12, "0")}`, position, title: `Topic ${position}`, text: "", notes: "", meaning: "" }));
const deck = { id: ID, filename: "talk.pdf", format: "pdf", status: "ready", outline: "", slideCount: 4, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
const wireSession = () => ({ sessionId: SESSION, ticket: "a".repeat(64), ticketExpiresAt: new Date(Date.now() + 30_000).toISOString(), expiresAt: new Date(Date.now() + 300_000).toISOString(), wsPath: `/v1/live-sessions/${SESSION}/stream`, audio: { encoding: "pcm_s16le", sampleRate: 16000, channels: 1 } });
const event = (type, fields = {}) => ({ type, sessionId: SESSION, epoch: EPOCH, generation: 1, version: 1, transcriptSeq: 0, held: false, acceptsAudio: true, isFinal: false, ...fields });
const proposal = (snapshot, action, slideId, confidence = 0.9) => ({ action, slideId, confidence, version: snapshot.version, returnPointId: action === "revisit" ? snapshot.mainSlideId : null });
const pause = () => new Promise((resolve) => setImmediate(resolve));
function deferred() { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; }
async function until(check) { const limit = performance.now() + 1200; while (!check()) { if (performance.now() > limit) throw new Error("Async condition did not occur"); await pause(); } }
class Socket {
  readyState = 0; bufferedAmount = 0; sent = []; closed = false;
  send(data) { this.sent.push(data); }
  close() { this.closed = true; this.readyState = 3; this.onclose?.({ code: 1000 }); }
  serverClose(code, reason) { this.closed = true; this.readyState = 3; this.onclose?.({ code, reason }); }
  open() { this.readyState = 1; this.onopen?.(); }
  emit(value) { this.onmessage?.({ data: JSON.stringify(value) }); }
}
function fixture(t, handler = () => ({ data: deck })) {
  const calls = [], sockets = [];
  const client = axios.create({ adapter: async (config) => {
    calls.push(config); const value = config.url === "/v1/users/auth/logout" ? { data: { signedOut: true } } : await handler(config);
    const response = { status: value?.httpError ?? 200, statusText: "OK", headers: {}, config, data: value?.httpError ? value.body : value };
    if (value?.httpError) throw new axios.AxiosError("HTTP failed", "ERR_BAD_RESPONSE", config, undefined, response);
    return response;
  } });
  const store = makeStore({ client, socketFactory() { const socket = new Socket(); sockets.push(socket); return socket; } });
  t.after(() => { store.dispatch(logout()); store.dispatch(api.util.resetApiState()); });
  return { store, calls, sockets };
}
function authenticate(store) {
  const a = store.getState().auth;
  store.dispatch(sessionEstablished({ generation: a.generation, attempt: a.loginAttempt, accessToken: "test-memory-token", expiresAt: Date.now() + 3600_000, user: { id: ID, firstName: "Test", lastName: "Speaker", createdAt: deck.createdAt, updatedAt: deck.updatedAt } }));
}
async function readyDeck(store) {
  authenticate(store); store.dispatch(deckSelected({ id: ID, filename: deck.filename }));
  store.dispatch(snapshotChanged({ snapshot: initialSnapshot(slides), source: "control", at: 0 }));
  await store.dispatch(presentationsApi.util.upsertQueryData("getPresentation", ID, deck));
}
function connectState(store, snapshot) {
  const { ticket: _ticket, ...metadata } = wireSession(); void _ticket;
  store.dispatch(liveConnecting({ session: metadata, presentationId: ID }));
  store.dispatch(liveEventReceived({ event: event("ready", { version: snapshot.version, held: snapshot.held, acceptsAudio: !snapshot.held }), at: Date.now() }));
}
function sendEvent(store, type, fields = {}) { store.dispatch(liveEventReceived({ event: event(type, fields), at: Date.now() })); }

// Same encoder imported by the browser worklet, with whole/chunked input compared byte-for-byte.
test("44.1/48k resampling is phase-continuous and emits fifty 20ms frames per second", () => {
  for (const rate of [44100, 48000]) {
    const input = Float32Array.from({ length: rate }, (_, i) => 0.5 * Math.sin(2 * Math.PI * 1000 * i / rate));
    const whole = new PcmStreamEncoder(rate).process(input);
    const chunked = [], encoder = new PcmStreamEncoder(rate); let cursor = 0;
    for (let n = 0; cursor < input.length; n++) { const length = [128, 63, 511, 7][n % 4]; chunked.push(...encoder.process(input.subarray(cursor, cursor + length))); cursor += length; }
    assert.equal(whole.length, 50); assert.equal(whole.every((frame) => frame.byteLength === 640), true);
    assert.deepEqual(Buffer.concat(chunked.map((frame) => Buffer.from(frame))), Buffer.concat(whole.map((frame) => Buffer.from(frame))));
    assert.equal(new PcmStreamEncoder(rate).process(new Float32Array(rate)).every((frame) => new Uint8Array(frame).every((x) => x === 0)), true);
  }
});
test("PCM is little-endian/clipped, filter rejects aliases and reset discards partial frames", () => {
  assert.deepEqual([-2, -1, 0, 1, 2, NaN, Infinity].map(pcm16), [-32768, -32768, 0, 32767, 32767, 0, 0]);
  const encoder = new PcmStreamEncoder(16000, 16000, 4);
  assert.deepEqual([...new Uint8Array(encoder.process([-1, 1, NaN, 2])[0])], [0, 128, 255, 127, 0, 0, 255, 127]);
  encoder.process([1, 1]); encoder.reset(); assert.equal(new Uint8Array(encoder.process([0, 0, 0, 0])[0]).every((x) => x === 0), true);
  assert.ok(Math.abs(lowpass(48000, 16000).reduce((a, b) => a + b, 0) - 1) < 1e-12);
  const rms = (frequency) => {
    const data = Float32Array.from({ length: 48000 }, (_, i) => 0.5 * Math.sin(2 * Math.PI * frequency * i / 48000));
    const output = Buffer.concat(new PcmStreamEncoder(48000).process(data).map((frame) => Buffer.from(frame)));
    let sum = 0; for (let i = 1280; i < output.length; i += 2) sum += (output.readInt16LE(i) / 32768) ** 2;
    return Math.sqrt(sum / ((output.length - 1280) / 2));
  };
  assert.ok(rms(1000) > 0.3); assert.ok(rms(12000) < rms(1000) / 100);
});
test("navigation preserves main/return/visited rules and rejects ambiguous/ineligible proposals", () => {
  const initial = initialSnapshot([...slides].reverse()); assert.equal(initial.displayedSlideId, slides[0].id); assert.equal(initial.held, true);
  let current = { ...initial, held: false };
  current = manualSlide(current, slides[2].id, slides); // Jumping never marks intervening slides visited.
  assert.deepEqual(current.visitedSlideIds, [slides[0].id, slides[2].id]);
  const revisit = proposalSnapshot(current, proposal(current, "revisit", slides[0].id), slides);
  assert.equal(revisit.mainSlideId, slides[2].id); assert.equal(revisit.returnPointId, slides[2].id);
  const advanced = proposalSnapshot(revisit, proposal(revisit, "advance", slides[3].id), slides);
  assert.equal(advanced.displayedSlideId, slides[3].id); assert.equal(advanced.mainSlideId, slides[3].id); assert.equal(advanced.returnPointId, null);
  assert.deepEqual(advanced.visitedSlideIds, [slides[0].id, slides[2].id, slides[3].id]);
  const skippedEarlier = proposalSnapshot(current, proposal(current, "revisit", slides[1].id), slides);
  assert.equal(skippedEarlier.displayedSlideId, slides[1].id); assert.equal(skippedEarlier.mainSlideId, slides[2].id); assert.equal(skippedEarlier.returnPointId, slides[2].id);
  const returned = proposalSnapshot(revisit, proposal(revisit, "return", slides[2].id), slides);
  assert.equal(returned.returnPointId, null); assert.equal(returned.version, revisit.version + 1);
  for (const p of [proposal(current, "revisit", "foreign"), proposal(current, "advance", slides[3].id, 0.79), proposal(current, "advance", slides[3].id, NaN), proposal(current, "advance", slides[3].id, Infinity), proposal(current, "advance", slides[3].id, 1.1), { ...proposal(current, "advance", slides[3].id), version: 0 }, proposal(current, "stay", slides[2].id), proposal(current, "execute", slides[3].id)]) assert.equal(proposalSnapshot(current, p, slides), current);
  const held = { ...current, held: true }; assert.equal(proposalSnapshot(held, proposal(held, "advance", slides[3].id), slides), held);
  assert.equal(manualSlide(current, "unknown", slides), current);
});
test("state bridge applies a confident spoken final topic from slide one and preserves skipped-slide return state", async (t) => {
  // Keep this five-slide speech fixture local; media/asset tests use the four-slide deck above.
  const deckSlides = [...slides, { ...slides[3], id: "22222222-2222-4222-8222-000000000005", position: 5, title: "Rollout: four weeks to a smarter campus" }];
  const { store } = fixture(t); authenticate(store); store.dispatch(deckSelected({ id: ID, filename: deck.filename }));
  await store.dispatch(presentationsApi.util.upsertQueryData("getPresentation", ID, { ...deck, slideCount: 5 }));
  let now = Date.now(); t.mock.method(Date, "now", () => now);
  let snapshot = { ...initialSnapshot(deckSlides), held: false };
  store.dispatch(snapshotChanged({ snapshot, source: "control", at: 0 }));
  connectState(store, snapshot); store.dispatch(micChanged({ status: "listening" }));
  const sent = []; store.resources.setLive({ close() {}, sendPcm() {}, updateSnapshot(value) { sent.push(value); } });
  const bridge = new StateBridge(store); bridge.setSlides(deckSlides); bridge.attach(); t.after(() => bridge.detach());
  sendEvent(store, "transcript", { text: "four weeks to a smarter campus", isFinal: true, transcriptSeq: 1 });
  sendEvent(store, "proposal", { transcriptSeq: 1, proposal: proposal(snapshot, "advance", deckSlides[4].id, 0.95) });
  snapshot = store.getState().workspace.snapshot;
  assert.equal(snapshot.displayedSlideId, deckSlides[4].id); assert.equal(snapshot.mainSlideId, deckSlides[4].id);
  assert.equal(snapshot.version, 2); assert.equal(snapshot.returnPointId, null);
  assert.deepEqual(snapshot.visitedSlideIds, [deckSlides[0].id, deckSlides[4].id]);
  assert.equal(sent[0].displayedSlideId, deckSlides[4].id);
  sendEvent(store, "ready", { version: 2, generation: 2 });
  sendEvent(store, "proposal", { version: 2, generation: 2, transcriptSeq: 2, proposal: proposal(snapshot, "revisit", deckSlides[1].id) });
  assert.equal(store.getState().workspace.snapshot.version, 2); // Auto cooldown still wins.
  now += 1600;
  sendEvent(store, "proposal", { version: 2, generation: 2, transcriptSeq: 3, proposal: proposal(snapshot, "revisit", deckSlides[1].id) });
  snapshot = store.getState().workspace.snapshot;
  assert.equal(snapshot.displayedSlideId, deckSlides[1].id); assert.equal(snapshot.mainSlideId, deckSlides[4].id); assert.equal(snapshot.returnPointId, deckSlides[4].id);
  assert.deepEqual(snapshot.visitedSlideIds, [deckSlides[0].id, deckSlides[4].id, deckSlides[1].id]);
  sendEvent(store, "ready", { version: 3, generation: 3 }); now += 1600;
  sendEvent(store, "proposal", { version: 3, generation: 3, transcriptSeq: 4, proposal: proposal(snapshot, "revisit", deckSlides[3].id) });
  snapshot = store.getState().workspace.snapshot;
  assert.equal(snapshot.displayedSlideId, deckSlides[3].id); assert.equal(snapshot.mainSlideId, deckSlides[4].id); assert.equal(snapshot.returnPointId, deckSlides[4].id);
  sendEvent(store, "ready", { version: 4, generation: 4 }); now += 1600;
  sendEvent(store, "proposal", { version: 4, generation: 4, transcriptSeq: 5, proposal: proposal(snapshot, "return", deckSlides[4].id) });
  snapshot = store.getState().workspace.snapshot;
  assert.equal(snapshot.displayedSlideId, deckSlides[4].id); assert.equal(snapshot.returnPointId, null); assert.equal(snapshot.version, 5);
  sendEvent(store, "ready", { version: 5, generation: 5 });
  snapshot = { ...snapshot, held: true, version: 6 };
  store.dispatch(snapshotChanged({ snapshot, source: "control", at: now }));
  sendEvent(store, "ready", { version: 6, generation: 6, held: true, acceptsAudio: false }); now += 1600;
  sendEvent(store, "proposal", { version: 6, generation: 6, held: true, acceptsAudio: false, transcriptSeq: 6, proposal: proposal(snapshot, "revisit", deckSlides[0].id) });
  assert.equal(store.getState().workspace.snapshot.version, 6);
  snapshot = { ...snapshot, held: false, version: 7 };
  store.dispatch(snapshotChanged({ snapshot, source: "control", at: now }));
  sendEvent(store, "ready", { version: 7, generation: 7 }); now += 1600;
  sendEvent(store, "proposal", { version: 7, generation: 7, transcriptSeq: 7, proposal: { ...proposal(snapshot, "revisit", deckSlides[0].id), version: 6 } });
  assert.equal(store.getState().workspace.snapshot.version, 7); // Stale proposal cannot move the current state.
});
test("state bridge coalesces rapid navigation, fences cooldown/manual precedence and catches a closed socket", async (t) => {
  const { store } = fixture(t); await readyDeck(store);
  let snapshot = { ...initialSnapshot(slides), held: false }; store.dispatch(snapshotChanged({ snapshot, source: "control", at: 0 }));
  connectState(store, snapshot); store.dispatch(micChanged({ status: "listening" }));
  const sent = []; store.resources.setLive({ close() {}, sendPcm() {}, updateSnapshot(value) { sent.push(value); } });
  const bridge = new StateBridge(store); bridge.setSlides(slides); bridge.attach(); t.after(() => bridge.detach());
  for (const target of [slides[1], slides[2], slides[3]]) { snapshot = manualSlide(snapshot, target.id, slides); store.dispatch(snapshotChanged({ snapshot, source: "manual", at: Date.now() })); }
  assert.deepEqual(sent.map((s) => s.version), [2]); // Busy server: retain only newest full snapshot.
  sendEvent(store, "ready", { version: 2, generation: 2 });
  assert.deepEqual(sent.map((s) => s.version), [2, 4]);
  sendEvent(store, "ready", { version: 4, generation: 3 });
  sendEvent(store, "proposal", { version: 4, generation: 3, transcriptSeq: 1, proposal: proposal(snapshot, "revisit", slides[0].id) });
  assert.equal(store.getState().workspace.snapshot.version, 4); assert.equal(store.getState().workspace.handledSequence, 1);
  const base = Date.now(); t.mock.method(Date, "now", () => base + 2000);
  sendEvent(store, "transcript", { version: 4, generation: 3, transcriptSeq: 20, text: "newer speech" });
  sendEvent(store, "proposal", { version: 4, generation: 3, transcriptSeq: 2, proposal: proposal(snapshot, "revisit", slides[0].id) });
  assert.equal(store.getState().workspace.snapshot.displayedSlideId, slides[0].id); // Published seq may trail transcript seq.
  sendEvent(store, "ready", { version: 5, generation: 4 });
  sendEvent(store, "proposal", { version: 5, generation: 4, transcriptSeq: 3, proposal: proposal(store.getState().workspace.snapshot, "return", slides[3].id) });
  assert.equal(store.getState().workspace.snapshot.version, 5); // Auto cooldown drops, never replays.
  store.resources.setLive({ close() {}, sendPcm() {}, updateSnapshot() { throw new Error("Closing"); } });
  assert.doesNotThrow(() => store.dispatch(snapshotChanged({ snapshot: { ...store.getState().workspace.snapshot, held: true, version: 6 }, source: "manual", at: Date.now() })));
  assert.equal(store.getState().workspace.mic.status, "error"); assert.equal(store.resources.live, undefined);
});
test("central slide owner bounds concurrency, cancels stale assets and protects replacement URLs", async (t) => {
  const pending = []; const { store } = fixture(t, () => { const d = deferred(); pending.push(d); return d.promise; }); await readyDeck(store);
  const owner = new SlideAssets(store); owner.attach(); t.after(() => owner.detach());
  const intent = store.getState().workspace.deckIntent;
  owner.load(ID, slides, intent); await until(() => pending.length === 3); assert.equal(pending.length, 3);
  owner.clear(); for (const d of pending) d.resolve(new Blob(["old"], { type: "image/png" })); await pause(); await pause();
  assert.deepEqual(store.getState().assets.byKey, {});
  owner.load(ID, [slides[0]], intent); await until(() => pending.length === 4); pending[3].resolve(new Blob(["first"], { type: "image/png" }));
  await until(() => store.getState().workspace.images[slides[0].id]?.status === "ready");
  const key = `/v1/presentations/${ID}/slides/${slides[0].id}/image`; const old = store.getState().assets.byKey[key].url;
  owner.retry(ID, slides[0].id, intent); await until(() => pending.length === 5); pending[4].resolve(new Blob(["second"], { type: "image/png" }));
  await until(() => store.getState().assets.byKey[key]?.url !== old && !!store.getState().assets.byKey[key]);
  const latest = store.getState().assets.byKey[key].url;
  await store.dispatch(releaseAsset({ key, url: old })); assert.equal(store.getState().assets.byKey[key].url, latest); assert.ok(resolveObjectURL(latest));
  owner.decodeFailed(slides[0].id, old); assert.equal(store.getState().assets.byKey[key].url, latest);
  owner.clear(); assert.equal(resolveObjectURL(latest), undefined);
});
test("Workspace replaces its controller on Fast Refresh without resetting the deck or starting capture", async (t) => {
  const deckSlides = [...slides, { ...slides[3], id: "22222222-2222-4222-8222-000000000005", position: 5, title: "Rollout: four weeks to a smarter campus" }];
  const readyPresentation = { ...deck, slideCount: 5 };
  const pendingImages = []; let completeImages = false;
  const f = fixture(t, (config) => {
    if (config.url.endsWith("/live-sessions")) return { data: wireSession() };
    if (completeImages) return new Blob(["slide"], { type: "image/png" });
    const image = deferred(); pendingImages.push(image); return image.promise;
  });
  authenticate(f.store); f.store.dispatch(deckSelected({ id: ID, filename: deck.filename }));
  const originalSnapshot = { ...initialSnapshot(deckSlides), version: 7 };
  f.store.dispatch(snapshotChanged({ snapshot: originalSnapshot, source: "control", at: 0 }));
  await f.store.dispatch(presentationsApi.util.upsertQueryData("getPresentation", ID, readyPresentation));
  const savedAuth = f.store.getState().auth, savedDeck = f.store.getState().workspace.deck;
  const react = load("react"), hooks = load("../src/store/hooks.ts");
  const queries = load("../src/features/presentations/presentationsApi.ts");
  const controllers = load("../src/features/workspace/WorkspaceController.ts");
  const originals = { useState: react.useState, useMemo: react.useMemo, useEffect: react.useEffect, selector: hooks.useAppSelector, store: hooks.useAppStore, metadata: queries.useGetPresentationQuery, slides: queries.useGetPresentationSlidesQuery, controller: controllers.WorkspaceController, css: load.extensions[".css"] };
  const slots = []; let cursor = 0, refreshing = false, effects = [], querySlides = deckSlides;
  const changed = (previous, next) => !previous || previous.length !== next.length || next.some((value, index) => value !== previous[index]);
  react.useState = (create) => {
    const index = cursor++;
    if (!slots[index]) slots[index] = { value: typeof create === "function" ? create() : create };
    return [slots[index].value, (value) => { slots[index].value = value; }];
  };
  react.useMemo = (create, deps) => {
    const index = cursor++;
    if (refreshing || changed(slots[index]?.deps, deps)) slots[index] = { value: create(), deps };
    return slots[index].value;
  };
  react.useEffect = (create, deps) => {
    const index = cursor++;
    if (refreshing || changed(slots[index]?.deps, deps)) effects.push({ index, create, deps });
  };
  hooks.useAppStore = () => f.store; hooks.useAppSelector = (select) => select(f.store.getState());
  queries.useGetPresentationQuery = () => ({ currentData: readyPresentation, isFetching: false });
  queries.useGetPresentationSlidesQuery = () => ({ currentData: querySlides, isFetching: false });
  load.extensions[".css"] = () => {};
  const lifecycle = [], constructed = [];
  const controllerClass = (revision) => class extends WorkspaceController {
    constructor(store) { super(store); this.revision = revision; constructed.push(this); }
    attach() { lifecycle.push(`${revision}:attach`); super.attach(); }
    detach() { lifecycle.push(`${revision}:detach`); super.detach(); }
  };
  controllers.WorkspaceController = controllerClass("before");
  const captureStart = t.mock.method(CaptureController.prototype, "start", async () => { throw new Error("Capture requires an explicit user action"); });
  const workspacePath = load.resolve("../src/features/workspace/Workspace.tsx");
  const googlePath = load.resolve("../src/features/auth/GoogleSignIn.tsx"), previousGoogle = load.cache[googlePath];
  delete load.cache[workspacePath];
  const { Workspace } = load(workspacePath);
  const { SlideStage } = load("../src/features/workspace/SlideStage.tsx");
  t.after(() => {
    for (const slot of slots) slot?.cleanup?.();
    Object.assign(react, { useState: originals.useState, useMemo: originals.useMemo, useEffect: originals.useEffect });
    hooks.useAppSelector = originals.selector; hooks.useAppStore = originals.store;
    queries.useGetPresentationQuery = originals.metadata; queries.useGetPresentationSlidesQuery = originals.slides;
    controllers.WorkspaceController = originals.controller;
    if (originals.css) load.extensions[".css"] = originals.css; else delete load.extensions[".css"];
    delete load.cache[workspacePath];
    if (previousGoogle) load.cache[googlePath] = previousGoogle; else delete load.cache[googlePath];
  });
  const find = (node, match) => {
    if (!node || typeof node !== "object") return undefined;
    if (match(node)) return node;
    for (const child of [node.props?.children].flat(Infinity)) { const found = find(child, match); if (found) return found; }
  };
  const render = (refresh = false) => {
    cursor = 0; effects = []; refreshing = refresh;
    const tree = Workspace(); refreshing = false;
    // React refresh retains state slots, invalidates memo/effect dependencies, and cleans up first.
    for (const effect of effects) slots[effect.index]?.cleanup?.();
    for (const effect of effects) slots[effect.index] = { deps: effect.deps, cleanup: effect.create() };
    return find(tree, (node) => node.type === SlideStage);
  };
  let stage = render(); const before = stage.props.controller;
  assert.equal(render().props.controller, before); assert.equal(constructed.length, 1);
  assert.deepEqual(lifecycle, ["before:attach"]);
  controllers.WorkspaceController = controllerClass("after");
  stage = render(true); const after = stage.props.controller;
  assert.notEqual(after, before); assert.equal(after.revision, "after");
  assert.deepEqual(lifecycle, ["before:attach", "before:detach", "after:attach"]);
  assert.equal(render().props.controller, after); assert.equal(constructed.length, 2);
  assert.equal(f.store.getState().auth, savedAuth); assert.deepEqual(f.store.getState().workspace.deck, savedDeck);
  assert.deepEqual(f.store.getState().workspace.snapshot, originalSnapshot);
  assert.equal(captureStart.mock.callCount(), 0); assert.equal(f.sockets.length, 0);

  // Feed a valid proposal through the real socket client, reducers, bridge and rendered viewer.
  const { connectLiveSession } = load("../src/features/live/liveThunks.ts");
  const snapshot = { ...f.store.getState().workspace.snapshot, held: false, version: 8 };
  f.store.dispatch(snapshotChanged({ snapshot, source: "control", at: 0 }));
  const connection = f.store.dispatch(connectLiveSession({ presentationId: ID, snapshot }));
  const socket = await finishReady(f, connection); f.store.dispatch(micChanged({ status: "listening" }));
  socket.emit(event("transcript", { version: 8, text: "four weeks to a smarter campus", transcriptSeq: 1, isFinal: true }));
  socket.emit(event("proposal", { version: 8, transcriptSeq: 1, proposal: proposal(snapshot, "advance", deckSlides[4].id) }));
  let current = f.store.getState().workspace.snapshot;
  assert.equal(current.displayedSlideId, deckSlides[4].id); assert.equal(current.mainSlideId, deckSlides[4].id);
  assert.deepEqual(current.visitedSlideIds, [deckSlides[0].id, deckSlides[4].id]); assert.equal(current.version, 9);
  const stateMessage = JSON.parse(socket.sent.at(-1)); assert.equal(stateMessage.type, "state"); assert.equal(stateMessage.snapshot.displayedSlideId, deckSlides[4].id);
  socket.emit(event("stateAck", { version: 9, generation: 2, acceptsAudio: false }));
  socket.emit(event("ready", { version: 9, generation: 2 }));
  assert.equal(f.store.getState().live.status, "ready"); assert.equal(f.store.getState().live.version, 9);
  completeImages = true; for (const image of pendingImages) image.resolve(new Blob(["slide"], { type: "image/png" }));
  await until(() => deckSlides.every((slide) => f.store.getState().workspace.images[slide.id]?.status === "ready"));
  for (let index = 0; index < 3; index++) {
    querySlides = deckSlides.map((slide) => ({ ...slide })); stage = render();
    assert.equal(stage.props.controller, after); assert.equal(f.store.getState().workspace.snapshot.displayedSlideId, deckSlides[4].id);
    const view = SlideStage(stage.props);
    assert.equal(find(view, (node) => node.props?.className === "slide-count").props.children, "5 / 5");
    assert.equal(find(view, (node) => node.props?.id === "stage-title").props.children, deckSlides[4].title);
  }
  assert.equal(captureStart.mock.callCount(), 0); assert.equal(f.store.getState().auth, savedAuth);
});

test("cancelled late upload cannot select a deck and stale deck slides cannot initialize navigation", async (t) => {
  const upload = deferred(); const { store } = fixture(t, () => upload.promise); authenticate(store);
  const controller = new WorkspaceController(store); controller.attach(); t.after(() => controller.detach());
  const task = controller.upload(new File(["pdf"], "deck.pdf", { type: "application/pdf" }));
  controller.cancelUpload(); upload.resolve({ data: deck }); await task;
  assert.equal(store.getState().workspace.deck, null); assert.equal(store.getState().workspace.upload.status, "idle");
  store.dispatch(deckSelected({ id: ID, filename: deck.filename })); controller.setSlides(ID, slides, store.getState().workspace.deckIntent - 1);
  assert.equal(store.getState().workspace.snapshot, null);
});

class FakeContext {
  state = "suspended"; sampleRate = 48000; currentTime = 1; destination = {}; sources = 0; closed = false;
  audioWorklet = { addModule: async () => {} };
  resume() { this.state = "running"; return Promise.resolve(); }
  close() { this.closed = true; this.state = "closed"; return Promise.resolve(); }
  createMediaStreamSource() { this.sources++; return { connect() {}, disconnect() {} }; }
  createGain() { return { gain: { value: 1 }, connect() {}, disconnect() {} }; }
}
function stream() { const track = { enabled: true, stopped: 0, onended: null, stop() { this.stopped++; } }; return { track, getTracks: () => [track] }; }
function capture(t, f, media) {
  const contexts = [], nodes = [];
  const controller = new CaptureController(f.store, {
    context() { const value = new FakeContext(); contexts.push(value); return value; }, media,
    worklet() { const value = { port: { onmessage: null, messages: [], postMessage(message) { this.messages.push(message); } }, onprocessorerror: null, connect() {}, disconnect() {} }; nodes.push(value); return value; },
  });
  controller.attach(); t.after(() => controller.detach()); return { controller, contexts, nodes };
}
async function finishReady(f, operation) {
  await until(() => f.sockets.length && f.sockets.at(-1).onopen); const socket = f.sockets.at(-1); socket.open();
  const auth = JSON.parse(socket.sent[0]); socket.emit(event("ready", { version: auth.snapshot.version })); await operation; return socket;
}
test("slow first permission happens before provider connection; muted tracks enable only after readiness", async (t) => {
  const permission = deferred(); const f = fixture(t, () => ({ data: wireSession() })); await readyDeck(f.store);
  const c = capture(t, f, () => permission.promise); const operation = c.controller.start(); await pause();
  assert.equal(f.calls.filter((call) => call.url !== "/v1/users/auth/logout").length, 0); assert.equal(f.store.getState().workspace.mic.status, "permission");
  const tracks = stream(); permission.resolve(tracks);
  await until(() => f.sockets.length === 1); assert.equal(tracks.track.enabled, false); assert.equal(c.contexts[0].sources, 0);
  const socket = await finishReady(f, operation); assert.equal(tracks.track.enabled, true); assert.equal(f.store.getState().workspace.mic.status, "listening");
  const node = c.nodes[0]; const revision = node.port.messages.at(-1).revision;
  node.port.onmessage({ data: { type: "pcm", revision, time: 1, buffer: new ArrayBuffer(640) } });
  assert.equal(socket.sent.filter((value) => value instanceof ArrayBuffer).length, 1);
  node.port.onmessage({ data: { type: "pcm", revision: "obsolete", time: 1, buffer: new ArrayBuffer(640) } });
  node.port.onmessage({ data: { type: "pcm", revision, time: 0, buffer: new ArrayBuffer(640) } });
  assert.equal(socket.sent.filter((value) => value instanceof ArrayBuffer).length, 1);
  sendEvent(f.store, "error", { version: f.store.getState().workspace.snapshot.version, code: "matching_unavailable", message: "Matching will retry", acceptsAudio: true });
  assert.equal(tracks.track.stopped, 0); assert.equal(f.store.getState().workspace.mic.status, "listening");
  const current = f.store.getState().workspace.snapshot;
  f.store.dispatch(snapshotChanged({ snapshot: { ...current, version: current.version + 1 }, source: "manual", at: Date.now() }));
  node.port.onmessage({ data: { type: "pcm", revision, time: 1, buffer: new ArrayBuffer(640) } });
  assert.equal(socket.sent.filter((value) => value instanceof ArrayBuffer).length, 1); // Drop old generation buffers.
  c.controller.hold(); assert.equal(tracks.track.stopped, 1); assert.equal(c.contexts[0].closed, true); assert.equal(f.store.getState().workspace.snapshot.held, true);
});
test("Stop/logout/absolute expiry while permission is pending stop late tracks without graph/provider", async (t) => {
  for (const reason of ["stop", "logout", "expiry"]) {
    const permission = deferred(); const f = fixture(t, () => ({ data: wireSession() })); await readyDeck(f.store);
    const c = capture(t, f, () => permission.promise); const operation = c.controller.start(); await pause();
    if (reason === "stop") c.controller.stop();
    if (reason === "logout") f.store.dispatch(logout());
    if (reason === "expiry") t.mock.method(Date, "now", () => f.store.getState().auth.expiresAt + 1);
    const tracks = stream(); permission.resolve(tracks); await operation;
    assert.equal(tracks.track.stopped, 1, reason); assert.equal(c.contexts[0].sources, 0); assert.equal(c.contexts[0].closed, true); assert.equal(f.calls.filter((call) => call.url !== "/v1/users/auth/logout").length, 0);
    t.mock.restoreAll();
  }
});
test("denied permission never opens provider and old worklet error cannot stop a later capture", async (t) => {
  const f = fixture(t, () => ({ data: wireSession() })); await readyDeck(f.store);
  let denied = true; const streams = [];
  const c = capture(t, f, () => { if (denied) return Promise.reject(new DOMException("Denied", "NotAllowedError")); const s = stream(); streams.push(s); return Promise.resolve(s); });
  await c.controller.start(); assert.equal(f.calls.filter((call) => call.url !== "/v1/users/auth/logout").length, 0); assert.equal(f.store.getState().workspace.mic.status, "error");
  denied = false; const first = c.controller.start(); const firstSocket = await finishReady(f, first);
  const lateClose = firstSocket.onclose;
  const oldHandler = c.nodes[0].onprocessorerror; c.controller.stop(); assert.equal(c.nodes[0].onprocessorerror, null);
  const second = c.controller.start(); await until(() => f.sockets.length === 2); const socket = await finishReady(f, second);
  oldHandler(); assert.equal(streams[1].track.stopped, 0); assert.equal(f.store.getState().workspace.mic.status, "listening");
  lateClose({ code: 1011, reason: "transcription unavailable" });
  assert.equal(f.store.getState().live.error, null);
  const node = c.nodes.at(-1);
  socket.readyState = 2;
  node.port.onmessage({ data: {
    type: "pcm", revision: node.port.messages.at(-1).revision, time: 1, buffer: new ArrayBuffer(640),
  } });
  assert.equal(streams[1].track.stopped, 0);
  assert.equal(socket.sent.length, 1);
  socket.emit(event("ended", { version: f.store.getState().workspace.snapshot.version, acceptsAudio: false }));
  assert.equal(streams[1].track.stopped, 1); assert.equal(c.contexts.at(-1).closed, true);
  assert.equal(f.store.getState().workspace.snapshot.held, true);
  assert.equal(socket.closed, false);
  socket.serverClose(1008, "audio rate exceeded");
  assert.equal(f.store.resources.live, undefined);
  assert.match(f.store.getState().live.error, /The server received audio too quickly/);
});
test("a terminal speech provider error stops the microphone and preserves the reason", async (t) => {
  const f = fixture(t, () => ({ data: wireSession() })); await readyDeck(f.store);
  const tracks = stream(); const c = capture(t, f, () => Promise.resolve(tracks));
  const operation = c.controller.start(); const socket = await finishReady(f, operation);
  socket.emit(event("error", {
    version: f.store.getState().workspace.snapshot.version,
    code: "transcription_unavailable",
    message: "provider detail",
    acceptsAudio: false,
  }));
  assert.equal(tracks.track.stopped, 1);
  assert.equal(f.store.resources.live, undefined);
  assert.equal(f.store.getState().workspace.mic.error, "Speech recognition is unavailable. Resume following to try again.");
  assert.equal(f.store.getState().workspace.snapshot.held, true);
});
test("sustained audio congestion keeps its error after microphone cleanup", async (t) => {
  const f = fixture(t, () => ({ data: wireSession() })); await readyDeck(f.store);
  const tracks = stream(); const c = capture(t, f, () => Promise.resolve(tracks));
  const operation = c.controller.start(); const socket = await finishReady(f, operation);
  const node = c.nodes[0];
  const sendAudio = () => node.port.onmessage({ data: {
    type: "pcm", revision: node.port.messages.at(-1).revision, time: 1, buffer: new ArrayBuffer(640),
  } });
  let now = 0;
  t.mock.method(performance, "now", () => now);
  socket.bufferedAmount = 6400;
  sendAudio();
  assert.equal(f.store.getState().workspace.mic.status, "listening");
  now += 1000;
  sendAudio();
  assert.equal(tracks.track.stopped, 1);
  assert.equal(f.store.resources.live, undefined);
  assert.match(f.store.getState().workspace.mic.error, /could not keep up with the audio/);
});
test("hiding the presenter tab stops capture and waits for explicit resume", async (t) => {
  const f = fixture(t, () => ({ data: wireSession() })); await readyDeck(f.store);
  const tracks = stream(); const c = capture(t, f, () => Promise.resolve(tracks));
  const document = Object.assign(new EventTarget(), { hidden: false });
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
  Object.defineProperty(globalThis, "document", { value: document, configurable: true });
  const workspace = new WorkspaceController(f.store);
  workspace.capture = c.controller;
  workspace.attach();
  t.after(() => {
    workspace.detach();
    if (previousDocument) Object.defineProperty(globalThis, "document", previousDocument);
    else delete globalThis.document;
  });
  const operation = workspace.capture.start(); const socket = await finishReady(f, operation);

  document.hidden = true;
  document.dispatchEvent(new Event("visibilitychange"));
  assert.equal(tracks.track.stopped, 1);
  assert.equal(socket.closed, true);
  assert.equal(f.store.getState().workspace.mic.status, "held");

  document.hidden = false;
  document.dispatchEvent(new Event("visibilitychange"));
  assert.equal(f.sockets.length, 1);
  assert.equal(f.store.getState().workspace.snapshot.held, true);
});
test("terminal cleanup clears expired auth immediately even when its timer is delayed", async (t) => {
  const f = fixture(t, () => ({ data: wireSession() })); await readyDeck(f.store);
  const tracks = stream(); const c = capture(t, f, () => Promise.resolve(tracks));
  const operation = c.controller.start(); await finishReady(f, operation);
  const expiry = f.store.getState().auth.expiresAt;
  t.mock.method(Date, "now", () => expiry + 1);
  f.sockets[0].emit(event("ended", { version: f.store.getState().workspace.snapshot.version, acceptsAudio: false }));
  assert.equal(tracks.track.stopped, 1); assert.equal(c.contexts[0].closed, true);
  assert.equal(f.store.getState().auth.accessToken, null);
  assert.equal(f.store.getState().workspace.mic.status, "off");
});
test("GSI broker initializes once and consumes only the active one-use owner nonce", async () => {
  let callback; const buttons = [], credentials = []; let initialize = 0, nonce = 0;
  const sdk = { initialize(options) { initialize++; callback = options.callback; assert.equal(options.auto_select, false); }, renderButton(_element, options) { buttons.push(options.state); }, disableAutoSelect() {} };
  const broker = new GoogleIdentityBroker(async () => sdk, () => `nonce-${++nonce}`);
  const element = { replaceChildren() {} }; let active = true;
  const owner = { element, active: () => active, status() {}, credential: (value) => credentials.push(value) };
  const remove = broker.mount("client", owner); await pause(); callback({ state: buttons[0], credential: "one" }); callback({ state: buttons[0], credential: "duplicate" });
  remove(); const remove2 = broker.mount("client", owner); await pause(); active = false; callback({ state: buttons[1], credential: "stale" }); active = true;
  callback({ state: buttons[1], credential: "retry" }); remove2(); callback({ state: buttons[1], credential: "unmounted" });
  assert.equal(initialize, 1); assert.notEqual(buttons[0], buttons[1]); assert.deepEqual(credentials, ["one", "retry"]);
});
test("actual Google component remounts a fresh broker nonce after a delayed backend rejection", async (t) => {
  process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID = "public-client";
  const pending = []; const f = fixture(t, () => { const d = deferred(); pending.push(d); return d.promise; });
  f.store.dispatch(load("../src/features/auth/authSlice.ts").restoreFinished({ generation: 0, attempt: 0 }));
  const react = load("react"), hooks = load("../src/store/hooks.ts"), identity = load("../src/features/auth/googleIdentity.ts");
  const originals = { useRef: react.useRef, useEffect: react.useEffect, selector: hooks.useAppSelector, store: hooks.useAppStore, broker: identity.googleIdentity };
  t.after(() => { react.useRef = originals.useRef; react.useEffect = originals.useEffect; hooks.useAppSelector = originals.selector; hooks.useAppStore = originals.store; identity.googleIdentity = originals.broker; delete process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID; });
  let callback, nonce = 0; const states = []; const sdk = { initialize(value) { callback = value.callback; }, renderButton(_element, options) { states.push(options.state); }, disableAutoSelect() {} };
  identity.googleIdentity = new GoogleIdentityBroker(async () => sdk, () => `attempt-${++nonce}`);
  const host = { replaceChildren() {} }; let effect, dependencies, previous, cleanup;
  react.useRef = () => ({ current: host }); react.useEffect = (fn, deps) => { effect = fn; dependencies = deps; };
  hooks.useAppSelector = (select) => select(f.store.getState()); hooks.useAppStore = () => f.store;
  const { GoogleSignIn } = load("../src/features/auth/GoogleSignIn.tsx");
  const render = () => { GoogleSignIn(); if (!previous || dependencies.some((value, index) => value !== previous[index])) { cleanup?.(); previous = dependencies; cleanup = effect(); } };
  t.after(() => cleanup?.());
  render(); await pause(); assert.equal(states.length, 1);
  callback({ state: states[0], credential: "first-google-token" }); render(); await until(() => pending.length === 1);
  pending[0].resolve({ httpError: 401, body: { error: "Try sign-in again" } }); await until(() => !f.store.getState().auth.isSigningIn); render(); await pause();
  assert.equal(states.length, 2); assert.notEqual(states[0], states[1]);
  callback({ state: states[1], credential: "second-google-token" }); render(); await until(() => pending.length === 2);
  pending[1].resolve({ httpError: 401, body: { error: "Still invalid" } }); await until(() => !f.store.getState().auth.isSigningIn);
  assert.equal(JSON.parse(f.calls[1].data).idToken, "second-google-token");
});
