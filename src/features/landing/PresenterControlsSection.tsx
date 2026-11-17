import { Pause, Play, Square } from "lucide-react";

export function PresenterControlsSection() {
  return <section id="stay-in-control" className="landing-control-section" aria-labelledby="control-title">
    <div className="landing-shell">
      <div className="landing-control-layout">
        <div className="landing-feature-copy">
          <h2 id="control-title">Your presentation.<br /><em>Your call.</em></h2>
          <p className="landing-lead">Following helps with the repetition. You decide what happens next.</p>
          <p>Choose a thumbnail, use Previous or Next, or navigate with the viewer’s arrow keys. Manual navigation takes priority, so you can step in whenever the conversation takes a different turn.</p>
        </div>
        <dl className="landing-control-facts">
          <div><dt><Pause size={19} aria-hidden="true" />Hold</dt><dd>Pause voice following and local microphone capture while you explain, take a question or choose another slide.</dd></div>
          <div><dt><Play size={19} aria-hidden="true" />Resume</dt><dd>Start following again when you are ready. Coming back to the app or refreshing the page never restarts the microphone for you.</dd></div>
          <div><dt><Square size={18} aria-hidden="true" />Stop</dt><dd>End the live session and microphone capture. Your slides remain available for manual navigation.</dd></div>
        </dl>
      </div>
      <div className="landing-focus-layout">
        <figure className="landing-focus-example">
          <div className="landing-focus-stage">
            <div className="landing-example-slide">
              <span className="landing-example-position">Example deck · slide 02</span>
              <h3>Keep every<br /><em>drop useful.</em></h3>
              <p>Leak alerts. Low-flow taps.<br />Rainwater for the gardens.</p>
            </div>
          </div>
          <figcaption>Illustration of the focused presentation view.</figcaption>
        </figure>
        <div className="landing-feature-copy">
          <h2>Give the slide<br /><em>the room.</em></h2>
          <p>Presentation view puts the slide in the center and hides the setup sidebar and transcription. Portrait or landscape, the whole page stays in view.</p>
          <p>Use this focused view when presenting to a room or sharing your screen. Compact controls remain available when you need them, and full screen is there when you choose it.</p>
        </div>
      </div>
    </div>
  </section>;
}
