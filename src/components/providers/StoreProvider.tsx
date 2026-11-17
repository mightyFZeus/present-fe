"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Provider } from "react-redux";
import { setupListeners } from "@reduxjs/toolkit/query";
import { makeStore } from "@/store/store";
import { AuthSessionController } from "@/features/auth/AuthSessionController";

export function StoreProvider({ children }: { children: ReactNode }) {
  const [store] = useState(makeStore);
  useEffect(() => {
    const unsubscribe = setupListeners(store.dispatch);
    const session = new AuthSessionController(store);
    session.attach();
    return () => {
      unsubscribe();
      session.detach();
    };
  }, [store]);
  return <Provider store={store}>{children}</Provider>;
}
