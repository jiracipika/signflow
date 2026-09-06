import Link from "next/link";

export default function Home() {
  return (
    <>
      <div className="card" style={{ textAlign: "center", padding: "32px 20px" }}>
        <h1 style={{ margin: "0 0 6px", fontSize: 30, letterSpacing: "-0.02em" }}>
          SignFlow
        </h1>
        <p className="muted" style={{ fontSize: 17, margin: "0 0 18px" }}>
          An ASL <strong style={{ color: "var(--text)" }}>fingerspelling assistant</strong>.
          Spell words letter by letter with your hand — SignFlow reads the camera,
          recognizes static alphabet signs, and suggests whole words as you type.
        </p>
        <Link href="/live" className="btn primary big" style={{ textDecoration: "none", width: "100%" }}>
          Start signing
        </Link>
        <p className="small muted" style={{ marginTop: 14 }}>
          Works best in Chrome or Safari on a phone or laptop with a front camera.
        </p>
      </div>

      <div className="card">
        <h2>What it recognizes</h2>
        <p>
          <strong>24 static ASL alphabet letters</strong> (A–Z except J and Z) using
          on-device hand tracking plus a trained letter classifier.
        </p>
        <p>
          <strong>J and Z are motion-based signs</strong> and are not recognized in
          this version — you can enter them with manual buttons or the keyboard.
        </p>
        <p>
          This is a <strong>fingerspelling assistant, not a full ASL translator</strong>:
          it does not recognize words, grammar, facial expressions, or full signs
          from ASL proper. Full ASL translation is a much broader problem that needs
          a different recognition system.
        </p>
      </div>

      <div className="card">
        <h2>Privacy</h2>
        <p>
          Camera frames are processed <strong>entirely on your device</strong> — in
          your browser, via WebAssembly. No video or images are uploaded, recorded,
          or logged, ever. The letter classifier and hand-tracking models are
          downloaded to your browser once and cached.
        </p>
        <p>
          Transcripts are kept in memory and only saved locally if you explicitly
          choose to save them. You can delete everything at any time in{" "}
          <a href="/settings">Settings</a>.
        </p>
      </div>

      <div className="card">
        <h2>Honest limitations</h2>
        <p>
          Recognition quality depends on lighting, camera angle, and how closely your
          hand shapes match the training data (one contributor&apos;s hand). It works
          best for deliberate, paused fingerspelling — not continuous
          natural-speed signing. Some letters (M/N/T, I/Y) occasionally confuse.
        </p>
        <p>
          Browser support: Chrome/Edge on desktop and Android, Safari on iOS 16.4+.
          Camera access requires HTTPS (or localhost).
        </p>
      </div>
    </>
  );
}
