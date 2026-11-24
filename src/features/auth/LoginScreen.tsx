import { BrandMark } from "@/components/BrandMark";
"use client";

import Link from "next/link";
import { GoogleSignIn } from "./GoogleSignIn";
import { useAuthRoute } from "./useAuthRoute";
import "./auth.css";

export function LoginScreen() {
  const status = useAuthRoute("login");
  return <main className="auth-page">
    <section className="auth-login" aria-labelledby="login-title">
      <Link href="/" className="auth-brand" aria-label="Prezntly home"><BrandMark /><span>Prezntly</span></Link>
      <h1 id="login-title">Welcome to Prezntly</h1>
      <p className="auth-intro">Bring your slides. We’ll follow your voice.</p>
      {status === "unauthenticated" ? <GoogleSignIn /> : <p className="auth-pending" role="status">{status === "restoring" ? "Checking your sign-in…" : "Opening your workspace…"}</p>}
    </section>
  </main>;
}
