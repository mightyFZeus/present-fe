import type { Metadata } from "next";
import { AuthGate } from "@/features/auth/AuthGate";
import { canonicalPresentationId } from "@/features/workspace/libraryHelpers";
import { Workspace } from "@/features/workspace/Workspace";

export const metadata: Metadata = {
  title: "Presentation | Prezntly",
  description: "Review your prepared slides and explicitly start live following.",
  robots: { index: false, follow: false },
};

export default async function PresentationPage({
  params,
}: {
  params: Promise<{ presentationId: string }>;
}) {
  const presentationId = canonicalPresentationId((await params).presentationId);
  return <AuthGate><Workspace key={presentationId} presentationId={presentationId} /></AuthGate>;
}
