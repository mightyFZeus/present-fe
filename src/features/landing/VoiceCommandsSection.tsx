export function VoiceCommandsSection() {
  return <section className="landing-command-section" aria-labelledby="commands-title">
    <div className="landing-shell landing-command-layout">
      <div className="landing-feature-copy">
        <h2 id="commands-title">Give your slides<br /><em>a direction.</em></h2>
        <p className="landing-lead">Have a particular slide in mind? Say where you want to go.</p>
        <p>Alongside automatic topic following, Prezntly understands direct navigation requests. Choose a numbered slide or ask for the slide that covers a subject in your deck.</p>
        <p className="landing-command-note">Speak one complete command at a time while Following is active. The requested slide must be in your presentation.</p>
      </div>
      <dl className="landing-command-examples">
        <div>
          <dt>Choose a slide number</dt>
          <dd>
            <ul className="landing-spoken-examples" aria-label="Number command examples">
              <li><q>Go to slide one.</q></li>
              <li><q>Go to slide three.</q></li>
              <li><q>Go to slide five.</q></li>
            </ul>
            <p>Use the slide’s position in your deck. Digits and number words work, so <q>Go to slide number 5</q> is also supported.</p>
          </dd>
        </div>
        <div>
          <dt>Find a slide by topic</dt>
          <dd>
            <q className="landing-topic-command">Go to the slide about payments.</q>
            <p>Prezntly searches your deck for that subject. When the request or match is unclear, it keeps the current slide rather than guessing.</p>
          </dd>
        </div>
      </dl>
    </div>
  </section>;
}
