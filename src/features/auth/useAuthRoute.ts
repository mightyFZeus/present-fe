"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAppSelector, useAppStore } from "@/store/hooks";
import { sessionCleared } from "./authSlice";
import { authRedirectTarget, authRouteStatus, type AuthRouteMode } from "./authRouteHelpers";

export function useAuthRoute(mode: AuthRouteMode) {
  const store = useAppStore();
  const auth = useAppSelector((state) => state.auth);
  const router = useRouter();
  const lastRedirect = useRef<string | null>(null);
  const status = authRouteStatus(auth);
  useEffect(() => {
    let current = store.getState().auth;
    // Recheck live state at commit: queued effects must not redirect a newer
    // login/logout intent. Invalid ready sessions also clear existing runtime handles.
    if (current.restoreStatus === "ready" && current.accessToken && authRouteStatus(current) === "unauthenticated") {
      store.dispatch(sessionCleared({ reason: "Your session is unavailable. Sign in again." }));
      current = store.getState().auth;
    }
    const target = authRedirectTarget(current, mode);
    if (!target) { lastRedirect.current = null; return; }
    const intent = `${mode}:${current.generation}:${current.loginAttempt}:${target}`;
    if (lastRedirect.current === intent) return;
    lastRedirect.current = intent;
    router.replace(target);
  }, [store, router, mode, status, auth.generation, auth.loginAttempt, auth.expiresAt]);
  return status;
}
