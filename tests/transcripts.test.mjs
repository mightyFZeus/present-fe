import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import axios from "axios";
const load = createRequire(import.meta.url);
process.env.NEXT_PUBLIC_API_BASE_URL = "http://localhost:8080";
const { makeStore } = load("../src/store/store.ts");
const { sessionEstablished, sessionCleared } = load("../src/features/auth/authSlice.ts");
const { liveConnecting, livePreparing, liveFailed, transcriptFinished, liveReset } = load("../src/features/live/liveSlice.ts");
const { connectLiveSession } = load("../src/features/live/liveThunks.ts");
const { downloadTranscript } = load("../src/features/transcripts/transcriptDownload.ts");
const { transcriptApi } = load("../src/features/transcripts/transcriptApi.ts");
const { readLiveSession } = load("../src/features/live/liveValidationHelpers.ts");
const ID = "11111111-1111-4111-8111-111111111111";
const GROUP = "22222222-2222-4222-8222-222222222222";
const DATE = "2026-11-27T10:00:00Z";
const snapshot = { displayedSlideId: ID, mainSlideId: ID, returnPointId: null, visitedSlideIds: [ID], version: 1, held: false };
const metadata = { sessionId: ID, transcriptId: GROUP, wsPath: `/v1/live-sessions/${ID}/stream`, expiresAt: new Date(Date.now()+3600000).toISOString(), ticketExpiresAt: new Date(Date.now()+30000).toISOString(), audio: { encoding: "pcm_s16le", sampleRate: 16000, channels: 1 } };
function fixture(t, handler) {
  const calls = [];
  const client = axios.create({ adapter: async (config) => {
    calls.push(config);
    const value = await handler(config);
    const response = { config, status: value.status ?? 200, data: value.data, headers: {}, statusText: "Test" };
    if (response.status >= 400) throw new axios.AxiosError("Failed", "ERR_BAD_RESPONSE", config, undefined, response);
    return response;
  } });
  const store = makeStore({ client });
  store.dispatch(sessionEstablished({ generation: 0, attempt: 0, accessToken: "fictional-test-token", expiresAt: Date.now()+3600000, user: { id: ID, firstName: "Test", lastName: "Presenter", createdAt: DATE, updatedAt: DATE } }));
  t.after(() => { store.dispatch(sessionCleared()); store.dispatch(transcriptApi.util.resetApiState()); });
  return { store, calls };
}

test("failed Resume keeps the same transcript identity until explicit Stop", async (t) => {
  const f = fixture(t, () => ({ status: 503, data: { error: "Unavailable" } }));
  f.store.dispatch(liveConnecting({ session: metadata, presentationId: ID }));
  f.store.dispatch(livePreparing(ID));
  f.store.dispatch(liveFailed("Resume failed"));
  assert.equal(f.store.getState().live.transcriptId, GROUP);
  for (let i = 0; i < 2; i++) {
    await f.store.dispatch(connectLiveSession({ presentationId: ID, snapshot, transcriptId: f.store.getState().live.transcriptId }));
    assert.equal(JSON.parse(f.calls.at(-1).data).transcriptId, GROUP);
    assert.equal(f.store.getState().live.transcriptId, GROUP);
  }
  f.store.dispatch(transcriptFinished());
  assert.equal(f.store.getState().live.transcriptId, null);
  f.store.dispatch(liveConnecting({ session: metadata, presentationId: ID }));
  f.store.dispatch(liveReset());
  assert.equal(f.store.getState().live.transcriptId, null);
});

test("authenticated transcript download saves a text file and revokes its URL", async (t) => {
  const f = fixture(t, () => ({ data: new Blob(["Final speech."], { type: "text/plain; charset=utf-8" }) }));
  const original = { document: globalThis.document, create: URL.createObjectURL, revoke: URL.revokeObjectURL };
  let clicked = false, removed = false, revoked;
  const link = { click() { clicked = true; }, remove() { removed = true; } };
  globalThis.document = { createElement: () => link, body: { appendChild() {} } };
  URL.createObjectURL = () => "blob:transcript";
  URL.revokeObjectURL = (url) => { revoked = url; };
  t.after(() => { globalThis.document = original.document; URL.createObjectURL = original.create; URL.revokeObjectURL = original.revoke; });
  await f.store.dispatch(downloadTranscript({ presentationId: ID, transcriptId: GROUP })).unwrap();
  assert.ok(clicked && removed);
  assert.equal(revoked, "blob:transcript");
  assert.equal(link.download, `prezntly-session-${GROUP}.txt`);
  assert.equal(f.calls[0].headers.get("Authorization"), "Bearer fictional-test-token");
  assert.equal(f.calls[0].url, `/v1/presentations/${ID}/transcripts/${GROUP}/download`);
  assert.equal(JSON.stringify(f.store.getState()).includes("Final speech."), false);
});

