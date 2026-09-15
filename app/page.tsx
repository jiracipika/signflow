"use client";

// Home: typographic hero + a live "now spelling" demo strip that types
// H-E-L-L-O letter by letter — showing what the app does instead of
// describing it. Reduced motion: renders the full word statically.

import { useEffect, useState } from "react";
import Link from "next/link";

const DEMO = "HELLO";

export default function Home() {
  const [shown, setShown] = useState(0);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // defer both branches out of the effect body (react-hooks/set-state-in-effect)
    const init = setTimeout(() => setShown(reduce ? DEMO.length : 0), 0);
    const id = reduce
      ? null
      : setInterval(() => {
          setShown((n) => (n >= DEMO.length ? 0 : n + 1));
        }, 700);
    return () => {
      clearTimeout(init);
      if (id) clearInterval(id);
    };
  }, []);

  return (
    <>
      <div className="card reveal" style={{ "--i": 0, textAlign: "center", padding: "40px 20px 32px" } as React.CSSProperties}>
        <h1 style={{ margin: "0 0 10px", fontSize: "clamp(2.4rem, 6vw, 3.4rem)", lineHeight: 1.08, letterSpacing: "-0.03em" }}>
          Say it with your hands.
        </h1>
        <p className="muted" style={{ fontSize: 18, margin: "0 auto 22px", maxWidth: "46ch" }}>
          SignFlow reads your camera, recognizes the ASL alphabet on-device, and
          helps you spell words letter by letter.
        </p>
        <div className="btn-row" style={{ justifyContent: "center" }}>
          <Link href="/live" className="btn primary big" style={{ textDecoration: "none" }}>
            Start signing
          </Link>
          <Link href="/avatar" className="btn big ghost" style={{ textDecoration: "none" }}>
            Watch the avatar
          </Link>
        </div>
        <p className="small muted" style={{ marginTop: 16, marginBottom: 0 }}>
          Best in Chrome or Safari with a front camera. Nothing ever leaves your device.
        </p>
      </div>

      <div className="card reveal" style={{ "--i": 1, textAlign: "center" } as React.CSSProperties}>
        <p className="small muted" style={{ marginTop: 0, letterSpacing: "0.08em", textTransform: "uppercase", fontSize: 12 }}>
          Now spelling
        </p>
        <div
          aria-hidden="true"
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "clamp(2.2rem, 8vw, 3.2rem)",
            fontWeight: 700,
            letterSpacing: "0.18em",
            minHeight: "1.3em",
            display: "flex",
            justifyContent: "center",
            gap: "0.12em",
          }}
        >
          {DEMO.split("").map((ch, i) => (
            <span
              key={i}
              style={{
                opacity: i < shown ? 1 : 0.12,
                color: i < shown ? "var(--accent)" : "var(--muted)",
                transition: "opacity 240ms var(--ease-out), color 240ms var(--ease-out)",
              }}
            >
              {ch}
            </span>
          ))}
        </div>
        <p className="small muted" style={{ marginBottom: 0 }}>
          Fingerspelling, spelled back to you — the avatar page shows every hand shape.
        </p>
      </div>

      <div className="reveal" style={{ "--i": 2 } as React.CSSProperties}>
        <div className="card">
          <h2>What it recognizes</h2>
          <p>
            <strong>24 static ASL alphabet letters</strong> (A–Z except motion-based J
            and Z, which have manual buttons), plus single-shape word signs like
            I LOVE YOU — and <strong>anything you teach it</strong> on the Teach page.
          </p>
          <p>
            This is a <strong>fingerspelling assistant, not a full ASL translator</strong>:
            it does not recognize grammar, facial expressions, or continuous signing.
          </p>
        </div>

        <div className="card">
          <h2>Private by construction</h2>
          <p>
            Camera frames are processed <strong>entirely on your device</strong> via
            WebAssembly. No video or images are uploaded, recorded, or logged — ever.
            Transcripts stay in memory unless you save them, and you can wipe
            everything in <Link href="/settings">Settings</Link>.
          </p>
        </div>

        <div className="card">
          <h2>Honest limitations</h2>
          <p>
            Recognition depends on lighting, angle, and how closely your hand shapes
            match the training data (one contributor&apos;s hand). It works best for
            deliberate, paused fingerspelling — not continuous signing. Some letters
            (M/N/T, I/Y) occasionally confuse. J and Z are motion-based and aren&apos;t
            recognized automatically.
          </p>
        </div>
      </div>
    </>
  );
}
