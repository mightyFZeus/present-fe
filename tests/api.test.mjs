import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { resolveObjectURL } from "node:buffer";
import axios from "axios";

process.env.NEXT_PUBLIC_API_BASE_URL = "http://localhost:8080";
const load = createRequire(import.meta.url);
const { makeStore } = load("../src/store/store.ts");
const { api } = load("../src/store/services/api.ts");
const { healthApi } = load("../src/features/health/healthApi.ts");
const { presentationsApi } = load("../src/features/presentations/presentationsApi.ts");
const { signInWithGoogle, logout } = load("../src/features/auth/authThunks.ts");
const { uploadPresentation, loadPresentationSource, loadSlideImage, releaseAsset } = load("../src/features/presentations/presentationThunks.ts");
const { connectLiveSession, stopLiveSession } = load("../src/features/live/liveThunks.ts");
const { LiveClient } = load("../src/features/live/LiveClient.ts");
const requestModule = load("../src/lib/api/request.ts");
const { presenterVoiceApi, saveAccountVoice, saveGuestVoice } = load(
  "../src/features/presenter-voice/presenterVoiceApi.ts",
);

const ID = "11111111-1111-4111-8111-111111111111";
const SLIDE = "22222222-2222-4222-8222-222222222222";
const SESSION = "33333333-3333-4333-8333-333333333333";
const SESSION2 = "44444444-4444-4444-8444-444444444444";
const EPOCH = "55555555-5555-4555-8555-555555555555";
const snapshot = { displayedSlideId: SLIDE, mainSlideId: SLIDE, returnPointId: null, visitedSlideIds: [SLIDE], version: 1, held: false };
const user = (id = ID) => ({ id, firstName: "Test", lastName: "Speaker", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
const token = (label = "a") => `header.${Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600, label })).toString("base64url")}.signature`;
const wireSession = (id = SESSION) => ({ sessionId: id, ticket: "a".repeat(64), ticketExpiresAt: new Date(Date.now() + 30_000).toISOString(), expiresAt: new Date(Date.now() + 300_000).toISOString(), wsPath: `/v1/live-sessions/${id}/stream`, audio: { encoding: "pcm_s16le", sampleRate: 16000, channels: 1 } });
const event = (type, fields = {}) => ({ type, sessionId: SESSION, epoch: EPOCH, generation: 1, version: 1, transcriptSeq: 0, held: false, acceptsAudio: true, isFinal: false, ...fields });
const proposal = (version = 1) => ({ action: "stay", slideId: SLIDE, confidence: 1, version, returnPointId: null });
function deferred() { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; }
async function until(check) { const deadline = Date.now() + 1000; while (!check()) { if (Date.now() > deadline) throw new Error("Expected async condition did not occur"); await new Promise((resolve) => setImmediate(resolve)); } }
class Socket {
  readyState = 0; bufferedAmount = 0; sent = []; closed = false;
  send(data) { this.sent.push(data); }
  close() { this.closed = true; this.readyState = 3; this.onclose?.({ code: 1000 }); }
  open() { this.readyState = 1; this.onopen?.(); }
  emit(value) { this.onmessage?.({ data: typeof value === "string" ? value : JSON.stringify(value) }); }
}
function fixture(t, handler = () => ({ data: { status: "ok" } }), options = {}) {
  const calls = [];
  const client = axios.create({ adapter: async (config) => {
    calls.push(config);
    const result = config.url === "/v1/users/auth/logout" ? { data: { signedOut: true } } : await handler(config);
    const response = { status: 200, statusText: "OK", headers: {}, config, data: result };
    if (result?.httpError) {
      response.status = result.httpError; response.data = result.body;
      throw new axios.AxiosError("HTTP request failed", "ERR_BAD_RESPONSE", config, undefined, response);
    }
    return response;
  } });
  const store = makeStore({ client, ...options });
  t.after(() => { store.dispatch(logout()); store.dispatch(api.util.resetApiState()); });
  return { store, calls, client };
}
async function login(store) { return signInWithGoogle(store, "google-one-use-token").unwrap(); }

// These tests use real source modules and reducers; only network/socket boundaries are fake.
test("health unwraps the backend envelope without Authorization", async (t) => {
  const { store, calls } = fixture(t);
  const result = await store.dispatch(healthApi.endpoints.getHealth.initiate()).unwrap();
  assert.deepEqual(result, { status: "ok" });
  assert.equal(calls[0].url, "/health");
  assert.equal(calls[0].headers.get("Authorization"), undefined);
});

test("sign-in consumes credentials, exposes sanitized results and keeps auth in memory", async (t) => {
  const accessToken = token();
  const { store, calls } = fixture(t, () => ({ data: { accessToken, expiresIn: 3600, user: user() } }));
  const result = await signInWithGoogle(store, "private-google-token");
  assert.equal(result.meta.arg.credentialId.startsWith("credential-"), true);
  assert.equal(JSON.stringify(result).includes("private-google-token"), false);
  assert.equal(JSON.stringify(result.payload).includes(accessToken), false);
  assert.equal(store.getState().auth.accessToken, accessToken);
  assert.equal(JSON.stringify(store.getState().api).includes(accessToken), false);
  assert.deepEqual(JSON.parse(calls[0].data), { idToken: "private-google-token" });
  assert.equal(calls[0].headers.get("Authorization"), undefined);
});

test("presentation paths, per-request Bearer, AI timeouts and multipart document field", async (t) => {
  const accessToken = token();
  const { store, calls, client } = fixture(t, (config) => config.url.includes("/auth/google")
    ? { data: { accessToken, expiresIn: 3600, user: user() } } : { data: { id: ID } });
  await login(store);
  await store.dispatch(presentationsApi.endpoints.getPresentation.initiate(ID));
  await store.dispatch(presentationsApi.endpoints.getPresentationSlides.initiate(ID));
  await store.dispatch(presentationsApi.endpoints.retrievePresentation.initiate({ presentationId: ID, query: "topic" }));
  await store.dispatch(presentationsApi.endpoints.proposePresentation.initiate({ presentationId: ID, transcript: "topic", snapshot }));
  const upload = await uploadPresentation(store, new File(["%PDF sample"], "deck.pdf", { type: "application/pdf" }));
  assert.equal(upload.meta.arg.uploadId.startsWith("upload-"), true);
  assert.deepEqual(calls.slice(1).map((call) => call.url), [`/v1/presentations/${ID}`, `/v1/presentations/${ID}/slides`, `/v1/presentations/${ID}/retrieve`, `/v1/presentations/${ID}/propose`, "/v1/presentations"]);
  for (const call of calls.slice(1)) assert.equal(call.headers.get("Authorization"), `Bearer ${accessToken}`);
  assert.equal(calls[3].timeout, 185_000); assert.equal(calls[4].timeout, 185_000);
  assert.equal(client.defaults.headers.common.Authorization, undefined);
  const form = calls.at(-1).data;
  assert.equal(form instanceof FormData, true);
  assert.deepEqual([...form.keys()], ["document"]);
  assert.notEqual(calls.at(-1).headers.get("Content-Type"), "application/json");
});

test("authenticated binary helpers keep Blobs outside Redux and revoke URLs", async (t) => {
  const { store, calls } = fixture(t, (config) => config.url.includes("/auth/google")
    ? { data: { accessToken: token(), expiresIn: 3600, user: user() } } : new Blob(["image"], { type: "image/png" }));
  await login(store);
  const source = await store.dispatch(loadPresentationSource({ presentationId: ID })).unwrap();
  const image = await store.dispatch(loadSlideImage({ presentationId: ID, slideId: SLIDE })).unwrap();
  assert.equal(calls[1].responseType, "blob");
  assert.equal(calls[2].url, `/v1/presentations/${ID}/slides/${SLIDE}/image`);
  assert.equal(resolveObjectURL(source.url) instanceof Blob, true);
  assert.equal(store.getState().assets.byKey[image.key].url, image.url);
  await store.dispatch(releaseAsset(source.key));
  assert.equal(resolveObjectURL(source.url), undefined);
  store.dispatch(logout());
  assert.equal(resolveObjectURL(image.url), undefined);
  assert.deepEqual(store.getState().assets.byKey, {});
});

test("current-session 401 clears auth/resources while public sign-in 401 preserves auth", async (t) => {
  let rejectLogin = false;
  const { store } = fixture(t, (config) => config.url.includes("/auth/google")
    ? rejectLogin ? { httpError: 401, body: { error: "Invalid Google token" } } : { data: { accessToken: token(), expiresIn: 3600, user: user() } }
    : { httpError: 401, body: new Blob([JSON.stringify({ error: "Session expired" })], { type: "application/json" }) });
  await login(store); const existing = store.getState().auth.accessToken;
  rejectLogin = true;
  await signInWithGoogle(store, "bad-google-token");
  assert.equal(store.getState().auth.accessToken, existing);
  let closed = false;
  store.resources.setLive({ close() { closed = true; }, sendPcm() {}, updateSnapshot() {} });
  await store.dispatch(loadPresentationSource({ presentationId: ID }));
  assert.equal(store.getState().auth.accessToken, null);
  assert.equal(closed, true);
});

test("late old-account success and 401 cannot repopulate cache or clear a new sign-in", async (t) => {
  let account = 0; const late = deferred();
  const { store } = fixture(t, (config) => config.url.includes("/auth/google")
    ? { data: { accessToken: token(String(++account)), expiresIn: 3600, user: user(account === 1 ? ID : SLIDE) } } : late.promise);
  await login(store);
  const old = store.dispatch(presentationsApi.endpoints.getPresentation.initiate(ID));
  await until(() => old.requestId);
  store.dispatch(logout()); await login(store);
  const current = store.getState().auth.accessToken;
  late.resolve({ httpError: 401, body: { error: "Expired old account" } });
  await old;
  assert.equal(store.getState().auth.accessToken, current);
  assert.equal(store.getState().auth.user.id, SLIDE);
  assert.equal(Object.values(store.getState().api.queries).some((query) => query?.data?.id === ID), false);
});

test("expiry and restartable cleanup invalidate resources and allow fresh requests", async (t) => {
  const { store, calls } = fixture(t, (config) => config.url.includes("/auth/google")
    ? { data: { accessToken: token(), expiresIn: 0.05, user: user() } } : { data: { status: "ok" } });
  await login(store);
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.equal(store.getState().auth.accessToken, null);
  store.dispatch(load("../src/features/auth/authSlice.ts").sessionCleared(undefined)); // Provider cleanup is local only.
  const health = await store.dispatch(healthApi.endpoints.getHealth.initiate()).unwrap();
  assert.deepEqual(health, { status: "ok" }); assert.equal(calls.at(-1).signal.aborted, false);
});

test("live client authenticates first, gates PCM/Hold and accepts active proposals before newer speech", async (t) => {
  const socket = new Socket(); const received = []; let connectedUrl;
  const client = new LiveClient(wireSession(), snapshot, "http://localhost:8080", (url) => { connectedUrl = url; return socket; }, {
    active: () => true, event: (value) => received.push(value), error: () => {}, ended: () => {},
  });
  t.after(() => client.close());
  const ready = client.connect();
  assert.throws(() => client.sendPcm(new Uint8Array(2)));
  socket.open();
  assert.deepEqual(JSON.parse(socket.sent[0]), { type: "auth", ticket: "a".repeat(64), snapshot });
  assert.equal(connectedUrl, `ws://localhost:8080/v1/live-sessions/${SESSION}/stream`);
  assert.throws(() => client.sendPcm(new Uint8Array(2)));
  socket.emit(event("ready")); await ready;
  socket.emit(event("transcript", { text: "newer speech", isFinal: true, transcriptSeq: 5 }));
  socket.emit(event("proposal", { transcriptSeq: 1, proposal: proposal() }));
  socket.emit(event("proposal", { transcriptSeq: 1, proposal: proposal() }));
  assert.equal(received.filter((item) => item.type === "proposal").length, 1);
  client.sendPcm(new Uint8Array(2)); assert.equal(socket.sent.at(-1) instanceof ArrayBuffer, true);
  assert.throws(() => client.sendPcm(new Uint8Array(3)));
  const held = { ...snapshot, version: 2, held: true };
  client.updateSnapshot(held); assert.throws(() => client.sendPcm(new Uint8Array(2)));
  socket.emit(event("stateAck", { generation: 2, version: 2, held: true, acceptsAudio: false }));
  socket.emit(event("ready", { generation: 2, version: 2, held: true, acceptsAudio: false }));
  assert.throws(() => client.sendPcm(new Uint8Array(2)));
  client.updateSnapshot({ ...snapshot, version: 3 });
  socket.emit(event("stateAck", { generation: 3, version: 3, acceptsAudio: false }));
  socket.emit(event("ready", { generation: 3, version: 3 }));
  socket.emit(event("ended", { generation: 2, version: 3, acceptsAudio: false }));
  client.sendPcm(new Uint8Array(2));
});

test("brief audio congestion drops frames without replay and sustained congestion stops following", async (t) => {
  let now = 0;
  t.mock.method(performance, "now", () => now);
  const socket = new Socket();
  const errors = [];
  const client = new LiveClient(wireSession(), snapshot, "http://localhost:8080", () => socket, {
    active: () => true, event() {}, error: (message) => errors.push(message), ended() {},
  });
  t.after(() => client.close());
  const ready = client.connect(); socket.open(); socket.emit(event("ready")); await ready;
  socket.bufferedAmount = 6400;
  client.sendPcm(new Uint8Array([1, 1]));
  now += 500;
  client.sendPcm(new Uint8Array([2, 2]));
  assert.equal(socket.closed, false);
  assert.equal(socket.sent.length, 1);

  socket.bufferedAmount = 0;
  client.sendPcm(new Uint8Array([3, 3]));
  assert.deepEqual(Array.from(new Uint8Array(socket.sent[1])), [3, 3]);
  assert.equal(socket.sent.length, 2);

  socket.bufferedAmount = 6400;
  client.sendPcm(new Uint8Array(2));
  now += 999;
  client.sendPcm(new Uint8Array(2));
  assert.equal(socket.closed, false);
  now += 1;
  assert.throws(() => client.sendPcm(new Uint8Array(2)), /Audio buffer exceeded/);
  assert.equal(socket.closed, true);
  assert.match(errors[0], /could not keep up with the audio/);
});

test("a bare ended event blocks audio and closes within a short grace period", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const socket = new Socket();
  const errors = [];
  const client = new LiveClient(wireSession(), snapshot, "http://localhost:8080", () => socket, {
    active: () => true, event() {}, error: (message) => errors.push(message), ended() {},
  });
  t.after(() => client.close());
  const ready = client.connect(); socket.open(); socket.emit(event("ready")); await ready;
  socket.emit(event("ended", { acceptsAudio: false }));
  assert.throws(() => client.sendPcm(new Uint8Array(2)), /Audio is not currently accepted/);
  t.mock.timers.tick(499);
  assert.equal(socket.closed, false);
  t.mock.timers.tick(1);
  assert.equal(socket.closed, true);
  assert.equal(socket.sent.length, 1);
  assert.match(errors[0], /The live connection ended/);
});

test("unexpected close reasons do not expose raw peer text", async (t) => {
  const socket = new Socket();
  const errors = [];
  const client = new LiveClient(wireSession(), snapshot, "http://localhost:8080", () => socket, {
    active: () => true, event() {}, error: (message) => errors.push(message), ended() {},
  });
  t.after(() => client.close());
  const ready = client.connect(); socket.open(); socket.emit(event("ready")); await ready;
  socket.readyState = 3;
  socket.onclose({ code: 1008, reason: "unrecognized peer details" });
  assert.deepEqual(errors, ["The live connection ended. Resume following when ready."]);
});

test("live operations enforce expiry even when timer callbacks have not run", async (t) => {
  const socket = new Socket(); let active = true;
  const session = wireSession();
  const client = new LiveClient(session, snapshot, "http://localhost:8080", () => socket, {
    active: () => active, event() {}, error() {}, ended() {},
  });
  t.after(() => client.close());
  const ready = client.connect(); socket.open(); socket.emit(event("ready")); await ready;
  t.mock.method(Date, "now", () => Date.parse(session.expiresAt) + 1);
  assert.throws(() => client.sendPcm(new Uint8Array(2)));
  assert.equal(socket.closed, true); active = false;
});

test("reverse-order connect responses and Stop invalidate pending live intents", async (t) => {
  const pending = []; const sockets = [];
  const { store } = fixture(t, (config) => config.url.includes("/auth/google")
    ? { data: { accessToken: token(), expiresIn: 3600, user: user() } }
    : (() => { const value = deferred(); pending.push(value); return value.promise; })(), {
      socketFactory(url) { const socket = new Socket(); sockets.push({ url, socket }); return socket; },
    });
  await login(store);
  const old = store.dispatch(connectLiveSession({ presentationId: ID, snapshot })); await until(() => pending.length === 1);
  const current = store.dispatch(connectLiveSession({ presentationId: ID, snapshot })); await until(() => pending.length === 2);
  pending[1].resolve({ data: wireSession(SESSION2) }); await until(() => sockets.length === 1);
  sockets[0].socket.open(); sockets[0].socket.emit(event("ready", { sessionId: SESSION2 }));
  const result = await current.unwrap();
  assert.equal(result.sessionId, SESSION2); assert.equal("ticket" in result, false);
  pending[0].resolve({ data: wireSession() }); assert.equal((await old).meta.requestStatus, "rejected");
  assert.equal(sockets.length, 1);
  const stopped = store.dispatch(connectLiveSession({ presentationId: ID, snapshot })); await until(() => pending.length === 3);
  await store.dispatch(stopLiveSession()); pending[2].resolve({ data: wireSession() }); await stopped;
  assert.equal(sockets.length, 1); assert.equal(store.getState().live.status, "ended");
});

test("aborting between ticket resolution and listener registration never opens a socket", async (t) => {
  let task; let opened = false;
  const { store } = fixture(t, () => ({ data: { accessToken: token(), expiresIn: 3600, user: user() } }), {
    socketFactory() { opened = true; return new Socket(); },
  });
  await login(store);
  const original = requestModule.request;
  t.after(() => { requestModule.request = original; });
  requestModule.request = async () => {
    queueMicrotask(() => task.abort());
    return { data: { data: wireSession() }, meta: { generation: store.getState().auth.generation } };
  };
  task = store.dispatch(connectLiveSession({ presentationId: ID, snapshot }));
  await task; await new Promise((resolve) => setImmediate(resolve));
  assert.equal(opened, false);
  assert.notEqual(store.getState().live.status, "connecting");
});


test("failed reconnect clears old ready state and synchronous abort never constructs a socket", async (t) => {
  const sockets = []; let rejectStart = false;
  const { store } = fixture(t, (config) => config.url.includes("/auth/google")
    ? { data: { accessToken: token(), expiresIn: 3600, user: user() } }
    : rejectStart ? { httpError: 503, body: { error: "Unavailable" } } : { data: wireSession() }, {
      socketFactory() { const socket = new Socket(); sockets.push(socket); return socket; },
    });
  await login(store);
  const first = store.dispatch(connectLiveSession({ presentationId: ID, snapshot }));
  await until(() => sockets.length === 1); sockets[0].open(); sockets[0].emit(event("ready")); await first.unwrap();
  rejectStart = true;
  await store.dispatch(connectLiveSession({ presentationId: ID, snapshot }));
  assert.equal(sockets[0].closed, true); assert.equal(store.resources.live, undefined);
  assert.equal(store.getState().live.acceptsAudio, false); assert.equal(store.getState().live.status, "error");
  rejectStart = false;
  let task;
  const unsubscribe = store.subscribe(() => {
    if (store.getState().live.status === "connecting" && store.getState().live.session) task.abort();
  });
  t.after(unsubscribe);
  task = store.dispatch(connectLiveSession({ presentationId: ID, snapshot }));
  await task; await new Promise((resolve) => setImmediate(resolve)); unsubscribe();
  assert.equal(sockets.length, 1); assert.equal(store.resources.live, undefined);
  assert.equal(store.getState().live.acceptsAudio, false);
});

test("foreign/query-bearing live paths are rejected before opening a socket", async (t) => {
  let opened = false;
  const { store } = fixture(t, (config) => config.url.includes("/auth/google")
    ? { data: { accessToken: token(), expiresIn: 3600, user: user() } }
    : { data: { ...wireSession(), wsPath: "wss://foreign.example/stream?ticket=secret" } }, {
      socketFactory() { opened = true; return new Socket(); },
    });
  await login(store);
  const result = await store.dispatch(connectLiveSession({ presentationId: ID, snapshot }));
  assert.equal(result.meta.requestStatus, "rejected"); assert.equal(opened, false);
  assert.equal(store.getState().live.acceptsAudio, false);
});

test("malformed live events fail closed with sanitized state", async (t) => {
  const socket = new Socket(); const errors = [];
  const client = new LiveClient(wireSession(), snapshot, "http://localhost:8080", () => socket, {
    active: () => true, event() {}, error: (message) => errors.push(message), ended() {},
  });
  t.after(() => client.close());
  const ready = client.connect(); const rejection = assert.rejects(ready);
  socket.open(); socket.emit('{"type":"ready","ticket":"do-not-expose"}');
  await rejection;
  assert.equal(socket.closed, true); assert.equal(errors[0].includes("do-not-expose"), false);
});

test("provider readiness may take longer than the five-second auth-frame allowance", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: Date.now() });
  const socket = new Socket();
  const client = new LiveClient(wireSession(), snapshot, "http://localhost:8080", () => socket, {
    active: () => true, event() {}, error() {}, ended() {},
  });
  t.after(() => client.close());
  const ready = client.connect(); socket.open();
  assert.equal(JSON.parse(socket.sent[0]).type, "auth");
  t.mock.timers.tick(6000);
  assert.equal(socket.closed, false);
  socket.emit(event("ready")); await ready;
});


