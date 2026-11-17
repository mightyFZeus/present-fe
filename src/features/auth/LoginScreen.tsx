"use client";

import Link from "next/link";
import { Presentation } from "lucide-react";
import { GoogleSignIn } from "./GoogleSignIn";
import { useAuthRoute } from "./useAuthRoute";
import "./auth.css";

export function LoginScreen() {
  const status = useAuthRoute("login");
  return <main className="auth-page">
    <section className="auth-login" aria-labelledby="login-title">
      <Link href="/" className="auth-brand" aria-label="Present home"><span className="auth-brand-mark"><Presentation size={22} strokeWidth={1.6} aria-hidden="true" /></span><span>Present</span></Link>
      <h1 id="login-title">Welcome to Present</h1>
      <p className="auth-intro">Bring your slides. We’ll follow your voice.</p>
      {status === "unauthenticated" ? <GoogleSignIn /> : <p className="auth-pending" role="status">{status === "restoring" ? "Checking your sign-in…" : "Opening your workspace…"}</p>}
    </section>
  </main>;
}
