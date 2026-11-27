import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import axios from "axios";

process.env.NEXT_PUBLIC_API_BASE_URL = "http://localhost:8080";
const load = createRequire(import.meta.url);
const { makeStore } = load("../src/store/store.ts");
const { sessionEstablished } = load("../src/features/auth/authSlice.ts");
const { logout } = load("../src/features/auth/authThunks.ts");
const { deckSelected, snapshotChanged, micChanged, micLevel, workspaceReset } = load("../src/features/workspace/workspaceSlice.ts");
const viewModule = load("../src/features/workspace/presentationSlice.ts");
const { presentationEntered, presentationExited, presentationControlsHidden, selectPresentation } = viewModule;
const { installPresentationStore } = load("../src/features/workspace/presentationStore.ts");
const { PresentationController } = load("../src/features/workspace/PresentationController.ts");
const { liveEventReceived } = load("../src/features/live/liveSlice.ts");
const ID = "11111111-1111-4111-8111-111111111111";
const slides = [1, 2].map((position) => ({ id: `22222222-2222-4222-8222-${String(position).padStart(12, "0")}`, position, title: `Topic ${position}`, text: "", meaning: "", notes: "" }));
function fixture(t, install = true) {
  const calls = { network: 0, sockets: 0, start: 0, hold: 0, stop: 0 };
  const client = axios.create({ adapter: async () => { calls.network++; throw new Error("Unexpected network"); } });
  const store = makeStore({ client, socketFactory() { calls.sockets++; throw new Error("Unexpected socket"); } });
  const auth = store.getState().auth;
  store.dispatch(sessionEstablished({ generation: auth.generation, attempt: auth.loginAttempt, accessToken: "test-token", expiresAt: Date.now() + 3600000, user: { id: ID, firstName: "Test", lastName: "Presenter", createdAt: "2026-11-04T00:00:00Z", updatedAt: "2026-11-04T00:00:00Z" } }));
  store.dispatch(deckSelected({ id: ID, filename: "slides.pdf" }));
  store.dispatch(snapshotChanged({ snapshot: { displayedSlideId: slides[0].id, mainSlideId: slides[0].id, visitedSlideIds: [slides[0].id], returnPointId: null, version: 1, held: false }, source: "control", at: 0 }));
  if (install) installPresentationStore(store);
  const workspace = { capture: {
    start: async () => { calls.start++; },
    hold: () => { calls.hold++; const s = store.getState().workspace.snapshot; if (s && !s.held) store.dispatch(snapshotChanged({ snapshot: { ...s, held: true, version: s.version + 1 }, source: "control", at: 0 })); store.dispatch(micChanged({ status: "held" })); },
    stop: () => { calls.stop++; store.dispatch(micChanged({ status: "off" })); },
  }, navigate() {}, assets: { decodeFailed() {} } };
  t.after(() => store.dispatch(logout()));
  return { store, calls, workspace };
}
class Element extends EventTarget {
  isConnected = true;
  focused = 0;
  tabIndex = 0;
  constructor(document) { super(); this.ownerDocument = document; }
  focus() { this.focused++; this.ownerDocument.activeElement = this; }
  contains(value) { return value === this || this.children?.includes(value); }
  getClientRects() { return [{}]; }
}
function surface() {
  const document = new EventTarget();
  document.body = Object.assign(new Element(document), { style: { overflow: "auto" } }); document.documentElement = new Element(document); document.fullscreenElement = null;
  const root = new Element(document), stage = new Element(document), entry = new Element(document), toolbar = new Element(document), control = new Element(document);
  const lastControl = new Element(document); toolbar.children = [control, lastControl];
  toolbar.querySelectorAll = () => toolbar.children.filter((button) => !button.disabled);
  document.activeElement = entry;
  root.querySelector = (selector) => selector === ".slide-stage" ? stage : selector === "[data-presentation-controls]" ? toolbar : selector === "[data-presentation-entry]" ? entry : null;
  root.requestFullscreen = async () => { document.fullscreenElement = root; document.dispatchEvent(new Event("fullscreenchange")); };
  document.exitFullscreen = async () => { document.fullscreenElement = null; document.dispatchEvent(new Event("fullscreenchange")); };
  return { root, stage, entry, toolbar, control, lastControl, document };
}
function clock() {
  let now = 0, next = 0; const timers = new Map(), frames = new Map();
  return {
    later(fn, delay) { const id = ++next; timers.set(id, { fn, due: now + delay }); return id; },
    cancel(id) { timers.delete(id); },
    frame(fn) { const id = ++next; frames.set(id, fn); return id; },
    cancelFrame(id) { frames.delete(id); },
    flushFrames() { for (const [id, fn] of [...frames]) { frames.delete(id); fn(); } },
    advance(ms) { now += ms; for (const [id, timer] of [...timers]) if (timer.due <= now) { timers.delete(id); timer.fn(); } },
    pending() { return timers.size + frames.size; },
  };
}
function attached(t) {
  const f = fixture(t), dom = surface(), time = clock();
  const controller = new PresentationController(f.store, f.workspace, time); controller.attach(dom.root);
  t.after(() => controller.detach());
  return { ...f, ...dom, time, controller };
}
function deferred() { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; }
function key(document, value, shiftKey = false) { const event = Object.assign(new Event("keydown", { cancelable: true }), { key: value, shiftKey }); document.dispatchEvent(event); return event; }
function find(node, match) {
  if (!node || typeof node !== "object") return;
  if (match(node)) return node;
  for (const child of [node.props?.children].flat(Infinity)) { const value = find(child, match); if (value) return value; }
}

