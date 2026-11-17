import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import axios from "axios";

process.env.NEXT_PUBLIC_API_BASE_URL = "http://localhost:8080";
const load = createRequire(import.meta.url);
const { makeStore } = load("../src/store/store.ts");
const { api } = load("../src/store/services/api.ts");
const { signInWithGoogle, logout, restoreSession } = load("../src/features/auth/authThunks.ts");
const { sessionCleared, sessionEstablished } = load("../src/features/auth/authSlice.ts");
const { AuthSessionController } = load("../src/features/auth/AuthSessionController.ts");
const { deckSelected } = load("../src/features/workspace/workspaceSlice.ts");
const USER = "11111111-1111-4111-8111-111111111111";
const user = { id: USER, firstName: "Test", lastName: "Speaker", createdAt: "2026-11-04T00:00:00Z", updatedAt: "2026-11-04T00:00:00Z" };
const token = (label) => `header.${Buffer.from(JSON.stringify({ exp: Math.floor(Date.now()/1000)+3600, label })).toString("base64url")}.signature`;
const body = (value) => ({ data: { accessToken: value, expiresIn: 3500, user } });
function deferred() { let resolve, reject; const promise = new Promise((a,b) => { resolve=a; reject=b; }); return { promise, resolve, reject }; }
async function until(check) { const end=Date.now()+1500; while(!check()) { if(Date.now()>end) throw new Error("Async condition did not occur"); await new Promise(setImmediate); } }

function fixture(t, handler = async () => undefined) {
  const jar = { cookie: null }, calls = [], stores=[];
  const client=axios.create({ adapter: async (config) => {
    calls.push(config);
    const custom=await handler(config, jar);
    let data=custom;
    if (data === undefined) {
      if(config.url.endsWith("/google")) {
        assert.equal(config.withCredentials,true); assert.equal(config.signal,undefined);
        jar.cookie=token(JSON.parse(config.data).idToken); data=body(jar.cookie);
      } else if(config.url.endsWith("/logout")) {
        assert.equal(config.withCredentials,true); assert.equal(config.signal,undefined);
        jar.cookie=null; data={data:{signedOut:true}};
      } else if(config.url.endsWith("/session")) {
        assert.equal(config.withCredentials,true);
        data=jar.cookie ? body(jar.cookie) : { httpError:401 };
      } else data={data:{status:"ok"}};
    }
    const response={status:data?.httpError ?? 200,statusText:"OK",headers:{},config,data:data?.httpError?{error:"Session unavailable"}:data};
    if(data?.httpError) throw new axios.AxiosError("HTTP failure","ERR_BAD_RESPONSE",config,undefined,response);
    return response;
  }});
  const store=()=>{const s=makeStore({client});stores.push(s);return s;};
  t.after(()=>{for(const s of stores){s.dispatch(sessionCleared());s.dispatch(api.util.resetApiState());}});
  return {jar,calls,store};
}
function locks(t) {
  const original=Object.getOwnPropertyDescriptor(globalThis,"navigator");
  let tail=Promise.resolve();const requested=[];
  Object.defineProperty(globalThis,"navigator",{configurable:true,value:{locks:{request(name,work){
    requested.push(name);const run=tail.then(work);tail=run.catch(()=>undefined);return run;
  }}}});
  t.after(()=>original?Object.defineProperty(globalThis,"navigator",original):delete globalThis.navigator);
  return requested;
}
function channels() {
  const open=new Set();let sent=0;
  return {get sent(){return sent;},make(){const channel={onmessage:null,close(){open.delete(channel);},postMessage(data){
    sent++;for(const other of open)if(other!==channel)queueMicrotask(()=>other.onmessage?.({data}));
  }};open.add(channel);return channel;}};
}
function authenticate(store,value=token("existing")) {
  const auth=store.getState().auth;
  store.dispatch(sessionEstablished({generation:auth.generation,attempt:auth.loginAttempt,accessToken:value,expiresAt:Date.now()+3500000,user}));
}

