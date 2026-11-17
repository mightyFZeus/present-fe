import type { ApiRuntime } from "./ApiRuntime";
import type { ApiAuthState, ApiError } from "./apiTypes";

export interface ApiThunkConfig {
  state: ApiAuthState;
  extra: ApiRuntime;
  rejectValue: ApiError;
}
