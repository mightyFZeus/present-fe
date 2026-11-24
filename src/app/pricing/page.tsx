import type { Metadata } from "next";
import { PricingPage } from "@/features/pricing/PricingPage";

export const metadata: Metadata = {
  title: "Pricing | Prezntly",
  description: "Start free with Rehearsal. Explore Spotlight at ₦20,000 per month and Headline at ₦50,000 per month.",
};

export default function Pricing() { return <PricingPage />; }
