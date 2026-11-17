import { configureStore, type Middleware } from "@reduxjs/toolkit";
import { api } from "@/store/services/api";
import { authReducer, sessionCleared, type AuthState } from "@/features/auth/authSlice";
import { assetsReducer, assetsCleared } from "@/features/presentations/assetsSlice";
import { liveReducer, liveReset } from "@/features/live/liveSlice";
import { workspaceReducer, workspaceReset } from "@/features/workspace/workspaceSlice";
import { ApiRuntime, type RuntimeOptions } from "@/lib/api/ApiRuntime";

export function makeStore(options: RuntimeOptions = {}) {
  const resources = new ApiRuntime(options);
  const lifecycle: Middleware = (store) => (next) => (action) => {
    const previous = (store.getState() as { auth: AuthState }).auth.generation;
    const result = next(action);
    const auth = (store.getState() as { auth: AuthState }).auth;
    if (previous !== auth.generation) {
      resources.reset();
      store.dispatch(api.util.resetApiState());
      store.dispatch(assetsCleared());
      store.dispatch(liveReset());
      store.dispatch(workspaceReset());
      resources.armExpiry(auth.expiresAt, () => store.dispatch(sessionCleared({ reason: "Session expired." })));
    }
    return result;
  };
  const store = configureStore({
    reducer: {
      auth: authReducer,
      workspace: workspaceReducer,
      assets: assetsReducer,
      live: liveReducer,
      [api.reducerPath]: api.reducer,
    },
    middleware: (getDefaultMiddleware) => getDefaultMiddleware({
      thunk: { extraArgument: resources },
    }).concat(lifecycle, api.middleware),
    // Auth state contains an in-memory token; do not expose it through action/state history.
    devTools: false,
  });
  resources.bind(() => store.getState().auth);
  return Object.assign(store, { resources });
}
export type AppStore = ReturnType<typeof makeStore>;
export type RootState = ReturnType<AppStore["getState"]>;
export type AppDispatch = AppStore["dispatch"];
