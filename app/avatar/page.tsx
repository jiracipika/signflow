"use client";

// Avatar page v2: a proper sign player. Type anything (or tap a phrase chip)
// and the avatar signs it; pause/resume, replay, loop, speed, a progress bar,
// and a caption strip with per-letter replay synced to the engine's frame
// spans. Taught dynamic signs (Teach page) still take precedence.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import SignAvatar, { type Pose } from "@/components/SignAvatar";
import { spellSequence, FRAME_MS, type SignSequence } from "@/lib/signs/avatar-engine";
import { loadSigns } from "@/lib/signs/custom-signs";

type PosesFile = { poses: Record<string, { lm: number[]; spread: number; samples: number }> };

const PHRASES = [
  "HELLO", "THANK YOU", "PLEASE", "SORRY", "YES", "NO",
  "I LOVE YOU", "GOOD MORNING", "GOODNIGHT",
];

export default function AvatarPage() {
  const [poses, setPoses] = useState<Record<string, Pose[]> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [playing, setPlaying] = useState<"idle" | "letters" | "motion">("idle");
  const [paused, setPaused] = useState(false);
  const [loop, setLoop] = useState(false);
  const [caption, setCaption] = useState("");
  const [speed, setSpeed] = useState(1); // 0.5 slow .. 1.5 fast
  const [frameIdx, setFrameIdx] = useState(0);
  const [seq, setSeq] = useState<SignSequence | null>(null);

  const motionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pausedRef = useRef(false);
  const loopRef = useRef(false);
  useEffect(() => { pausedRef.current = paused; }, [paused]);
  useEffect(() => { loopRef.current = loop; }, [loop]);

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
        for (const [k, v] of Object.entries(d.poses)) {
          const flat = v.lm;
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

  const clearMotionTimer = () => {
    if (motionTimerRef.current) clearTimeout(motionTimerRef.current);
    motionTimerRef.current = null;
  };

  const armCompletion = useCallback((frames: number) => {
    clearMotionTimer();
    motionTimerRef.current = setTimeout(() => {
      // in loop mode SignAvatar wraps around on its own; never idle out
      if (!loopRef.current) setPlaying("idle");
      else motionTimerRef.current = null;
    }, (frames * FRAME_MS + 400) / speed);
  }, [speed]);

  const play = useCallback((input?: string) => {
    const clean = (input ?? text).toUpperCase().replace(/[^A-Z ]/g, "").trim();
    if (!clean || !poses) return;
    const spd = speed;
    const motionKey = Object.keys(motionSigns).find(
      (k) => clean === k || clean.startsWith(k + " ")
    );
    setPaused(false);
    setFrameIdx(0);
    if (motionKey) {
      const frames = motionSigns[motionKey];
      setCaption(motionKey);
      setSeq(null);
      setPlaying("motion");
      setSeq({ frames, caption: motionKey, spans: [], words: [] });
      armCompletion(frames.length);
    } else {
      const s = spellSequence(clean, poses, { holdMs: 700 / spd, gapMs: 620 / spd });
      setCaption(s.caption);
      setSeq(s);
      setPlaying("letters");
      armCompletion(s.frames.length);
    }
  }, [text, poses, speed, motionSigns, armCompletion]);

  // ?text= deep link autoplays once poses are ready
  const autoplayRef = useRef(false);
  useEffect(() => {
    if (!poses || autoplayRef.current) return;
    const q = new URLSearchParams(window.location.search).get("text");
    if (q) {
      autoplayRef.current = true;
      // defer state updates out of the effect (react-hooks/set-state-in-effect)
      const id = setTimeout(() => {
        setText(q);
        play(q);
      }, 0);
      return () => clearTimeout(id);
    }
  }, [poses, play]);

  useEffect(() => {
    return () => clearMotionTimer();
  }, []);

  const stop = () => {
    clearMotionTimer();
    setPlaying("idle");
    setPaused(false);
    setFrameIdx(0);
  };

  const activeSpan = useMemo(() => {
    if (!seq || playing === "idle") return null;
    if (seq.spans.length === 0) return null;
    return seq.spans.find((sp) => frameIdx >= sp.start && frameIdx < sp.end) ?? null;
  }, [seq, frameIdx, playing]);

  const replayLetter = (sp: { start: number; end: number }) => {
    if (!seq) return;
    const slice = seq.frames.slice(sp.start, sp.end);
    setSeq({ ...seq, frames: [...slice], spans: [], words: [] });
    setFrameIdx(0);
    setPlaying("letters");
    setPaused(false);
    armCompletion(slice.length);
  };

  return (
    <>
      <div className="card">
        <h2>Signing avatar</h2>
        <p>
          Type anything and the avatar signs it — letters flow into each other the
          way fingerspelling actually moves, with real J and Z stroke paths. Hand
          shapes come from real average landmarks of the training dataset.
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
          <button className="btn primary" onClick={() => play()} disabled={!text.trim() || !poses}>
            Sign it
          </button>
        </div>

        <div className="btn-row" style={{ marginTop: 10 }}>
          {playing !== "idle" && (
            <>
              <button className="btn" onClick={() => setPaused((p) => !p)}>
                {paused ? "Resume" : "Pause"}
              </button>
              <button className="btn" onClick={() => play()}>Replay</button>
              <button className="btn" onClick={stop}>Stop</button>
            </>
          )}
          <label className="small" style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <input type="checkbox" checked={loop} onChange={(e) => setLoop(e.target.checked)} />
            Loop
          </label>
        </div>

        <div className="setting-row">
          <div>
            <strong>Speed</strong>
            <div className="desc">0.5× slow for learning, up to 1.5×</div>
          </div>
          <input
            type="range"
            min={50}
            max={150}
            value={Math.round(speed * 100)}
            onChange={(e) => setSpeed(Number(e.target.value) / 100)}
            aria-label="Signing speed"
          />
          <span style={{ minWidth: 40, textAlign: "right" }}>{speed.toFixed(1)}×</span>
        </div>

        <div className="btn-row" style={{ marginTop: 8 }}>
          {PHRASES.map((p) => (
            <button key={p} className="btn" onClick={() => { setText(p); play(p); }}>
              {p.toLowerCase()}
            </button>
          ))}
        </div>
        {Object.keys(motionSigns).length > 0 && (
          <p className="small muted" style={{ marginBottom: 0 }}>
            Taught motion signs take precedence: {Object.keys(motionSigns).join(", ")}
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
            <>
              <SignAvatar
                currentPose={playing === "idle" ? restPose : null}
                motion={playing !== "idle" ? seq?.frames ?? null : null}
                paused={paused}
                onFrameIndex={setFrameIdx}
                label={playing !== "idle" ? caption || undefined : undefined}
              />
              {playing !== "idle" && seq && (
                <div className="card" style={{ marginTop: 10 }}>
                  <div
                    role="progressbar"
                    aria-label="Signing progress"
                    aria-valuemin={0}
                    aria-valuemax={seq.frames.length}
                    aria-valuenow={frameIdx}
                    style={{
                      height: 6, borderRadius: 3, background: "var(--border)",
                      overflow: "hidden", marginBottom: 10,
                    }}
                  >
                    <div
                      style={{
                        height: "100%",
                        width: `${Math.min(100, (frameIdx / Math.max(1, seq.frames.length)) * 100)}%`,
                        background: "var(--accent, #4f9cff)",
                        transition: "width 60ms linear",
                      }}
                    />
                  </div>
                  <div className="btn-row" aria-label="Fingerspelled letters">
                    {caption.split("").map((ch, i) =>
                      ch === " " ? (
                        <span key={i} style={{ width: 8 }} />
                      ) : (
                        <button
                          key={i}
                          className="btn"
                          style={
                            activeSpan && activeSpan.letter === ch && frameIdx >= activeSpan.start
                              ? { borderColor: "var(--accent, #4f9cff)", color: "var(--accent, #4f9cff)" }
                              : undefined
                          }
                          onClick={() => {
                            const sp = seq.spans.find(
                              (s) => s.letter === ch && i >= (caption.slice(0, i).split("").filter((c) => c !== " ").length)
                            );
                            if (sp) replayLetter(sp);
                            else if (seq.spans.length) replayLetter(seq.spans[0]);
                          }}
                          title={`Replay ${ch}`}
                        >
                          {ch}
                        </button>
                      )
                    )}
                  </div>
                  <p className="small muted" style={{ marginBottom: 0 }}>
                    Tap a letter to replay just that sign.
                  </p>
                </div>
              )}
            </>
          )}
        </section>
        <section className="card">
          <h2>About this avatar</h2>
          <p className="small">
            Each letter&apos;s shape is the <strong>mean of hundreds of real hand
            landmark recordings</strong> from the CC-BY-4.0 training dataset. Letters
            within a word flow directly into each other (fingerspelling doesn&apos;t
            return to rest between letters), and J/Z trace their true stroke paths —
            pinky hook for J, index zigzag for Z — as approximations, since static
            averages can&apos;t capture their motion.
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
