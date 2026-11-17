"use client";

import { useState } from "react";
import { ArrowRight } from "lucide-react";

export const stageTopics = [
  {
    id: "energy",
    label: "Energy",
    number: "01",
    quote: "Lighting and building schedules reduce electricity use.",
    title: "Use energy with purpose.",
    detail: "Efficient lighting. Smarter building schedules.",
    footnote: "Use energy where it makes a difference.",
  },
  {
    id: "water",
    label: "Water",
    number: "02",
    quote: "We’re using leak alerts and rainwater to reduce campus water use.",
    title: "Keep every drop useful.",
    detail: "Leak alerts. Low-flow taps. Rainwater for the gardens.",
    footnote: "Small changes, across the whole campus.",
  },
  {
    id: "rollout",
    label: "Rollout",
    number: "03",
    quote: "Four weeks to a smarter campus.",
    title: "Start small. Build from there.",
    detail: "Review the campus. Try one building. Learn, then expand.",
    footnote: "A four-week fictional rollout plan.",
  },
] as const;

export function LandingStage() {
  const [selected, setSelected] = useState(1);
  const topic = stageTopics[selected];

  return <figure className="landing-stage" aria-labelledby="landing-stage-caption">
    <figcaption id="landing-stage-caption" className="landing-stage-caption">
      <span>Illustrative example · no microphone needed</span>
      <span>Fictional campus plan</span>
    </figcaption>
    <div className="landing-stage-main">
      <div className="landing-stage-speech">
        <p className="landing-stage-prompt">The idea you’re explaining</p>
        <div aria-live="polite" aria-atomic="true">
          <blockquote key={topic.id} className="landing-stage-quote">
            “{topic.quote}”
          </blockquote>
        </div>
        <p className="landing-stage-instruction">
          Choose a topic. See the matching slide.
          <ArrowRight size={17} aria-hidden="true" />
        </p>
        <div className="landing-stage-topics" role="group" aria-label="Example topics">
          {stageTopics.map((item, index) => <button
            key={item.id}
            type="button"
            aria-pressed={selected === index}
            aria-controls="landing-example-slide"
            onClick={() => setSelected(index)}
          >
            <span aria-hidden="true">{item.number}</span>{item.label}
          </button>)}
        </div>
      </div>
      <div id="landing-example-slide" className="landing-stage-projector">
        <div key={topic.id} className="landing-stage-slide">
          <div className="landing-slide-heading">
            <span>A smarter campus</span><span>{topic.number} / 03</span>
          </div>
          <h2>{topic.title}</h2>
          <p>{topic.detail}</p>
          <span className="landing-slide-footnote">{topic.footnote}</span>
        </div>
      </div>
    </div>
  </figure>;
}