test("live snapshots follow backend deck capacity without a duplicate frontend cap", () => {
  const { validSnapshot } = load("../src/features/live/liveValidationHelpers.ts");
  const visited = Array.from({ length: 25 }, (_, index) =>
    `22222222-2222-4222-8222-${String(index + 1).padStart(12, "0")}`);
  const current = { ...snapshot, displayedSlideId: visited[19], mainSlideId: visited[24], visitedSlideIds: visited };
  assert.equal(validSnapshot(current), true);
  assert.equal(validSnapshot({ ...current, visitedSlideIds: visited.slice(0, 20), mainSlideId: visited[19] }), true);
  assert.equal(validSnapshot({ ...current, visitedSlideIds: [...visited, visited[0]] }), false);
  assert.equal(validSnapshot({ ...current, visitedSlideIds: [...visited.slice(1), "invalid"] }), false);
  assert.equal(validSnapshot({ ...current, visitedSlideIds: visited.slice(0, 24) }), false);
  assert.equal(validSnapshot({ ...current, displayedSlideId: ID }), false);
});

test("presenter voice status and samples use authenticated routes and raw PCM", async (t) => {
  const accessToken = token();
  const guest = { presenterVoiceId: SESSION, expiresAt: new Date(Date.now() + 60_000).toISOString() };
  const { store, calls } = fixture(t, ({ url, method }) => {
    if (url.endsWith("/auth/google")) return { data: { accessToken, expiresIn: 3600, user: user() } };
    if (url.endsWith("/me/presenter-voice")) {
      return { data: { enabled: true, enrolled: method === "put" } };
    }
    return { data: guest };
  });
  await login(store);
  const status = store.dispatch(presenterVoiceApi.endpoints.presenterVoiceStatus.initiate());
  t.after(() => status.unsubscribe());
  assert.deepEqual(await status.unwrap(), { enabled: true, enrolled: false });

  const sample = new ArrayBuffer(320_000);
  const { signal } = new AbortController();
  await store.dispatch(saveAccountVoice(sample, signal));
  assert.deepEqual(
    presenterVoiceApi.endpoints.presenterVoiceStatus.select()(store.getState()).data,
    { enabled: true, enrolled: true },
  );
  assert.deepEqual(await store.dispatch(saveGuestVoice(ID, sample, signal)), guest);
  assert.deepEqual(calls.slice(1).map(({ url, method }) => [method, url]), [
    ["get", "/v1/users/me/presenter-voice"],
    ["put", "/v1/users/me/presenter-voice"],
    ["post", `/v1/presentations/${ID}/presenter-voice`],
  ]);
  for (const call of calls.slice(2)) {
    assert.equal(call.headers.get("Authorization"), `Bearer ${accessToken}`);
    assert.equal(call.headers.get("Content-Type"), "application/octet-stream");
    assert.equal(call.data, sample);
  }
});