test("fresh store restores the original cookie session without deck, media, renewal or storage",async(t)=>{
  const f=fixture(t),first=f.store();await signInWithGoogle(first,"first");
  const original=f.jar.cookie;const second=f.store();const controller=new AuthSessionController(second);controller.attach();
  await until(()=>!!second.getState().auth.accessToken);
  assert.equal(second.getState().auth.accessToken,original);assert.equal(second.getState().auth.user.id,USER);
  assert.equal(second.getState().workspace.deck,null);assert.equal(second.getState().workspace.mic.status,"off");
  assert.equal(second.getState().auth.restoreStatus,"ready");assert.equal(f.jar.cookie,original);
  assert.deepEqual(f.calls.map(x=>x.url),["/v1/users/auth/google","/v1/users/auth/session"]);
  assert.equal(JSON.stringify(second.getState().api).includes(original),false);
  controller.detach();assert.equal(f.jar.cookie,original);assert.equal(f.calls.length,2);
});

test("Strict Mode attach/detach replay ignores late restoration and never sends server logout",async(t)=>{
  const gate=deferred();let reads=0;const value=token("saved");
  const f=fixture(t,async(config)=>{if(config.url.endsWith("/session")){reads++;if(reads===1)await gate.promise;return body(value);}});
  f.jar.cookie=value;const store=f.store(),controller=new AuthSessionController(store);controller.attach();await until(()=>reads===1);
  controller.detach();controller.attach();gate.resolve();await until(()=>store.getState().auth.accessToken===value);
  assert.equal(reads,2);assert.equal(f.calls.some(x=>x.url.endsWith("/logout")),false);
  controller.detach();assert.equal(f.jar.cookie,value);
});

test("delayed login, immediate logout and newer login order actual cookie writes",async(t)=>{
  const gate=deferred();let writes=0;
  const f=fixture(t,async(config)=>{if(config.url.endsWith("/google")&&++writes===1)await gate.promise;});
  const store=f.store();const old=signInWithGoogle(store,"older");await until(()=>f.calls.length===1);
  store.dispatch(deckSelected({id:USER,filename:"synthetic.pdf"}));const signedOut=store.dispatch(logout());
  assert.equal(store.getState().auth.accessToken,null);assert.equal(store.getState().workspace.deck,null);
  const fresh=signInWithGoogle(store,"newer");await new Promise(setImmediate);assert.equal(f.calls.length,1);
  gate.resolve();await old;await signedOut;await fresh;
  assert.deepEqual(f.calls.map(x=>x.url),["/v1/users/auth/google","/v1/users/auth/logout","/v1/users/auth/google"]);
  assert.equal(JSON.parse(Buffer.from(f.jar.cookie.split(".")[1],"base64url")).label,"newer");assert.equal(store.getState().auth.accessToken,f.jar.cookie);
});

test("Web Locks register logout before another tab bootstrap while older login is pending",async(t)=>{
  const requested=locks(t);const gate=deferred();const f=fixture(t,async(config)=>{if(config.url.endsWith("/google"))await gate.promise;});
  const a=f.store(),b=f.store();const old=signInWithGoogle(a,"older");await until(()=>f.calls.length===1);
  const clear=a.dispatch(logout());const read=b.dispatch(restoreSession());
  assert.equal(requested.length,3);assert.equal(f.calls.length,1);
  gate.resolve();await old;await clear;await read;
  assert.deepEqual(f.calls.map(x=>x.url),["/v1/users/auth/google","/v1/users/auth/logout","/v1/users/auth/session"]);
  assert.equal(f.jar.cookie,null);assert.equal(b.getState().auth.accessToken,null);assert.equal(b.getState().auth.restoreStatus,"ready");
});

