import type { Metadata } from "next";
import { LoginScreen } from "@/features/auth/LoginScreen";

export const metadata: Metadata = {
  title: "Sign in | Present",
  description: "Sign in to Present with Google.",
  robots: { index: false, follow: false },
};

export default function LoginPage() { return <LoginScreen />; }
