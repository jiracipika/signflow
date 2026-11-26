import Link from "next/link";
import Handshape from "@/components/Handshape";

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
        <div className="home-demo">
          <Handshape letter="H" />
          <p className="home-demo-caption">Fingerspelling preview <span>H E L L O</span></p>
        </div>
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
