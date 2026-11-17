export function AutomaticFollowingSection() {
  return <section
    className="landing-shell landing-following-section"
    aria-labelledby="following-title"
  >
    <div className="landing-feature-copy">
      <h2 id="following-title">Follow the thought.<br /><em>Not a script.</em></h2>
      <p className="landing-lead">
        Your deck gives Prezntly the context. Your voice gives it the direction.
      </p>
      <p>
        Prezntly prepares the meaning behind your slides, then matches what you’re
        discussing to that context. No separate script or recorded rehearsal.
      </p>
    </div>
    <dl className="landing-following-notes">
      <div>
        <dt>Stay with the topic.</dt>
        <dd>Explain an idea naturally. Prezntly can bring the relevant slide into view.</dd>
      </div>
      <div>
        <dt>Revisit an earlier point.</dt>
        <dd>
          A question can take you back. Following can match an earlier slide, and
          the viewer keeps a Return to main control close at hand.
        </dd>
      </div>
      <div>
        <dt>Keep the final say.</dt>
        <dd>
          Clear context helps the match. When it’s unclear, the current slide stays
          in place. Manual navigation is always available.
        </dd>
      </div>
    </dl>
  </section>;
}