test("a late download after logout cannot create a file", async (t) => {
  let resolve;
  const pending = new Promise((done) => { resolve = done; });
  const f = fixture(t, () => pending);
  const operation = f.store.dispatch(downloadTranscript({ presentationId: ID, transcriptId: GROUP }));
  f.store.dispatch(sessionCleared());
  resolve({ data: new Blob(["Private speech"], { type: "text/plain" }) });
  const result = await operation;
  assert.equal(result.meta.requestStatus, "rejected");
});

test("old and new live responses retain compatible transcript metadata", () => {
  const response = { ...metadata, ticket: "a".repeat(64) };
  assert.equal(readLiveSession(response, "https://api.example.com").transcriptId, GROUP);
  const { transcriptId, ...legacy } = response;
  assert.equal(readLiveSession(legacy, "https://api.example.com").transcriptId, undefined);
  assert.equal(readLiveSession({ ...response, transcriptId: "bad" }, "https://api.example.com"), undefined);
});


test("Stop closes only its transcript and retains a failed finish for retry", async (t) => {
  const { CaptureController } = load("../src/features/audio/CaptureController.ts");
  const { transcriptFinishKey } = load("../src/features/transcripts/transcriptApi.ts");
  let resolve;
  let fail = true;
  const pending = new Promise((done) => { resolve = done; });
  const f = fixture(t, async () => {
    await pending;
    return fail ? { status: 503, data: { error: "Retry later" } } : { status: 204 };
  });
  f.store.dispatch(liveConnecting({ session: metadata, presentationId: ID }));
  const capture = new CaptureController(f.store);
  capture.stop();
  assert.equal(f.store.getState().workspace.mic.status, "off");
  assert.equal(f.store.getState().live.transcriptId, null);
  const nextGroup = "33333333-3333-4333-8333-333333333333";
  f.store.dispatch(liveConnecting({ session: { ...metadata, transcriptId: nextGroup }, presentationId: ID }));
  resolve();
  const select = transcriptApi.endpoints.finishTranscript.select({ fixedCacheKey: transcriptFinishKey(ID, GROUP) });
  for (let i = 0; i < 100 && !select(f.store.getState()).isError; i++) await new Promise(setImmediate);
  assert.equal(select(f.store.getState()).isError, true);
  assert.equal(f.store.getState().live.transcriptId, nextGroup, "late failure must not replace the next session");
  fail = false;
  await f.store.dispatch(transcriptApi.endpoints.finishTranscript.initiate(
    { presentationId: ID, transcriptId: GROUP },
    { fixedCacheKey: transcriptFinishKey(ID, GROUP) },
  )).unwrap();
  assert.equal(select(f.store.getState()).isSuccess, true);
  assert.equal(f.store.getState().live.transcriptId, nextGroup);
  assert.ok(f.calls.every((call) => call.url.endsWith(`/transcripts/${GROUP}/finish`)));
});

test("transcript save failures tell the presenter to Stop rather than Resume", async () => {
  const { LiveClient } = load("../src/features/live/LiveClient.ts");
  let socket;
  const errors = [];
  const response = { ...metadata, ticket: "a".repeat(64), ticketExpiresAt: new Date(Date.now()+30000).toISOString(), expiresAt: new Date(Date.now()+300000).toISOString() };
  const client = new LiveClient(response, snapshot, "https://api.example.com", () => (socket = {
    readyState: 0, bufferedAmount: 0,
    send() {}, close() { this.readyState = 3; },
  }), { active: () => true, event() {}, error: (message) => errors.push(message), ended() {} });
  const connected = client.connect();
  socket.readyState = 1; socket.onopen();
  const base = { sessionId: ID, epoch: GROUP, generation: 1, version: 1, transcriptSeq: 0, held: false, isFinal: false };
  socket.onmessage({ data: JSON.stringify({ ...base, type: "ready", acceptsAudio: true }) });
  await connected;
  socket.onmessage({ data: JSON.stringify({ ...base, type: "error", acceptsAudio: false, code: "transcript_save_failed", message: "untrusted private provider details" }) });
  assert.equal(errors.length, 1);
  assert.match(errors[0], /select Stop/);
  assert.doesNotMatch(errors[0], /Resume|untrusted/);
  client.close();
});
