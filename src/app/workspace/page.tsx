import type { Metadata } from "next";
import { AuthGate } from "@/features/auth/AuthGate";
import { PresentationLibrary } from "@/features/workspace/PresentationLibrary";

export const metadata: Metadata = {
  title: "Workspace | Present",
  description: "Your saved presentations, ready to open, manage and present again.",
  robots: { index: false, follow: false },
};

export default function WorkspacePage() {
  return <AuthGate><PresentationLibrary /></AuthGate>;
}
