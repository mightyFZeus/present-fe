import Link from "next/link";
import { ArrowUpRight, Presentation } from "lucide-react";

export function LandingHeader() {
  return <header className="landing-shell landing-header">
    <Link href="/" className="landing-brand" aria-label="Prezntly home">
      <Presentation size={27} strokeWidth={1.6} aria-hidden="true" /><span>Prezntly</span>
    </Link>
    <nav className="landing-navigation" aria-label="Main navigation">
      <a href="#features" className="landing-features-link">Features</a>
      <a href="#how-it-works" className="landing-how-link">How it works</a>
      <a href="#questions" className="landing-questions-link">Questions</a>
      <Link href="/login" className="landing-sign-in">Sign in <ArrowUpRight size={16} aria-hidden="true" /></Link>
    </nav>
  </header>;
}
