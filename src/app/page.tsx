import type { Metadata } from "next";
import { LandingPage } from "@/features/landing/LandingPage";

export const metadata: Metadata = {
  title: "Prezntly | Speak naturally. Your slides follow.",
  description: "Live voice following for your PDF or PowerPoint deck. Speak naturally, ask for a slide by number or topic, and keep control with Hold, Stop and manual navigation.",
};

export default function Home() { return <LandingPage />; }
