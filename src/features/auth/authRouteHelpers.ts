import type { AuthState } from "./authSlice";

export type AuthRouteMode = "workspace" | "login";
export type AuthRouteStatus = "restoring" | "authenticated" | "unauthenticated";

export function authRouteStatus(auth: AuthState, now = Date.now()): AuthRouteStatus {
  if (auth.restoreStatus !== "ready") return "restoring";
  return auth.accessToken && auth.user && auth.expiresAt !== null &&
    Number.isFinite(auth.expiresAt) && auth.expiresAt > now
    ? "authenticated" : "unauthenticated";
}

export function authRedirectTarget(auth: AuthState, mode: AuthRouteMode): "/login" | "/workspace" | null {
  const status = authRouteStatus(auth);
  if (mode === "workspace" && status === "unauthenticated") return "/login";
  if (mode === "login" && status === "authenticated") return "/workspace";
  return null;
}
