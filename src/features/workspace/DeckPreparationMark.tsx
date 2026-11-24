export function DeckPreparationMark({ queued }: { queued: boolean }) {
  return <span className={`deck-preparation${queued ? " is-queued" : ""}`}>
    <span className="deck-preparation-halo" />
    <svg className="deck-preparation-logo" viewBox="0 0 96 96" fill="none" aria-hidden="true">
      <path className="deck-cadence-bar" d="M12 44Q12 40 16 40H19Q23 40 23 44V52Q23 56 19 56H16Q12 56 12 52Z" />
      <path className="deck-cadence-bar" d="M30 26Q30 22 34 22H37Q41 22 41 26V70Q41 74 37 74H34Q30 74 30 70Z" />
      <path className="deck-cadence-bar" d="M48 36Q48 32 52 32H55Q59 32 59 36V60Q59 64 55 64H52Q48 64 48 60Z" />
      <path className="deck-cadence-slide" d="M67 34H85V62H67Z M73 40V56H79V40Z" fillRule="evenodd" />
    </svg>
    <span className="deck-preparation-copy">
      <span>{queued ? "Your deck is in line" : "Finding the flow"}</span>
      <span>{queued ? "Preparation will begin shortly" : "Preparing your slides and their context"}</span>
    </span>
    <span className="deck-preparation-track"><span /></span>
  </span>;
}
