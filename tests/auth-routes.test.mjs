import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import axios from "axios";

process.env.NEXT_PUBLIC_API_BASE_URL = "http://localhost:8080";
process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID = "test-public-client";
const load = createRequire(import.meta.url);
load.extensions[".css"] = (module) => { module.exports = {}; };
const React = load("react");
const { renderToStaticMarkup } = load("react-dom/server");
const { Provider } = load("react-redux");
const { AppRouterContext } = await import("vinext/shims/internal/app-router-context");
const { makeStore } = load("../src/store/store.ts");
const { api } = load("../src/store/services/api.ts");
const { AuthGate } = load("../src/features/auth/AuthGate.tsx");
// The home link is a DOM boundary, not the auth route under test. Preserve its
// anchor semantics without running Next's browser-only intersection/prefetch
// effects when these actual route components are committed through server HTML.
const linkId = load.resolve("next/link");
const originalLink = load(linkId);
load.cache[linkId].exports = { __esModule: true, default: ({ children, ...props }) => React.createElement("a", props, children) };
const { LoginScreen } = load("../src/features/auth/LoginScreen.tsx");
load.cache[linkId].exports = originalLink;
const { authRouteStatus } = load("../src/features/auth/authRouteHelpers.ts");
const { sessionEstablished, sessionCleared, restoreFinished, signInStarted, signInFailed } = load("../src/features/auth/authSlice.ts");
const { logout } = load("../src/features/auth/authThunks.ts");
const { AuthSessionController } = load("../src/features/auth/AuthSessionController.ts");
const USER = "11111111-1111-4111-8111-111111111111";
const user = { id: USER, firstName: "Test", lastName: "Presenter", createdAt: "2026-11-04T00:00:00Z", updatedAt: "2026-11-04T00:00:00Z" };
const token = () => `header.${Buffer.from(JSON.stringify({exp:Math.floor(Date.now()/1000)+3600})).toString("base64url")}.signature`;
function deferred(){let resolve;const promise=new Promise((a)=>{resolve=a;});return {promise,resolve};}
async function until(check){const end=Date.now()+1200;while(!check()){if(Date.now()>end)throw new Error("Async condition did not occur");await new Promise(setImmediate);}}
function fixture(t,handler=async(config)=>config.url.endsWith("/logout")?{data:{signedOut:true}}:{data:{accessToken:token(),expiresIn:3500,user}}){
 const calls=[];const client=axios.create({adapter:async(config)=>{
  calls.push(config);const data=await handler(config);
  const response={status:data?.httpError??200,statusText:"OK",headers:{},config,data:data?.httpError?{error:"Unavailable"}:data};
  if(data?.httpError)throw new axios.AxiosError("Request failed","ERR_BAD_RESPONSE",config,undefined,response);
  return response;
 }});
 const store=makeStore({client});t.after(()=>{store.dispatch(sessionCleared());store.dispatch(api.util.resetApiState());});
 return {store,calls};
}
function authenticate(store,expiresAt=Date.now()+3500000){const a=store.getState().auth;store.dispatch(sessionEstablished({generation:a.generation,attempt:a.loginAttempt,accessToken:token(),expiresAt,user}));}
function readyAnonymous(store){const a=store.getState().auth;store.dispatch(restoreFinished({generation:a.generation,attempt:a.loginAttempt}));}
function renderer(t,store){
 const original=React.useEffect;let effects=[];const replacements=[];
 React.useEffect=(effect)=>{effects.push(effect);};t.after(()=>{React.useEffect=original;});
 const router={replace:(path)=>replacements.push(path)};
 const render=(element)=>{effects=[];const html=renderToStaticMarkup(React.createElement(AppRouterContext.Provider,{value:router},React.createElement(Provider,{store},element)));return {html,effects:[...effects]};};
 return {render,replacements,commit:(result)=>{for(const effect of result.effects)effect();}};
}