test("presentation reducer injection preserves retained auth, deck, API and live resources across HMR", (t) => {
  const f = fixture(t, false); f.store.dispatch(micChanged({ status: "listening" }));
  let closes = 0;
  const before = f.store.getState(), resources = f.store.resources, live = { close() { closes++; } };
  resources.setLive(live); let cleanup = 0; const unregister = resources.registerCleanup("session", () => cleanup++);
  t.after(() => { unregister(); resources.setLive(undefined); });
  const replace = f.store.replaceReducer; let replacements = 0;
  f.store.replaceReducer = (reducer) => { replacements++; replace(reducer); };
  assert.equal(selectPresentation(before).active, false);
  installPresentationStore(f.store); installPresentationStore(f.store);
  assert.equal(replacements, 1); assert.equal(selectPresentation(f.store.getState()).active, true);
  for (const name of Object.keys(before)) assert.equal(f.store.getState()[name], before[name]);
  assert.equal(f.store.resources, resources); assert.equal(resources.live, live); assert.equal(cleanup, 0);
  const path = load.resolve("../src/features/workspace/presentationStore.ts"), previous = load.cache[path];
  const originalReducer = viewModule.presentationReducer;
  t.after(() => { viewModule.presentationReducer = originalReducer; load.cache[path] = previous; });
  viewModule.presentationReducer = (state, action) => action.type === "test/refreshedPresentationReducer" ? { ...state, fullscreenError: "Updated reducer" } : originalReducer(state, action);
  delete load.cache[path]; load(path).installPresentationStore(f.store);
  f.store.dispatch({ type: "test/refreshedPresentationReducer" });
  assert.equal(replacements, 2); assert.equal(selectPresentation(f.store.getState()).fullscreenError, "Updated reducer");
  for (const name of Object.keys(before)) assert.equal(f.store.getState()[name], before[name]);
  assert.equal(resources.live, live); assert.equal(cleanup, 0); assert.equal(closes, 0); assert.equal(f.calls.network + f.calls.sockets + f.calls.start, 0);
});

test("listening latches presentation through Hold, Stop, errors and gaps; deck/session resets clear it", (t) => {
  const { store } = fixture(t);
  store.dispatch(micChanged({ status: "listening" })); assert.equal(selectPresentation(store.getState()).active, true);
  for (const status of ["held", "off", "error", "connecting"]) {
    store.dispatch(micChanged({ status })); assert.equal(selectPresentation(store.getState()).active, true);
  }
  store.dispatch(deckSelected({ id: ID, filename: "new.pdf" })); assert.equal(selectPresentation(store.getState()).active, false);
  store.dispatch(presentationEntered()); store.dispatch(workspaceReset()); assert.equal(selectPresentation(store.getState()).active, false);
});

