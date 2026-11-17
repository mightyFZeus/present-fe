import { Plus } from "lucide-react";

const questions = [
  { title: "What can I upload?", answer: "PDF and PowerPoint (.pptx) presentations within the 20 MiB upload limit. Prezntly prepares your existing deck; you do not need to rebuild it in the app." },
  { title: "Do I need to read my slides word for word?", answer: "No. Prezntly prepares context from the content of your deck and matches your speech to the topic. You can explain an idea in your own words without writing a separate script or recording a rehearsal. Clear context helps the matching." },
  { title: "Which voice commands can I use?", answer: "Try “Go to slide three,” “Go to slide number 5,” or “Go to the slide about payments.” Use one complete command at a time while Following is active. Numbers refer to the slide’s position in your deck, and the requested slide or topic needs to exist in that presentation." },
  { title: "Can I still change slides myself?", answer: "Yes. Use the slide thumbnails, Previous and Next controls, or the viewer’s arrow keys. Manual navigation takes priority. Hold pauses Following, Resume starts it again, and Stop ends the live session." },
  { title: "What happens if a command or match is unclear?", answer: "Prezntly keeps the current slide when a request is missing a target, out of range or ambiguous. You can repeat a clear command, continue explaining the topic, or choose a slide manually. Conservative checks also help avoid acting on quoted, negated or deferred commands." },
  { title: "How quickly do slides change?", answer: "Following responds to finalized speech and a clear slide match. Timing depends on your speech, connection and processing. A 1.5-second transition guard prevents rapid changes; commands received inside that window can be discarded, so pause briefly and repeat if needed. This is a spacing rule, not a promised response time." },
  { title: "When is my microphone on?", answer: "Only after you choose Start or Resume following and grant microphone permission. Hold or Stop ends local capture. Reloading or returning to the app never starts the microphone automatically." },
  { title: "Does Prezntly need an internet connection?", answer: "Yes. This web version uses online services to prepare the deck, transcribe speech and match slides. You need a connection while uploading, preparing and Following." },
];

export function LandingFaq() {
  return <section id="questions" className="landing-shell landing-faq-section" aria-labelledby="faq-title">
    <div><h2 id="faq-title">Before<br />you begin.</h2><p>A few practical details for your next presentation.</p></div>
    <div className="landing-faq-list">
      {questions.map((question) => <details key={question.title}>
        <summary>{question.title}<Plus size={19} aria-hidden="true" /></summary>
        <p>{question.answer}</p>
      </details>)}
    </div>
  </section>;
}
