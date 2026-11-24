import { BrandMark } from "@/components/BrandMark";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

export function LandingFooter() {
  return <footer className="landing-footer">
    <div className="landing-shell landing-closing">
      <h2>Bring your<br /><em>next presentation.</em></h2>
      <div><p>You bring the ideas.<br />Prezntly helps keep the slides with you.</p><Link href="/login" className="landing-primary-link">Start presenting <ArrowRight size={19} aria-hidden="true" /></Link><span>Sign in with Google to get started.</span></div>
    </div>
    <div className="landing-shell landing-footer-bar">
      <Link href="/" className="landing-brand" aria-label="Prezntly home"><BrandMark /><span>Prezntly</span></Link>
      <nav aria-label="Footer navigation"><a href="#features">Features</a><a href="#how-it-works">How it works</a><a href="#questions">Questions</a><Link href="/login">Workspace</Link></nav>
    </div>
    <div className="landing-shell landing-photo-credit">Presentation photography by <a href="https://unsplash.com/photos/speaker-presenting-to-a-large-audience-in-an-auditorium-qzO9a6oQ8AM">Marwen Larafa on Unsplash</a>.</div>
  </footer>;
}
