"use client";
import { useAppSelector } from "@/store/hooks";
export function RecentSpeech() {
  const { segments, interim } = useAppSelector((state) => state.live);
  return <section className="speech-panel" aria-labelledby="speech-title"><h2 id="speech-title">Recent speech</h2><div className="speech-content" aria-live="off">{segments.length || interim ? <p>{segments.map((item) => item.text).join(" ")} {interim && <span className="interim">{interim}</span>}</p> : <p className="muted">Your recent words appear here when following starts.</p>}</div></section>;
}
