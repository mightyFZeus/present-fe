import { combineReducers, type Reducer } from "@reduxjs/toolkit";
import type { AppStore, RootState } from "@/store/store";
import { authReducer } from "@/features/auth/authSlice";
import { assetsReducer } from "@/features/presentations/assetsSlice";
import { liveReducer } from "@/features/live/liveSlice";
import { api } from "@/store/services/api";
import { workspaceReducer } from "./workspaceSlice";
import { presentationEntered, presentationReducer } from "./presentationSlice";

// Workspace installs this additive UI reducer without refreshing the store provider.
const reducer = combineReducers({
  auth: authReducer,
  workspace: workspaceReducer,
  assets: assetsReducer,
  live: liveReducer,
  [api.reducerPath]: api.reducer,
  presentation: presentationReducer,
});
const storeReducer: Reducer<RootState> = (state, action) => reducer(state, action);
const installed = new WeakMap<AppStore, typeof reducer>();
export function installPresentationStore(store: AppStore) {
  if (installed.get(store) === reducer) return;
  const before = store.getState();
  const hasPresentation = "presentation" in before;
  store.replaceReducer(storeReducer);
  installed.set(store, reducer);
  if (!hasPresentation && before.workspace.mic.status === "listening") {
    store.dispatch(presentationEntered());
  }
}
