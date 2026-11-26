import Link from "next/link";
import SignAvatar from "@/components/SignAvatar";
import poseData from "@/public/models/asl-poses-v1.json";

const helloPose = Array.from({ length: 21 }, (_, i) => {
  const { lm } = poseData.poses.H;
  return { x: lm[i * 3], y: lm[i * 3 + 1], z: lm[i * 3 + 2] };
});

const activities = [
  { href: "/practice", title: "Practice", description: "Drill individual handshapes and read fingerspelled words." },
  { href: "/library", title: "Sign library", description: "Look up ASL signs and find reference videos." },
  { href: "/teach", title: "Teach a sign", description: "Record a handshape or motion for SignFlow to match." },
];

export default function Home() {
  return (
    <div className="signflow-home">
      <section className="home-hero">
        <div className="home-intro">
          <h1>Fingerspell.<br />See it in text.</h1>
          <p>Use your camera to read ASL fingerspelling, review each letter, and build a message. Camera processing runs on your device.</p>
          <div className="btn-row">
            <Link href="/live" className="btn primary">Open live camera</Link>
            <Link href="/avatar" className="btn">Watch the avatar</Link>
          </div>
        </div>
        <figure className="home-demo">
          <SignAvatar currentPose={helloPose} label="H" />
          <figcaption>Fingerspelling preview <span>H E L L O</span></figcaption>
        </figure>
      </section>
      <section className="home-activities" aria-label="Practice and reference">
        {activities.map(({ href, title, description }) => (
          <Link key={href} href={href} className="card">
            <h2>{title} <span aria-hidden="true">↗</span></h2>
            <p>{description}</p>
          </Link>
        ))}
      </section>
      <p className="home-scope">Live recognition works best with one hand in view and a brief hold on each letter. Use Word signs to match your own recordings.</p>
    </div>
  );
}
