import Image from "next/image";

export function PresentationScene() {
  return <figure className="landing-scene">
    <div className="landing-scene-image">
      <Image
        src="/landing/presentation-room.jpg"
        fill
        sizes="(max-width: 760px) 90vw, (max-width: 1392px) 44vw, 560px"
        alt="A speaker addressing an audience beside a projected slide."
      />
    </div>
    <figcaption>Less looking down.<br /><em>More being in the room.</em></figcaption>
  </figure>;
}