test("cross-tab logout clears resources once; late completion never signs out a newer login",async(t)=>{
  locks(t);const gate=deferred(),bus=channels();
  const f=fixture(t,async(config)=>{if(config.url.endsWith("/logout"))await gate.promise;});
  const a=f.store(),b=f.store();authenticate(a);authenticate(b);
  const ca=new AuthSessionController(a,{channel:()=>bus.make()}),cb=new AuthSessionController(b,{channel:()=>bus.make()});
  ca.attach();cb.attach();let cleaned=0;b.resources.registerCleanup("session",()=>cleaned++);
  const clear=a.dispatch(logout());await until(()=>b.getState().auth.signedOut);
  assert.equal(cleaned,1);assert.equal(bus.sent,1);assert.equal(b.getState().auth.accessToken,null);
  const newer=signInWithGoogle(b,"new-tab");gate.resolve();await clear;await newer;await new Promise(setImmediate);
  assert.equal(bus.sent,1);assert.equal(b.getState().auth.accessToken,f.jar.cookie);assert.equal(b.getState().auth.user.id,USER);
  ca.detach();cb.detach();assert.equal(bus.sent,1);
});

test("older failed logout cannot cancel a newer queued login attempt",async(t)=>{
  const gate=deferred();const f=fixture(t,async(config)=>{if(config.url.endsWith("/logout")){await gate.promise;return {httpError:500};}});
  const store=f.store();authenticate(store);const clear=store.dispatch(logout());await until(()=>f.calls.length===1);
  const newer=signInWithGoogle(store,"after-failure");const attempt=store.getState().auth.loginAttempt;
  gate.resolve();await clear;await newer;
  assert.equal(store.getState().auth.loginAttempt,attempt);assert.equal(store.getState().auth.accessToken,f.jar.cookie);
  assert.equal(JSON.parse(Buffer.from(f.jar.cookie.split(".")[1],"base64url")).label,"after-failure");
});

test("late bootstrap after logout cannot restore account and missing or failed sessions finish loading",async(t)=>{
  const gate=deferred();const f=fixture(t,async(config)=>{if(config.url.endsWith("/session")){await gate.promise;return body(token("old"));}});
  const store=f.store();const read=store.dispatch(restoreSession());await until(()=>f.calls.length===1);
  const clear=store.dispatch(logout());gate.resolve();await read;await clear;
  assert.equal(store.getState().auth.accessToken,null);assert.equal(f.jar.cookie,null);
  for(const status of [401,500]){
    const g=fixture(t,async()=>({httpError:status}));const s=g.store();await s.dispatch(restoreSession());
    assert.equal(s.getState().auth.restoreStatus,"ready");assert.equal(s.getState().auth.restoreFailed,status!==401);
  }
});

test("browser without Web Locks fails closed before any cookie HTTP request",async(t)=>{
  const previous=Object.getOwnPropertyDescriptor(globalThis,"window");Object.defineProperty(globalThis,"window",{configurable:true,value:{}});
  const previousNavigator=Object.getOwnPropertyDescriptor(globalThis,"navigator");Object.defineProperty(globalThis,"navigator",{configurable:true,value:{}});
  t.after(()=>previousNavigator?Object.defineProperty(globalThis,"navigator",previousNavigator):delete globalThis.navigator);
  t.after(()=>previous?Object.defineProperty(globalThis,"window",previous):delete globalThis.window);
  const f=fixture(t),store=f.store();await store.dispatch(restoreSession());
  assert.equal(f.calls.length,0);assert.equal(store.getState().auth.restoreStatus,"ready");
  assert.match(store.getState().auth.error,/Web Locks.*HTTPS or localhost/);
  await signInWithGoogle(store,"must-not-send");assert.equal(f.calls.length,0);
});


test("network failure and expired success payload finish bootstrap without restoring auth",async(t)=>{
  for(const failed of [true,false]){
    const f=fixture(t,async()=>{
      if(failed)throw new axios.AxiosError("Network unavailable","ERR_NETWORK");
      const expired=`header.${Buffer.from(JSON.stringify({exp:Math.floor(Date.now()/1000)-1})).toString("base64url")}.signature`;
      return body(expired);
    });
    const store=f.store();await store.dispatch(restoreSession());
    assert.equal(store.getState().auth.accessToken,null);assert.equal(store.getState().auth.restoreStatus,"ready");
    assert.equal(store.getState().auth.restoreFailed,true);assert.match(store.getState().auth.error,/Retry or sign in/);
  }
});
