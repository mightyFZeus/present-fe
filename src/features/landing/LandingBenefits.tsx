import { PresentationScene } from "./PresentationScene";

export function LandingBenefits() {
  return <section
    id="features"
    className="landing-shell landing-benefits"
    aria-labelledby="benefits-title"
  >
    <div className="landing-benefit-copy">
      <h2 id="benefits-title">One less thing<br /><em>to coordinate.</em></h2>
      <p className="landing-lead">
        You have a room to speak to. Present helps with the slide changes.
      </p>
      <p>
        Less reaching for a clicker. Less asking somebody else to advance the deck.
        More room to explain, respond and stay with your audience.
      </p>
      <ul className="landing-benefit-points">
        <li>Keep your existing PDF or PowerPoint deck.</li>
        <li>Explain ideas in your own words.</li>
        <li>Step in with manual controls whenever you need.</li>
      </ul>
    </div>
    <PresentationScene />
  </section>;
}
