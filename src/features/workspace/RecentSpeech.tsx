"use client";

import { useEffect, useRef } from "react";
import { useAppSelector } from "@/store/hooks";

export function RecentSpeech({ presentation = false }: { presentation?: boolean }) {
  const { segments, interim } = useAppSelector((state) => state.live);
  const overlay = useRef<HTMLDivElement>(null);
  const latest = presentation ? interim || segments.at(-1)?.text : "";

  useEffect(() => {
    const panel = overlay.current;
    if (panel) panel.scrollTop = panel.scrollHeight;
  }, [latest]);

  if (presentation) {
    return latest ? (
      <div className="presentation-transcript" ref={overlay} role="region" aria-label="Live transcript" aria-live="off">
        <p>{latest}</p>
      </div>
    ) : null;
  }

  return (
    <section className="speech-panel" aria-labelledby="speech-title">
      <h2 id="speech-title">Recent speech</h2>
      <div className="speech-content" aria-live="off">
        {segments.length || interim ? (
          <p>{segments.map((item) => item.text).join(" ")} {interim && <span className="interim">{interim}</span>}</p>
        ) : <p className="muted">Your recent words appear here when following starts.</p>}
      </div>
    </section>
  );
}
