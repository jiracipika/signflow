"use client";

// Avatar page: type anything and the avatar fingerspells it using real mean
// hand shapes from the training dataset. Taught dynamic signs replay as
// recorded motion when their name appears in the text.

import { useEffect, useMemo, useRef, useState } from "react";
import SignAvatar, { type Pose } from "@/components/SignAvatar";
import { spellSequence } from "@/lib/signs/avatar-engine";
import { loadSigns } from "@/lib/signs/custom-signs";

type PosesFile = { poses: Record<string, number[]> };

export default function AvatarPage() {
  const [poses, setPoses] = useState<Record<string, Pose[]> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [playing, setPlaying] = useState<"idle" | "letters" | "motion">("idle");
  const [caption, setCaption] = useState("");

  const motionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/models/asl-poses-v1.json")
      .then((r) => {
        if (!r.ok) throw new Error(`poses fetch ${r.status}`);
        return r.json() as Promise<PosesFile>;
      })
      .then((d) => {
        if (cancelled) return;
        const out: Record<string, Pose[]> = {};
        for (const [k, flat] of Object.entries(d.poses)) {
          out[k] = [];
          for (let i = 0; i < 21; i++)
            out[k].push({ x: flat[i * 3], y: flat[i * 3 + 1], z: flat[i * 3 + 2] });
        }
        setPoses(out);
      })
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      cancelled = true;
    };
  }, []);

  // motion data for taught signs (label -> frames) loaded lazily
  const [motionSigns, setMotionSigns] = useState<Record<string, Pose[][]>>({});
  useEffect(() => {
    const id = setTimeout(() => {
      const out: Record<string, Pose[][]> = {};
      for (const s of loadSigns()) {
        if (s.kind !== "dynamic") continue;
        // first prototype sequence as replay frames
        const proto = s.prototypes[0];
        out[s.label.toUpperCase()] = proto.map((f) =>
          Array.from({ length: 21 }, (_, i) => ({
            x: f[i * 3] ?? 0,
            y: f[i * 3 + 1] ?? 0,
            z: f[i * 3 + 2] ?? 0,
          }))
        );
      }
      setMotionSigns(out);
    }, 0);
    return () => clearTimeout(id);
  }, []);

  const restPose = useMemo(() => {
    if (!poses) return null;
    const vals = Object.values(poses);
    const a = poses["C"] ?? vals[0];
    const b = poses["E"] ?? a;
    return a.map((p, i) => ({
      x: (p.x + b[i].x) / 2,
      y: (p.y + b[i].y) / 2,
      z: (p.z + b[i].z) / 2,
    }));
  }, [poses]);

  const play = () => {
    const clean = text.toUpperCase().replace(/[^A-Z ]/g, "").trim();
    if (!clean || !poses) return;
    // check for a taught motion sign matching the whole input (or first word)
    const motionKey = Object.keys(motionSigns).find(
      (k) => clean === k || clean.startsWith(k + " ")
    );
    if (motionKey) {
      const frames = motionSigns[motionKey];
      setCaption(motionKey);
      setFrameWindow(null);
      setMotionWindow(frames);
      setPlaying("motion");
      const dur = frames.length * 45 + 400;
      if (motionTimerRef.current) clearTimeout(motionTimerRef.current);
      motionTimerRef.current = setTimeout(() => setPlaying("idle"), dur);
    } else {
      const seq = spellSequence(clean, poses);
      setCaption(seq.caption);
      setMotionWindow(null);
      setFrameWindow(seq.frames);
      setPlaying("letters");
      const dur = seq.frames.length * 45 + 400;
      if (motionTimerRef.current) clearTimeout(motionTimerRef.current);
      motionTimerRef.current = setTimeout(() => setPlaying("idle"), dur);
    }
  };

  useEffect(() => {
    return () => {
      if (motionTimerRef.current) clearTimeout(motionTimerRef.current);
    };
  }, []);

  // windows are set imperatively in play(); avatar consumes them while playing
  const [frameWindow, setFrameWindow] = useState<Pose[][] | null>(null);
  const [motionWindow, setMotionWindow] = useState<Pose[][] | null>(null);

  return (
    <>
      <div className="card">
        <h2>Signing avatar</h2>
        <p>
          Type anything and the avatar fingerspells it. Hand shapes come from
          real average landmarks of the training dataset — not invented poses.
          Taught dynamic signs (Teach page) replay as recorded motion when you
          type their name.
        </p>
        <div className="btn-row" style={{ flexWrap: "nowrap" }}>
          <input
            type="text"
            value={text}
            maxLength={60}
            placeholder="Type to sign… e.g. I LOVE YOU"
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && play()}
            style={{ flex: 1, minWidth: 0 }}
            aria-label="Text to sign"
          />
          <button className="btn primary" onClick={play} disabled={!text.trim() || !poses}>
            Sign it
          </button>
        </div>
        {Object.keys(motionSigns).length > 0 && (
          <p className="small muted" style={{ marginBottom: 0 }}>
            Motion signs available: {Object.keys(motionSigns).join(", ")} — type the
            exact name to replay the motion.
          </p>
        )}
      </div>

      <div className="live-layout">
        <section>
          {error ? (
            <div className="card" role="alert">
              <strong>Could not load pose data.</strong>
              <p className="small muted">{error}</p>
              <button className="btn" onClick={() => location.reload()}>Retry</button>
            </div>
          ) : (
            <SignAvatar
              currentPose={playing === "idle" ? restPose : null}
              motion={playing !== "idle" ? (motionWindow ?? frameWindow) : null}
              label={playing !== "idle" ? caption || undefined : undefined}
            />
          )}
        </section>
        <section className="card">
          <h2>About this avatar</h2>
          <p className="small">
            Each letter&apos;s shape is the <strong>mean of hundreds of real hand
            landmark recordings</strong> from the CC-BY-4.0 training dataset — the
            same data that trains recognition. Transitions are interpolated, and
            J/Z get a tracing wiggle since their real motion isn&apos;t captured in
            static averages (honestly an approximation).
          </p>
          <p className="small muted">
            This is a fingerspelling visualization, not a certified ASL teaching
            tool — hand shapes reflect the dataset&apos;s single contributor.
          </p>
        </section>
      </div>
    </>
  );
}
