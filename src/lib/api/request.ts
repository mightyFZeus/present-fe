import axios from "axios";
import type { UnknownAction } from "@reduxjs/toolkit";
import { sessionCleared } from "@/features/auth/authSlice";
import type { ApiRuntime } from "./ApiRuntime";
import type { ApiResult, AxiosQueryArgs } from "./apiTypes";
import { isRecord } from "./responseHelpers";

export interface RequestContext {
  signal: AbortSignal;
  dispatch: (action: UnknownAction) => unknown;
  extra: unknown;
}

async function errorMessage(data: unknown): Promise<string> {
  if (data instanceof Blob && data.size <= 16_384) {
    try { data = JSON.parse(await data.text()); } catch { return "The request failed."; }
  }
  return isRecord(data) && typeof data.error === "string"
    ? data.error.slice(0, 512) : "The request failed.";
}

export async function request(
  args: AxiosQueryArgs,
  context: RequestContext,
): Promise<ApiResult> {
  const runtime = context.extra as ApiRuntime;
  const auth = runtime.auth();
  const generation = auth.generation;
  const meta = { generation };
  const authenticated = args.authenticated !== false;
  const token = auth.accessToken;
  if (!runtime.origin || !args.url.startsWith("/") || args.url.startsWith("//") ||
      args.url.includes("\\") || new URL(args.url, runtime.origin).origin !== runtime.origin) {
    return { error: { status: "CONFIGURATION_ERROR", message: "Configure a valid HTTP backend origin and relative endpoint." }, meta };
  }
  if (authenticated && (!token || !auth.expiresAt || auth.expiresAt <= Date.now())) {
    if (token && runtime.isCurrent(generation)) context.dispatch(sessionCleared({ reason: "Session expired." }));
    return { error: { status: 401, message: "Sign in to continue." }, meta };
  }
  const cookieEndpoint = args.url === "/v1/users/auth/google" ||
    args.url === "/v1/users/auth/session" || args.url === "/v1/users/auth/logout";
  if (args.cookieSession && (!cookieEndpoint || authenticated)) {
    return { error: { status: "CONFIGURATION_ERROR", message: "Invalid browser session request." }, meta };
  }
  // Cookie mutation responses must finish before releasing their ordering lock.
  // A local logout/reset invalidates Redux results, but must not abort this HTTP
  // exchange and let a newer Set-Cookie response overtake it.
  const mutation = args.cookieSession && args.method === "POST";
  const scope = mutation ? undefined : runtime.requestSignal(context.signal);
  try {
    const response = await runtime.client.request({
      baseURL: runtime.origin,
      url: args.url,
      method: args.method ?? "GET",
      data: args.data,
      responseType: args.responseType ?? "json",
      timeout: args.timeoutMs ?? 15_000,
      headers: authenticated ? { Authorization: `Bearer ${token}` } : undefined,
      signal: scope?.signal,
      withCredentials: args.cookieSession === true,
    });
    if (!runtime.isCurrent(generation) || scope?.signal.aborted) {
      return { error: { status: "STALE_SESSION", message: "The session changed." }, meta };
    }
    if (authenticated && runtime.auth().expiresAt! <= Date.now()) {
      context.dispatch(sessionCleared({ reason: "Session expired." }));
      return { error: { status: 401, message: "Session expired." }, meta };
    }
    return { data: response.data, meta: { ...meta, status: response.status } };
  } catch (error: unknown) {
    if (!runtime.isCurrent(generation)) {
      return { error: { status: "STALE_SESSION", message: "The session changed." }, meta };
    }
    if (axios.isCancel(error) || scope?.signal.aborted) {
      return { error: { status: "CANCELLED", message: "The request was cancelled." }, meta };
    }
    if (axios.isAxiosError(error)) {
      const message = await errorMessage(error.response?.data);
      if (!runtime.isCurrent(generation)) {
        return { error: { status: "STALE_SESSION", message: "The session changed." }, meta };
      }
      if (authenticated && error.response?.status === 401 && runtime.auth().accessToken === token) {
        context.dispatch(sessionCleared({ reason: "Session expired. Sign in again." }));
      }
      return { error: { status: error.response?.status ?? "NETWORK_ERROR", message }, meta };
    }
    return { error: { status: "NETWORK_ERROR", message: "The backend is unavailable." }, meta };
  } finally {
    scope?.release();
  }
}
