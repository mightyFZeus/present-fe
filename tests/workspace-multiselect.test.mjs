import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Provider } from "react-redux";
import axios from "axios";
const load = createRequire(import.meta.url);
process.env.NEXT_PUBLIC_API_BASE_URL = "http://localhost:8080";
const { makeStore } = load("../src/store/store.ts");
const { sessionEstablished, sessionCleared } = load("../src/features/auth/authSlice.ts");
const { api } = load("../src/store/services/api.ts");
const queries = load("../src/features/presentations/presentationsApi.ts");
const hooks = load("../src/store/hooks.ts");
const { WorkspaceController } = load("../src/features/workspace/WorkspaceController.ts");
const { SavedPresentations } = load("../src/features/workspace/SavedPresentations.tsx");
const A = "aaaaaaaa-1111-4111-8111-111111111111", B = "bbbbbbbb-1111-4111-8111-111111111111", C = "cccccccc-1111-4111-8111-111111111111";
const DATE = "2026-11-16T10:00:00Z";
const deck = (id) => ({ id, filename: `Fictional ${id[0].toUpperCase()}.pdf`, format: "pdf", status: "ready", slideCount: 1, createdAt: DATE, updatedAt: DATE });
const page = (ids = [A, B]) => ({ presentations: ids.map(deck), nextCursor: "" });
const reply = (data, status = 200) => ({ data, status });
const pause = () => new Promise((done) => setImmediate(done));
function deferred() { let resolve; const promise = new Promise((done) => { resolve = done; }); return { promise, resolve }; }
async function until(check) { const end = performance.now() + 2000; while (!check()) { if (performance.now() > end) throw new Error("Expected condition did not occur"); await pause(); } }
function authenticate(store, user = A) {
  const auth = store.getState().auth;
  store.dispatch(sessionEstablished({ generation: auth.generation, attempt: auth.loginAttempt, accessToken: "fictional-test-token", expiresAt: Date.now() + 3600_000, user: { id: user, firstName: "Fictional", lastName: "Presenter", createdAt: DATE, updatedAt: DATE } }));
}
function fixture(t, handler = () => reply(undefined, 204)) {
  const calls = [];
  const client = axios.create({ adapter: async (config) => {
    calls.push(config); const value = config.method === "get" ? reply({ data: page() }) : await handler(config);
    const response = { status: value.status ?? 200, data: value.data, headers: {}, statusText: "Test", config };
    if (response.status >= 400) throw new axios.AxiosError("Failed", "ERR_BAD_RESPONSE", config, undefined, response);
    return response;
  } });
  const store = makeStore({ client }); authenticate(store); const controller = new WorkspaceController(store); controller.attach();
  t.after(() => { controller.detach(true); store.dispatch(sessionCleared()); store.dispatch(api.util.resetApiState()); });
  return { store, controller, calls, deletes: () => calls.filter((call) => call.method === "delete") };
}
function nodes(tree, predicate) {
  const found = []; const visit = (node) => { if (!node || typeof node !== "object") return; if (predicate(node)) found.push(node); for (const child of [node.props?.children].flat(Infinity)) visit(child); }; visit(tree); return found;
}
function content(node) { if (node == null || typeof node === "boolean") return ""; return typeof node === "object" ? [node.props?.children].flat(Infinity).map(content).join("") : String(node); }
function interaction(t, f) {
  const original = { state: React.useState, ref: React.useRef, id: React.useId, memo: React.useMemo, effect: React.useEffect, selector: hooks.useAppSelector, store: hooks.useAppStore, query: queries.useListPresentationsInfiniteQuery };
  let renderComponent = () => SavedPresentations({ controller: f.controller });
  const slots = []; let cursor = 0, effects = [], data = { pages: [page()] }, fetching = false, error, tree, unmounted = false;
  const changed = (before, next) => !before || before.length !== next.length || next.some((value, i) => value !== before[i]);
  React.useState = (initial) => { const i = cursor++; if (!slots[i]) slots[i] = { value: typeof initial === "function" ? initial() : initial }; return [slots[i].value, (value) => { slots[i].value = typeof value === "function" ? value(slots[i].value) : value; }]; };
  React.useRef = (initial) => { const i = cursor++; if (!slots[i]) slots[i] = { value: { current: initial } }; return slots[i].value; };
  React.useId = () => "test-card-label";
  React.useMemo = (create, deps) => { const i = cursor++; if (changed(slots[i]?.deps, deps)) slots[i] = { value: create(), deps }; return slots[i].value; };
  React.useEffect = (create, deps) => { const i = cursor++; if (changed(slots[i]?.deps, deps)) effects.push({ i, create, deps }); };
  hooks.useAppStore = () => f.store; hooks.useAppSelector = (select) => select(f.store.getState());
  queries.useListPresentationsInfiniteQuery = () => ({ currentData: data, isLoading: false, isFetching: fetching, error, hasNextPage: true, fetchNextPage() {}, refetch() {} });
  const unmount = () => { if (unmounted) return; unmounted = true; for (const slot of slots) slot?.cleanup?.(); };
  t.after(() => { unmount(); React.useState = original.state; React.useRef = original.ref; React.useMemo = original.memo; React.useEffect = original.effect; hooks.useAppSelector = original.selector; hooks.useAppStore = original.store; queries.useListPresentationsInfiniteQuery = original.query; });
  return {
    unmount,
    component(render) { for (const slot of slots) slot?.cleanup?.(); slots.length = 0; renderComponent = render; },
    data(pages, options = {}) { data = { pages }; fetching = options.fetching ?? false; error = options.error; },
    render() { cursor = 0; effects = []; tree = renderComponent(); for (const effect of effects) slots[effect.i]?.cleanup?.(); for (const effect of effects) slots[effect.i] = { deps: effect.deps, cleanup: effect.create() }; return tree; },
    button(label) { const node = nodes(tree, (node) => node.type === "button" && content(node) === label)[0]; assert.ok(node, `Button ${label}`); return node; },
    all() { return nodes(tree, (node) => node.type === "input" && node.props.type === "checkbox")[0]; },
    cards() { return nodes(tree, (node) => node.type?.name === "SavedPresentationCard"); },
    choose(id, checked = true) { this.cards().find((card) => card.props.presentation.id === id).props.onSelect(id, checked); this.render(); },
    text() { return content(tree); },
  };
}
function selectPair(ui) { ui.render(); ui.render(); ui.choose(A); ui.choose(B); ui.button("Delete selected").props.onClick(); ui.render(); }