test("actual AuthGate never mounts workspace during bootstrap, then admits verified restoration",async(t)=>{
 const pending=deferred();const f=fixture(t,async()=>pending.promise);const r=renderer(t,f.store);let mounts=0;
 function Protected(){mounts++;return React.createElement("div",null,"Private workspace");}
 const gate=()=>React.createElement(AuthGate,null,React.createElement(Protected));
 let result=r.render(gate());assert.equal(mounts,0);assert.doesNotMatch(result.html,/Private workspace/);r.commit(result);assert.deepEqual(r.replacements,[]);assert.equal(f.calls.length,0);
 const controller=new AuthSessionController(f.store);controller.attach();t.after(()=>controller.detach());await until(()=>f.calls.length===1);
 result=r.render(gate());r.commit(result);assert.equal(mounts,0);assert.deepEqual(r.replacements,[]);
 pending.resolve({data:{accessToken:token(),expiresIn:3500,user}});await until(()=>!!f.store.getState().auth.accessToken);
 result=r.render(gate());r.commit(result);assert.match(result.html,/Private workspace/);assert.equal(mounts,1);assert.deepEqual(r.replacements,[]);assert.equal(f.calls.length,1);
});

test("missing, logout and cross-tab auth changes remove protected children and replace to login",async(t)=>{
 const f=fixture(t);const r=renderer(t,f.store);const protectedTree=React.createElement(AuthGate,null,React.createElement("div",null,"Private workspace"));
 readyAnonymous(f.store);let result=r.render(protectedTree);assert.doesNotMatch(result.html,/Private workspace/);r.commit(result);assert.equal(r.replacements.at(-1),"/login");
 authenticate(f.store);result=r.render(protectedTree);assert.match(result.html,/Private workspace/);
 let closed=0;f.store.resources.registerCleanup("session",()=>closed++);
 await f.store.dispatch(logout());assert.equal(closed,1);result=r.render(protectedTree);assert.doesNotMatch(result.html,/Private workspace/);r.commit(result);assert.equal(r.replacements.at(-1),"/login");
 authenticate(f.store);let channel;const controller=new AuthSessionController(f.store,{channel:()=>channel={onmessage:null,postMessage(){},close(){}}});controller.attach();t.after(()=>controller.detach());
 channel.onmessage({data:"logout"});result=r.render(protectedTree);assert.doesNotMatch(result.html,/Private workspace/);r.commit(result);assert.equal(r.replacements.at(-1),"/login");
});

test("absolute expiry hides children before effects and clears live resources even if timer is delayed",(t)=>{
 const f=fixture(t);const r=renderer(t,f.store);const expiry=Date.now()+10000;authenticate(f.store,expiry);let closed=0;f.store.resources.registerCleanup("session",()=>closed++);
 t.mock.method(Date,"now",()=>expiry+1);
 const result=r.render(React.createElement(AuthGate,null,React.createElement("div",null,"Private workspace")));
 assert.doesNotMatch(result.html,/Private workspace/);assert.equal(authRouteStatus(f.store.getState().auth),"unauthenticated");r.commit(result);
 assert.equal(f.store.getState().auth.accessToken,null);assert.equal(closed,1);assert.deepEqual(r.replacements,["/login"]);
 // Incomplete ready-session metadata must also be cleared so the Google entry
 // cannot remain blocked by a token that the route gate refuses to accept.
 const a=f.store.getState().auth;
 f.store.dispatch(sessionEstablished({generation:a.generation,attempt:a.loginAttempt,accessToken:token(),expiresAt:expiry+10000,user:null}));
 const invalid=r.render(React.createElement(AuthGate,null,React.createElement("div",null,"Private workspace")));
 assert.doesNotMatch(invalid.html,/Private workspace/);r.commit(invalid);assert.equal(f.store.getState().auth.accessToken,null);
});

test("login keeps bootstrap pending, redirects valid session once and ignores stale queued route effects",(t)=>{
 const f=fixture(t);const r=renderer(t,f.store);
 let result=r.render(React.createElement(LoginScreen));assert.match(result.html,/Checking your sign-in/);r.commit(result);assert.deepEqual(r.replacements,[]);
 authenticate(f.store);result=r.render(React.createElement(LoginScreen));assert.doesNotMatch(result.html,/auth-google-button/);r.commit(result);r.commit(result);assert.deepEqual(r.replacements,["/workspace"]);
 const staleLogin=r.render(React.createElement(LoginScreen));f.store.dispatch(sessionCleared({signedOut:true}));r.commit(staleLogin);assert.deepEqual(r.replacements,["/workspace"]);
 const staleGate=r.render(React.createElement(AuthGate,null,React.createElement("div",null,"Private workspace")));authenticate(f.store);r.commit(staleGate);assert.deepEqual(r.replacements,["/workspace"]);
});

