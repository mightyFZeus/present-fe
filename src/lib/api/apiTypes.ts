import type { Method } from "axios";
import type { AuthState } from "@/features/auth/authSlice";

export interface ApiError {
  status: number | "NETWORK_ERROR" | "CANCELLED" | "CONFIGURATION_ERROR" |
    "INVALID_RESPONSE" | "STALE_SESSION";
  message: string;
}

export interface AxiosQueryArgs {
  url: string;
  method?: Method;
  data?: unknown;
  contentType?: "application/octet-stream";
  authenticated?: boolean;
  /** Only the fixed browser-auth endpoints may include cookies. */
  cookieSession?: boolean;
  timeoutMs?: number;
  responseType?: "json" | "blob";
  /** Only endpoints whose contract explicitly returns HTTP 204. */
  expectNoContent?: boolean;
}

export interface RequestMeta { generation: number; status?: number }
export type ApiResult =
  | { data: unknown; error?: undefined; meta: RequestMeta }
  | { error: ApiError; data?: undefined; meta: RequestMeta };
export interface ApiAuthState { auth: AuthState }
