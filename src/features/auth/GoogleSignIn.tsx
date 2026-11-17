"use client";
import { useEffect, useRef } from "react";
import { LoaderCircle } from "lucide-react";
import { useAppSelector, useAppStore } from "@/store/hooks";
import { signInWithGoogle, restoreSession } from "./authThunks";
import { googleIdentity } from "./googleIdentity";
import { googleRetry, googleStatus } from "@/features/workspace/workspaceSlice";
const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID?.trim();
export function GoogleSignIn() {
  const store = useAppStore(); const host = useRef<HTMLDivElement>(null);
  const { generation, loginAttempt, isSigningIn, error, restoreStatus, restoreFailed } = useAppSelector((state) => state.auth);
  const google = useAppSelector((state) => state.workspace.google);
  useEffect(() => {
    if (!clientId) { store.dispatch(googleStatus("unconfigured")); return; }
    if (!host.current || isSigningIn || restoreStatus !== "ready" || store.getState().auth.accessToken) return;
    return googleIdentity.mount(clientId, {
      element: host.current,
      active: () => {
        const current = store.getState().auth;
        return current.generation === generation && current.loginAttempt === loginAttempt &&
          !current.isSigningIn && !current.accessToken && current.restoreStatus === "ready";
      },
      credential: (credential) => { void signInWithGoogle(store, credential); },
      status: (status) => store.dispatch(googleStatus(status)),
    });
  }, [store, generation, loginAttempt, isSigningIn, restoreStatus, google.retry]);
  if (restoreStatus !== "ready") return <p className="auth-pending" role="status">Checking your sign-in…</p>;
  return <div className="auth-google-sign-in" aria-label="Google sign-in">
    {!clientId && <p className="auth-error" role="alert">Google sign-in is not configured for this environment yet.</p>}
    <div ref={host} className={`auth-google-button ${isSigningIn ? "busy" : ""}`} aria-busy={isSigningIn} />
    {(isSigningIn || google.status === "loading") && <p className="auth-supporting" role="status"><LoaderCircle size={14} className="auth-spinner" aria-hidden="true" />{isSigningIn ? "Signing you in…" : "Loading sign-in…"}</p>}
    {google.status === "error" && <div className="auth-error" role="alert"><p>Google sign-in could not load.</p><button className="auth-retry" onClick={() => store.dispatch(googleRetry())}>Try again</button></div>}
    {error && <p className="auth-error" role="alert">{error}</p>}
    {restoreFailed && <button className="auth-retry" onClick={() => void store.dispatch(restoreSession())}>Retry session</button>}
  </div>;
}
