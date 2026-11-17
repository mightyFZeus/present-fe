import type { Metadata } from "next";
import { LoginScreen } from "@/features/auth/LoginScreen";

export const metadata: Metadata = {
  title: "Sign in | Prezntly",
  description: "Sign in to Prezntly with Google.",
  robots: { index: false, follow: false },
};

export default function LoginPage() { return <LoginScreen />; }
