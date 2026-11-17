export function HowItWorks() {
  return <section id="how-it-works" className="landing-shell landing-how-section" aria-labelledby="how-title">
    <div className="landing-how-heading">
      <h2 id="how-title">Bring the deck<br />you already have.</h2>
      <p>Keep your slides. Present prepares the context around them, so you can get on with presenting.</p>
    </div>
    <ol className="landing-steps">
      <li>
        <span className="landing-step-number">01</span>
        <div><h3>Upload your presentation.</h3><p>Bring a PDF or PowerPoint (.pptx) deck. The slide order and original visuals remain the starting point.</p></div>
      </li>
      <li>
        <span className="landing-step-number">02</span>
        <div><h3>Let Present prepare it.</h3><p>Present reads the slides and prepares their context. Wait for Ready, then look through the deck before you begin.</p></div>
      </li>
      <li>
        <span className="landing-step-number">03</span>
        <div><h3>Start Following.</h3><p>Choose Start following and allow microphone access. Speak in your own words, or use a direct voice command when you want a particular slide.</p></div>
      </li>
    </ol>
  </section>;
}
