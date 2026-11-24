import Link from "next/link";
import { ArrowRight, ArrowDown } from "lucide-react";
import { LandingStage } from "./LandingStage";

export function LandingHero() {
  return <section className="landing-shell landing-hero" aria-labelledby="hero-title">
    <div className="landing-hero-heading">
      <p className="landing-intro"><span className="landing-intro-rule" />Present with your voice</p>
      <h1 id="hero-title">Speak <em>naturally.</em><br />Your slides follow.</h1>
      <div className="landing-cadence-sculpture" aria-hidden="true">
        <span /><span /><span /><span />
        <small>VOICE → FOCUS</small>
      </div>
    </div>
    <div className="landing-hero-bottom">
      <p className="landing-hero-description">
        Prezntly matches your voice to the deck you already have.
        Stay with your audience.
      </p>
      <div className="landing-hero-action-group">
        <div className="landing-hero-actions">
          <Link href="/login" className="landing-primary-link">
            Start presenting <ArrowRight size={19} aria-hidden="true" />
          </Link>
          <a href="#features" className="landing-secondary-link">
            Explore <ArrowDown size={16} aria-hidden="true" />
          </a>
        </div>
        <p className="landing-hero-note">PDF or PowerPoint. Microphone on your terms.</p>
      </div>
    </div>
    <LandingStage />
  </section>;
}