test("card checkboxes are native, named and outside each navigation link", async (t) => {
  const f = fixture(t); await f.store.dispatch(queries.presentationsApi.endpoints.listPresentations.initiate(undefined)).unwrap();
  const html = renderToStaticMarkup(React.createElement(Provider, { store: f.store }, React.createElement(SavedPresentations, { controller: f.controller })));
  assert.match(html, /type="checkbox" aria-label="Select Fictional A.pdf"/); assert.match(html, /Select all shown/);
  assert.equal([...html.matchAll(/<a\b[^>]*>[\s\S]*?<\/a>/g)].some(([link]) => /<button|<input/.test(link)), false);
});

test("select all includes loaded eligible cards only and later pages stay unselected", (t) => {
  const f = fixture(t), ui = interaction(t, f); ui.render(); ui.render(); ui.all().props.onChange({ currentTarget: { checked: true } }); ui.render();
  assert.deepEqual(ui.cards().filter((card) => card.props.selected).map((card) => card.props.presentation.id), [A, B]);
  const checkbox = {}; ui.all().props.ref.current = checkbox;
  ui.data([page(), page([C])]); ui.render(); assert.equal(ui.cards()[2].props.selected, false); assert.equal(ui.all().props.checked, false);
  assert.equal(checkbox.indeterminate, true); ui.choose(B, false);
  ui.button("Clear selection").props.onClick(); ui.render(); assert.match(ui.text(), /0 selected/); assert.equal(f.deletes().length, 0);
});

test("settled successful list replacement prunes selection without reselecting rows later", (t) => {
  const f = fixture(t), ui = interaction(t, f); ui.render(); ui.render(); ui.choose(A);
  ui.data([page([B])], { fetching: true }); ui.render(); ui.data([page([A, B])], { error: { message: "Failed" } }); ui.render();
  assert.equal(ui.cards()[0].props.selected, true, "fetch/error retained the selection");
  ui.data([page([B])]); ui.render(); ui.render(); ui.data([page([B]), page([A])]); ui.render();
  assert.equal(ui.cards().find((card) => card.props.presentation.id === A).props.selected, false);
});

test("canceling confirmation sends zero DELETE requests and retains the selected cards", (t) => {
  const f = fixture(t), ui = interaction(t, f); selectPair(ui); assert.match(ui.text(), /Delete 2 selected presentations/);
  ui.button("Keep presentations").props.onClick(); ui.render(); assert.match(ui.text(), /2 selected/); assert.equal(f.deletes().length, 0);
});

test("partial success keeps failures selected and retry only deletes the remaining IDs", async (t) => {
  let fail = true; const f = fixture(t, (config) => fail && config.url.endsWith(B) ? reply({ error: "Fictional temporary error" }, 500) : reply(undefined, 204));
  const ui = interaction(t, f); selectPair(ui); ui.button("Delete 2 permanently").props.onClick();
  await until(() => f.deletes().length === 2 && !Object.keys(f.store.getState().workspace.savedPending).length); await pause(); ui.render(); ui.render();
  assert.match(ui.text(), /1 presentation deleted/); assert.match(ui.text(), /1 selected/); assert.match(ui.text(), /Failed presentations remain selected/);
  assert.deepEqual(ui.cards().map((card) => card.props.presentation.id), [B]); assert.equal(ui.cards()[0].props.selected, true);
  ui.data([page()]); ui.render(); assert.deepEqual(ui.cards().map((card) => card.props.presentation.id), [B], "stale pages cannot resurrect successful deletions");
  fail = false; ui.button("Retry selected").props.onClick(); ui.render(); ui.button("Delete 1 permanently").props.onClick();
  await until(() => f.store.getState().workspace.savedChanges[B]?.deleted); assert.deepEqual(f.deletes().map((call) => call.url.split("/").at(-1)), [A, B, B]);
});

