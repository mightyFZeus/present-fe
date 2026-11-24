import Link from "next/link";
import { ArrowRight, Check, Plus } from "lucide-react";
import { LandingHeader } from "@/features/landing/LandingHeader";
import { LandingFooter } from "@/features/landing/LandingFooter";
import { landingDisplay, landingSans } from "@/features/landing/landingFont";
import "@/features/landing/landing.css";
import "./pricing.css";

export const pricingPlans = [
  { name: "Rehearsal", price: 0, description: "Find your voice. Try your first deck.", minutes: "30 voice minutes, one-time", decks: "3 saved decks", note: "A free place to begin", featured: false },
  { name: "Spotlight", price: 20000, description: "For the presentations on your calendar.", minutes: "300 voice minutes per month", decks: "20 saved decks", note: "For regular presenters", featured: true },
  { name: "Headline", price: 50000, description: "More room for a full speaking schedule.", minutes: "1,000 voice minutes per month", decks: "60 saved decks", note: "For a fuller calendar", featured: false },
] as const;

const sharedFeatures = [
  "PDF and PowerPoint uploads",
  "Voice following and slide commands",
  "Hold, resume, and manual controls",
  "Focused presentation view",
];
const faqs = [
  ["What counts as a voice minute?", "Voice minutes describe time spent using microphone following. You can still browse and navigate your prepared slides manually. The allowances on this page are proposed plan limits."],
  ["Does the free allowance reset?", "Rehearsal includes 30 voice minutes once. It is not a monthly allowance. Spotlight and Headline list monthly voice allowances."],
  ["Can I subscribe to a paid plan now?", "Paid subscriptions are not available yet. You can create an account and start with free access. The paid prices and allowances show the planned offers."],
  ["Do I need a different deck for each plan?", "No. Prezntly works with your existing PDF or PowerPoint (.pptx) presentation. The plans differ in voice allowance and saved-deck capacity."],
  ["What does a saved deck mean?", "A saved deck is one uploaded presentation kept in your workspace. Its slides stay together as one deck."],
];

export function PricingPage() {
  return <div className={`present-landing pricing-page ${landingSans.variable} ${landingDisplay.variable}`}>
    <a className="landing-skip-link" href="#pricing-content">Skip to pricing</a>
    <LandingHeader />
    <main id="pricing-content" tabIndex={-1}>
      <section className="landing-shell pricing-intro" aria-labelledby="pricing-title">
        <p className="pricing-kicker">A little rehearsal. A bigger stage.</p>
        <h1 id="pricing-title">Room for your<br /><em>next big idea.</em></h1>
        <div className="pricing-intro-bottom">
          <p>Start with your first deck. Find your rhythm.<br />Choose more room when you need it.</p>
          <span className="pricing-billing">Prices in NGN <span aria-hidden="true">/</span> Monthly plans</span>
        </div>
      </section>
      <section className="landing-shell pricing-plans-section" aria-label="Choose your plan">
        <div className="pricing-plans">
          {pricingPlans.map((plan) => <article key={plan.name} className={`pricing-plan${plan.featured ? " is-featured" : ""}`} aria-labelledby={`plan-${plan.name}`}>
            <div className="pricing-plan-top"><span>{plan.note}</span>{plan.featured && <span className="pricing-recommendation">Our pick</span>}</div>
            <h2 id={`plan-${plan.name}`}>{plan.name}</h2>
            <p className="pricing-description">{plan.description}</p>
            <p className="pricing-price">{plan.price === 0 ? "Free" : `₦${plan.price.toLocaleString("en-NG")}`}<span>{plan.price === 0 ? "No subscription" : "/ month"}</span></p>
            <div className="pricing-allowances"><p>{plan.minutes}</p><p>{plan.decks}</p></div>
            {plan.price === 0 ? <Link href="/login" className="pricing-plan-action">Start free <ArrowRight size={18} aria-hidden="true" /></Link> : <button type="button" className="pricing-plan-action" disabled>Paid plans coming soon</button>}
            <p className="pricing-included-label">Every plan includes</p>
            <ul>{sharedFeatures.map((feature) => <li key={feature}><Check size={16} aria-hidden="true" />{feature}</li>)}</ul>
          </article>)}
        </div>
        <p className="pricing-launch-note">Paid plans are coming soon. Prices and allowances describe the planned offers; usage limits are not enforced yet.</p>
      </section>
      <section className="landing-shell pricing-comparison" aria-labelledby="comparison-title">
        <div className="pricing-section-heading"><h2 id="comparison-title">The details,<br /><em>side by side.</em></h2><p>The same presentation tools.<br />Different amounts of breathing room.</p></div>
        <div className="pricing-table-scroll" role="region" aria-label="Plan comparison" tabIndex={0}>
          <table><caption className="pricing-sr-only">Prezntly plan prices, allowances, and included tools</caption>
            <thead><tr><th scope="col">What is included</th>{pricingPlans.map((plan) => <th scope="col" key={plan.name}>{plan.name}</th>)}</tr></thead>
            <tbody>
              <tr><th scope="row">Price</th><td>Free</td><td>₦20,000 / month</td><td>₦50,000 / month</td></tr>
              <tr><th scope="row">Voice minutes</th><td>30, one-time</td><td>300 / month</td><td>1,000 / month</td></tr>
              <tr><th scope="row">Saved decks</th><td>3</td><td>20</td><td>60</td></tr>
              {sharedFeatures.map((feature) => <tr key={feature}><th scope="row">{feature}</th>{pricingPlans.map((plan) => <td key={plan.name}><Check size={18} aria-hidden="true" /><span className="pricing-sr-only">Included</span></td>)}</tr>)}
            </tbody>
          </table>
        </div>
      </section>
      <section className="landing-shell landing-faq-section" aria-labelledby="pricing-faq-title">
        <div><h2 id="pricing-faq-title">Before you<br /><em>take the stage.</em></h2><p>A few details about the plans.</p></div>
        <div className="landing-faq-list">{faqs.map(([question, answer]) => <details key={question}><summary>{question}<Plus size={18} aria-hidden="true" /></summary><p>{answer}</p></details>)}</div>
      </section>
    </main>
    <LandingFooter />
  </div>;
}