test("manual Presentation view entry never starts microphone, media, sockets or HTTP", (t) => {
  const f = fixture(t), hooks = load("../src/store/hooks.ts");
  const original = { selector: hooks.useAppSelector, store: hooks.useAppStore };
  t.after(() => { hooks.useAppSelector = original.selector; hooks.useAppStore = original.store; });
  hooks.useAppSelector = (select) => select(f.store.getState()); hooks.useAppStore = () => f.store;
  const { FollowingControls } = load("../src/features/workspace/FollowingControls.tsx");
  const button = find(FollowingControls({ slides, ready: true, controller: f.workspace }), (node) => node.props?.["data-presentation-entry"] !== undefined);
  assert.ok(button); assert.equal(button.props.disabled, false); button.props.onClick();
  assert.equal(selectPresentation(f.store.getState()).active, true); assert.equal(f.store.getState().workspace.mic.status, "off");
  assert.deepEqual(f.calls, { network: 0, sockets: 0, start: 0, hold: 0, stop: 0 });
});

test("focus lifecycle hides on inactivity despite meter updates, reveals for keyboard, and holds before workspace exit", async (t) => {
  const f = attached(t); f.store.dispatch(micChanged({ status: "listening" })); f.time.flushFrames();
  assert.equal(f.document.activeElement, f.stage); assert.equal(f.document.body.style.overflow, "hidden");
  f.time.advance(1000); for (let index = 0; index < 30; index++) f.store.dispatch(micLevel(index / 30));
  f.time.advance(1501); assert.equal(selectPresentation(f.store.getState()).controlsVisible, false);
  key(f.document, "Tab"); assert.equal(selectPresentation(f.store.getState()).controlsVisible, true);
  f.control.focus(); f.root.dispatchEvent(new Event("focusin")); f.time.advance(5000);
  assert.equal(selectPresentation(f.store.getState()).controlsVisible, true);
  f.stage.focus(); f.root.dispatchEvent(new Event("focusout"));
  const s = f.store.getState().workspace.snapshot;
  f.store.dispatch(snapshotChanged({ snapshot: { ...s, held: true }, source: "manual", at: Date.now() }));
  f.time.advance(5000); assert.equal(selectPresentation(f.store.getState()).controlsVisible, true);
  await f.controller.exit(); f.time.flushFrames();
  assert.equal(f.calls.hold, 1); assert.equal(selectPresentation(f.store.getState()).active, false);
  assert.equal(f.document.body.style.overflow, "auto"); assert.equal(f.document.activeElement, f.entry);
  f.controller.detach(); assert.equal(f.time.pending(), 0);
});

test("focused toolbar respects snapshot Hold, keeps Stop available, and hides controls from keyboard navigation", (t) => {
  const f = fixture(t), hooks = load("../src/store/hooks.ts"), previous = hooks.useAppSelector;
  t.after(() => { hooks.useAppSelector = previous; }); hooks.useAppSelector = (select) => select(f.store.getState());
  const { PresentationControls } = load("../src/features/workspace/PresentationControls.tsx");
  f.store.dispatch(micChanged({ status: "listening" })); const s = f.store.getState().workspace.snapshot;
  f.store.dispatch(snapshotChanged({ snapshot: { ...s, held: true }, source: "manual", at: 0 }));
  const props = { slides, ready: true, workspace: f.workspace, controller: { exit() {}, toggleFullscreen() {} } };
  let tree = PresentationControls(props);
  const resume = find(tree, (node) => node.type === "button" && node.props.children?.some?.((child) => child?.props?.children === "Resume"));
  assert.ok(resume); assert.equal(resume.props.disabled, false);
  const stop = find(tree, (node) => node.props?.["aria-label"] === "Stop following"); assert.equal(stop.props.disabled, false); stop.props.onClick(); assert.equal(f.calls.stop, 1);
  tree = PresentationControls(props);
  assert.equal(find(tree, (node) => node.props?.role === "status").props.children.at(-1), "Microphone off");
  f.store.dispatch(micChanged({ status: "error", error: "Microphone denied" }));
  tree = PresentationControls(props);
  assert.equal(find(tree, (node) => node.props?.role === "status").props.children.at(-1), "Following paused");
  f.store.dispatch(presentationControlsHidden()); tree = PresentationControls(props);
  assert.equal(tree.props.inert, true); assert.equal(tree.props["aria-hidden"], true);
});