test("failed restoration routes to recoverable Google-only login without a second automatic restore",async(t)=>{
 const f=fixture(t,async()=>({httpError:500}));const controller=new AuthSessionController(f.store);controller.attach();t.after(()=>controller.detach());await until(()=>f.store.getState().auth.restoreFailed);
 const r=renderer(t,f.store);r.commit(r.render(React.createElement(AuthGate,null,React.createElement("div",null,"Private workspace"))));assert.deepEqual(r.replacements,["/login"]);
 const result=r.render(React.createElement(LoginScreen));assert.match(result.html,/auth-google-button/);assert.match(result.html,/Retry session/);assert.match(result.html,/could not be restored/);assert.doesNotMatch(result.html,/type="(?:email|password)"/);r.commit(result);assert.equal(f.calls.length,1);
});

test("Google callbacks are fenced after newer attempts/logout; current success redirects to workspace",async(t)=>{
 const f=fixture(t);readyAnonymous(f.store);
 const hooks=load("../src/store/hooks.ts"),identity=load("../src/features/auth/googleIdentity.ts");
 const saved={ref:React.useRef,effect:React.useEffect,selector:hooks.useAppSelector,store:hooks.useAppStore,broker:identity.googleIdentity};
 let effect,cleanup,callback;const states=[];let nonce=0;const host={replaceChildren(){}};
 const sdk={initialize(options){callback=options.callback;},renderButton(_host,options){states.push(options.state);},disableAutoSelect(){}};
 identity.googleIdentity=new identity.GoogleIdentityBroker(async()=>sdk,()=>`owner-${++nonce}`);
 React.useRef=()=>({current:host});React.useEffect=(fn)=>{effect=fn;};hooks.useAppSelector=(select)=>select(f.store.getState());hooks.useAppStore=()=>f.store;
 t.after(()=>{cleanup?.();React.useRef=saved.ref;React.useEffect=saved.effect;hooks.useAppSelector=saved.selector;hooks.useAppStore=saved.store;identity.googleIdentity=saved.broker;});
 const {GoogleSignIn}=load("../src/features/auth/GoogleSignIn.tsx");GoogleSignIn();cleanup=effect();await until(()=>states.length===1);
 f.store.dispatch(signInStarted());const a=f.store.getState().auth;f.store.dispatch(signInFailed({generation:a.generation,attempt:a.loginAttempt,message:"retry"}));
 callback({state:states[0],credential:"stale-attempt"});await new Promise(setImmediate);assert.equal(f.calls.length,0);
 f.store.dispatch(sessionCleared({signedOut:true}));callback({state:states[0],credential:"stale-after-logout"});await new Promise(setImmediate);assert.equal(f.calls.length,0);
 cleanup();GoogleSignIn();cleanup=effect();await until(()=>states.length===2);callback({state:states[1],credential:"current-credential"});await until(()=>!!f.store.getState().auth.accessToken);assert.equal(f.calls.length,1);
 cleanup();cleanup=undefined;React.useRef=saved.ref;React.useEffect=saved.effect;hooks.useAppSelector=saved.selector;hooks.useAppStore=saved.store;
 const r=renderer(t,f.store);r.commit(r.render(React.createElement(LoginScreen)));assert.deepEqual(r.replacements,["/workspace"]);
});


test("provider replay keeps a protected presentation pending between detach and reattach", async (t) => {
  const pending = deferred();
  const f = fixture(t, async () => pending.promise);
  const controller = new AuthSessionController(f.store);
  controller.attach();
  t.after(() => controller.detach());
  await until(() => f.calls.length === 1);
  const r = renderer(t, f.store);
  const protectedDeck = React.createElement(AuthGate, null,
    React.createElement("div", null, "Protected presentation aaaaaaaa-1111-4111-8111-111111111111"));
  const queuedEffect = r.render(protectedDeck);
  controller.detach();
  assert.equal(f.store.getState().auth.accessToken, null);
  assert.equal(authRouteStatus(f.store.getState().auth), "restoring");
  r.commit(queuedEffect);
  assert.deepEqual(r.replacements, []);
  controller.attach();
  pending.resolve({ data: { accessToken: token(), expiresIn: 3500, user } });
  await until(() => !!f.store.getState().auth.accessToken);
  const restored = r.render(protectedDeck);
  r.commit(restored);
  assert.match(restored.html, /Protected presentation aaaaaaaa/);
  assert.deepEqual(r.replacements, []);
  assert.equal(f.calls.some((call) => call.url.endsWith("/logout")), false);
});