test("batch freezes and deduplicates IDs with at most one HTTP request active", async (t) => {
  const first = deferred(), second = deferred(); let active = 0, maximum = 0;
  const f = fixture(t, async (config) => { active += 1; maximum = Math.max(maximum, active); await (config.url.endsWith(A) ? first : second).promise; active -= 1; return reply(undefined, 204); });
  const ids = [A, A, B], task = f.controller.deleteSavedMany(ids, () => true); ids.push(C);
  await until(() => f.deletes().length === 1); first.resolve(); await until(() => f.deletes().length === 2); second.resolve();
  const result = await task; assert.equal(maximum, 1); assert.deepEqual(result.deleted, [A, B]); assert.deepEqual(result.failed, []);
});

test("Stop remaining leaves unstarted IDs selected while the current deletion commits", async (t) => {
  const first = deferred(), f = fixture(t, async () => { await first.promise; return reply(undefined, 204); });
  const ui = interaction(t, f); selectPair(ui); ui.button("Delete 2 permanently").props.onClick(); await until(() => f.deletes().length === 1); ui.render();
  ui.button("Stop remaining").props.onClick(); first.resolve(); await until(() => f.store.getState().workspace.savedChanges[A]?.deleted); await pause(); ui.render(); ui.render();
  assert.equal(f.deletes().length, 1); assert.match(ui.text(), /1 not attempted/); assert.equal(ui.cards()[0].props.selected, true);
});

test("unmount stops queued requests but started same-account deletion still records its outcome", async (t) => {
  const first = deferred(), f = fixture(t, async () => { await first.promise; return reply(undefined, 204); });
  const ui = interaction(t, f); selectPair(ui); ui.button("Delete 2 permanently").props.onClick(); await until(() => f.deletes().length === 1);
  ui.unmount(); f.controller.detach(true); first.resolve(); await until(() => f.store.getState().workspace.savedChanges[A]?.deleted); await pause(); assert.equal(f.deletes().length, 1);
});

test("account changes clear selection/confirmation and prevent old queued IDs using a new token", async (t) => {
  const first = deferred(), f = fixture(t, async () => { await first.promise; return reply(undefined, 204); });
  const ui = interaction(t, f); selectPair(ui); ui.button("Delete 2 permanently").props.onClick(); await until(() => f.deletes().length === 1);
  f.store.dispatch(sessionCleared()); authenticate(f.store, C); ui.render(); ui.render(); first.resolve(); await pause();
  assert.match(ui.text(), /0 selected/); assert.doesNotMatch(ui.text(), /Delete 2 selected presentations/); assert.equal(f.deletes().length, 1); assert.equal(f.store.getState().workspace.savedChanges[A], undefined);
});

test("single and bulk deletes share per-store locks without clearing another controller's request", async (t) => {
  const first = deferred(), f = fixture(t, async (config) => { if (config.url.endsWith(A)) await first.promise; return reply(undefined, 204); });
  const pending = f.controller.deleteSaved(A); await until(() => f.deletes().length === 1);
  const other = new WorkspaceController(f.store); other.attach(); t.after(() => other.detach(true));
  const result = await other.deleteSavedMany([A, B], () => true); assert.equal(result.failed[0].id, A); assert.deepEqual(result.deleted, [B]);
  assert.equal(f.deletes().filter((call) => call.url.endsWith(A)).length, 1); assert.ok(f.store.getState().workspace.savedPending[A]); first.resolve(); await pending;
});


test("pre-opened rename and delete forms remain guarded throughout bulk confirmation", async (t) => {
  const f = fixture(t), ui = interaction(t, f); ui.render(); ui.render();
  const card = ui.cards()[0]; let locked = false;
  ui.component(() => card.type({ ...card.props, selectionLocked: locked }));
  let tree = ui.render();
  nodes(tree, (node) => node.props?.["aria-label"] === "Rename Fictional A.pdf")[0].props.onClick();
  ui.render(); locked = true; tree = ui.render();
  const form = nodes(tree, (node) => node.type === "form")[0];
  assert.equal(nodes(tree, (node) => node.type === "input")[0].props.disabled, true);
  assert.equal(ui.button("Save name").props.disabled, true);
  assert.equal(ui.button("Cancel").props.disabled, true);
  await form.props.onSubmit({ preventDefault() {} });
  ui.button("Cancel").props.onClick(); tree = ui.render();
  assert.equal(nodes(tree, (node) => node.type === "form").length, 1);
  assert.equal(f.calls.filter((call) => call.method === "patch").length, 0);
  locked = false; ui.render(); ui.button("Cancel").props.onClick(); tree = ui.render();
  nodes(tree, (node) => node.props?.["aria-label"] === "Delete Fictional A.pdf")[0].props.onClick();
  ui.render(); locked = true; ui.render();
  assert.equal(ui.button("Delete presentation").props.disabled, true);
  assert.equal(ui.button("Keep presentation").props.disabled, true);
  ui.button("Delete presentation").props.onClick(); await pause();
  assert.equal(f.deletes().length, 0);
});