test("presentation view shows current live speech outside the auto-hidden controls", (t) => {
  const { store, workspace } = fixture(t);
  const { createElement } = load("react");
  const { renderToStaticMarkup } = load("react-dom/server");
  const { Provider } = load("react-redux");
  const cssLoader = load.extensions[".css"];
  load.extensions[".css"] = () => {};
  t.after(() => {
    if (cssLoader) load.extensions[".css"] = cssLoader;
    else delete load.extensions[".css"];
  });
  const { PresentationFocus } = load("../src/features/workspace/PresentationFocus.tsx");
  const render = () => renderToStaticMarkup(createElement(
    Provider,
    { store },
    createElement(PresentationFocus, { slides, ready: true, workspace }, createElement("div", null, "Slide")),
  ));
  const transcript = (text, isFinal, sequence) => store.dispatch(liveEventReceived({
    at: sequence,
    event: {
      type: "transcript",
      text,
      isFinal,
      transcriptSeq: sequence,
      epoch: ID,
      generation: 1,
      version: 1,
      held: false,
      acceptsAudio: true,
    },
  }));
  const overlay = /aria-label="Live transcript" aria-live="off"><p>(.*?)<\/p>/;

  transcript("The first topic is complete.", true, 1);
  assert.doesNotMatch(render(), overlay);
  assert.match(render(), /Recent speech.*The first topic is complete/);

  store.dispatch(presentationEntered());
  assert.equal(render().match(overlay)?.[1], "The first topic is complete.");
  assert.doesNotMatch(render(), /class="speech-panel"/);

  transcript("Audience focus is", false, 1);
  store.dispatch(presentationControlsHidden());
  assert.match(render(), /presentation-toolbar is-hidden/);
  assert.equal(render().match(overlay)?.[1], "Audience focus is");

  transcript("Audience focus is the goal.", true, 2);
  assert.equal(render().match(overlay)?.[1], "Audience focus is the goal.");

  store.dispatch(presentationExited());
  assert.doesNotMatch(render(), overlay);
  assert.match(render(), /Recent speech.*Audience focus is the goal/);
});

test("fullscreen is gesture-only, Escape leaves native first, and unsupported fullscreen preserves capture", async (t) => {
  const f = attached(t); f.controller.enter(); f.time.flushFrames();
  assert.equal(f.document.fullscreenElement, null); assert.equal(f.calls.start, 0);
  await f.controller.toggleFullscreen(); assert.equal(f.document.fullscreenElement, f.root);
  key(f.document, "Escape"); await Promise.resolve();
  assert.equal(f.document.fullscreenElement, null); assert.equal(selectPresentation(f.store.getState()).active, true); assert.equal(f.calls.hold, 0);
  key(f.document, "Escape"); await Promise.resolve(); assert.equal(selectPresentation(f.store.getState()).active, false); assert.equal(f.calls.hold, 1);
  f.controller.enter(); f.root.requestFullscreen = undefined;
  await f.controller.toggleFullscreen(); assert.equal(selectPresentation(f.store.getState()).active, true);
  assert.match(selectPresentation(f.store.getState()).fullscreenError, /unavailable/); assert.equal(f.calls.start, 0); assert.equal(f.calls.hold, 1);
});

