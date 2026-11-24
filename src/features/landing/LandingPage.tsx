import "./landing.css";
import { LandingMotion } from "./LandingMotion";
import { landingDisplay, landingSans } from "./landingFont";
import { LandingHeader } from "./LandingHeader";
import { LandingHero } from "./LandingHero";
import { LandingBenefits } from "./LandingBenefits";
import { AutomaticFollowingSection } from "./AutomaticFollowingSection";
import { VoiceCommandsSection } from "./VoiceCommandsSection";
import { HowItWorks } from "./LandingSections";
import { PresenterControlsSection } from "./PresenterControlsSection";
import { LandingFaq } from "./LandingFaq";
import { LandingFooter } from "./LandingFooter";

export function LandingPage() {
  return <div className={[
    "present-landing",
    landingSans.variable,
    landingDisplay.variable,
  ].join(" ")}>
    <a className="landing-skip-link" href="#main-content">Skip to content</a>
    <LandingMotion />
    <LandingHeader />
    <main id="main-content" tabIndex={-1}>
      <LandingHero />
      <LandingBenefits />
      <AutomaticFollowingSection />
      <VoiceCommandsSection />
      <HowItWorks />
      <PresenterControlsSection />
      <LandingFaq />
    </main>
    <LandingFooter />
  </div>;
}
