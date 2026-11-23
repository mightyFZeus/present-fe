"use client";

import type { ReactNode } from "react";
import { PresenterVoiceGate } from "@/features/presenter-voice/PresenterVoiceGate";
import { useAppSelector } from "@/store/hooks";
import { useAuthRoute } from "./useAuthRoute";
import "./auth.css";

export function AuthGate({ children }: { children: ReactNode }) {
  const status = useAuthRoute("workspace");
  const generation = useAppSelector((state) => state.auth.generation);
  if (status !== "authenticated") return <main className="auth-page" aria-busy="true"><p className="auth-pending" role="status">{status === "restoring" ? "Checking your sign-in…" : "Opening sign-in…"}</p></main>;
  return <PresenterVoiceGate key={generation}>{children}</PresenterVoiceGate>;
}