test("late fullscreen requests after exit, reset or detach clean only their owned root and ignore stale errors", async (t) => {
  for (const reason of ["exit", "reset", "deck", "auth", "detach", "newer request", "other root"]) {
    const f = attached(t); f.controller.enter(); const pending = deferred();
    f.root.requestFullscreen = () => pending.promise;
    const operation = f.controller.toggleFullscreen();
    if (reason === "exit") await f.controller.exit();
    if (reason === "reset" || reason === "other root") f.store.dispatch(workspaceReset());
    if (reason === "deck") f.store.dispatch(deckSelected({ id: ID, filename: "replacement.pdf" }));
    if (reason === "auth") f.store.dispatch(logout());
    if (reason === "detach") f.controller.detach();
    if (reason === "newer request") {
      f.root.requestFullscreen = async () => { f.document.fullscreenElement = f.root; };
      await f.controller.toggleFullscreen();
    }
    const other = new Element(f.document);
    f.document.fullscreenElement = reason === "other root" ? other : f.root; pending.resolve(); await operation;
    assert.equal(f.document.fullscreenElement, reason === "newer request" ? f.root : reason === "other root" ? other : null);
    assert.equal(selectPresentation(f.store.getState()).fullscreenError, null);
  }
  const f = attached(t); f.controller.enter(); const pending = deferred(); f.root.requestFullscreen = () => pending.promise;
  const operation = f.controller.toggleFullscreen(); f.store.dispatch(workspaceReset()); pending.reject(new Error("late rejection")); await operation;
  assert.equal(selectPresentation(f.store.getState()).fullscreenError, null); assert.equal(selectPresentation(f.store.getState()).active, false);
});

test("a pending native exit cannot clear a newer presentation entry", async (t) => {
  const f = attached(t); f.controller.enter(); await f.controller.toggleFullscreen();
  const pending = deferred(); f.document.exitFullscreen = () => pending.promise;
  const exit = f.controller.exit(); f.controller.enter();
  pending.resolve(); await exit;
  assert.equal(selectPresentation(f.store.getState()).active, true); assert.equal(f.calls.hold, 1);
});


test("body-active entry returns visible focus to Presentation view", async (t) => {
  const f = attached(t); f.document.activeElement = f.document.body;
  f.controller.enter(); f.time.flushFrames();
  assert.equal(f.document.activeElement, f.stage);
  await f.controller.exit(); f.time.flushFrames();
  assert.equal(f.document.activeElement, f.entry);
});


test("Tab reveals hidden controls and focuses them after commit without trapping visible navigation", (t) => {
  const f = attached(t); f.store.dispatch(micChanged({ status: "listening" })); f.time.flushFrames();
  f.time.advance(2501); assert.equal(selectPresentation(f.store.getState()).controlsVisible, false);
  const tab = key(f.document, "Tab");
  assert.equal(tab.defaultPrevented, true); assert.equal(f.document.activeElement, f.stage);
  f.time.flushFrames(); assert.equal(f.document.activeElement, f.control);
  assert.equal(key(f.document, "Tab").defaultPrevented, false);
  f.stage.focus(); f.store.dispatch(presentationControlsHidden());
  assert.equal(key(f.document, "Tab", true).defaultPrevented, true);
  f.time.flushFrames(); assert.equal(f.document.activeElement, f.lastControl);
  f.stage.focus(); f.store.dispatch(presentationControlsHidden()); key(f.document, "Tab");
  f.controller.detach(); f.time.flushFrames();
  assert.equal(f.document.activeElement, f.stage); assert.equal(f.time.pending(), 0);
});

test("a pending native Workspace exit cannot override a real Resume listening transition", async (t) => {
  const f = attached(t); f.store.dispatch(micChanged({ status: "listening" }));
  await f.controller.toggleFullscreen();
  const pending = deferred(); f.document.exitFullscreen = () => pending.promise;
  const exit = f.controller.exit(); assert.equal(f.store.getState().workspace.mic.status, "held");
  f.store.dispatch(micChanged({ status: "permission" }));
  f.store.dispatch(micChanged({ status: "listening" }));
  pending.resolve(); await exit;
  assert.equal(f.store.getState().workspace.mic.status, "listening");
  assert.equal(selectPresentation(f.store.getState()).active, true); assert.equal(f.calls.start, 0);
});
