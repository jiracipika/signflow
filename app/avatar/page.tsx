"use client";

// Avatar page: a proper sign player on a stage. Type anything (or tap a
// phrase chip) and the avatar signs it; pause/resume, replay, stop, loop,
// speed, a progress bar, and a mono caption strip with per-letter replay
// synced to the engine's frame spans. Taught dynamic signs (Teach page)
// still take precedence.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import SignAvatar from "@/components/SignAvatar";
import type { Pose } from "@/components/SignAvatar";
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
    if (!seq || playing === "idle" || seq.spans.length === 0) return null;
    return seq.spans.find((sp) => frameIdx >= sp.start && frameIdx < sp.end) ?? null;
  }, [seq, frameIdx, playing]);

  const replayLetter = (sp: { start: number; end: number }) => {
    if (!seq) return;
    const slice = seq.frames.slice(sp.start, sp.end);
    setSeq({ ...seq, frames: slice, spans: [], words: [] });
    setFrameIdx(0);
    setPlaying("letters");
    setPaused(false);
    armCompletion(slice.length);
  };

  return (
    <>
      <div className="card reveal" style={{ "--i": 0 } as React.CSSProperties}>
        <h2>Signing avatar</h2>
        <p>
          Type anything and the avatar signs it — letters flow into each other the
          way fingerspelling actually moves, with real J and Z stroke paths.
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
        <div className="phrase-row" aria-label="Common phrases">
          {PHRASES.map((p) => (
            <button key={p} className="phrase-chip" onClick={() => { setText(p); play(p); }}>
              {p.toLowerCase()}
            </button>
          ))}
        </div>
        {Object.keys(motionSigns).length > 0 && (
          <p className="small muted" style={{ marginBottom: 0, marginTop: 10 }}>
            Taught motion signs take precedence: {Object.keys(motionSigns).join(", ")}
          </p>
        )}
      </div>

      <div className="live-layout">
        <section className="reveal" style={{ "--i": 1 } as React.CSSProperties}>
          {error ? (
            <div className="card" role="alert">
              <strong>Could not load pose data.</strong>
              <p className="small muted">{error}</p>
              <button className="btn" onClick={() => location.reload()}>Retry</button>
            </div>
          ) : (
            <>
              <div className="stage">
                <SignAvatar
                  currentPose={playing === "idle" ? restPose : null}
                  motion={playing !== "idle" ? seq?.frames ?? null : null}
                  paused={paused}
                  onFrameIndex={setFrameIdx}
                />
                {playing !== "idle" && caption && (
                  <div className="stage-caption" aria-live="polite">{caption}</div>
                )}
              </div>

              <div className="transport">
                {playing !== "idle" ? (
                  <>
                    <button className="btn" onClick={() => setPaused((p) => !p)} aria-pressed={paused}>
                      {paused ? "▶ Resume" : "⏸ Pause"}
                    </button>
                    <button className="btn" onClick={() => play()}>↻ Replay</button>
                    <button className="btn ghost" onClick={stop}>■ Stop</button>
                  </>
                ) : (
                  <button
                    className="btn primary"
                    onClick={() => play()}
                    disabled={!text.trim() || !poses}
                  >
                    ▶ Sign it
                  </button>
                )}
                <span className="spacer" />
                <label className="small" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <input
                    type="checkbox"
                    checked={loop}
                    onChange={(e) => setLoop(e.target.checked)}
                    aria-label="Loop signing"
                  />
                  Loop
                </label>
                <label className="small" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  Speed
                  <input
                    type="range"
                    min={50}
                    max={150}
                    value={Math.round(speed * 100)}
                    onChange={(e) => setSpeed(Number(e.target.value) / 100)}
                    aria-label="Signing speed"
                    style={{ width: 90 }}
                  />
                  <span style={{ minWidth: 34, textAlign: "right" }}>{speed.toFixed(1)}×</span>
                </label>
              </div>

              {playing !== "idle" && seq && (
                <div className="card">
                  <div className="progress" role="progressbar" aria-label="Signing progress">
                    <div
                      style={{
                        width: `${Math.min(100, (frameIdx / Math.max(1, seq.frames.length)) * 100)}%`,
                      }}
                    />
                  </div>
                  <div className="letter-strip" aria-label="Fingerspelled letters">
                    {caption.split("").map((ch, i) =>
                      ch === " " ? (
                        <span key={i} className="letter-gap" aria-hidden="true" />
                      ) : (
                        <button
                          key={i}
                          className="letter-chip"
                          data-active={!!activeSpan && activeSpan.letter === ch}
                          onClick={() => {
                            // replay the i-th non-space letter's span
                            const seen: string[] = [];
                            const sp = seq.spans.find((s) => {
                              if (s.letter === ch && seen.length === i - seen.filter((_, j) => j < i && caption[j] !== " ").length) return true;
                              return false;
                            }) ?? seq.spans.filter((s) => s.letter === ch)[
                              caption.slice(0, i).split("").filter((c) => c !== " ").length
                            ];
                            if (sp) replayLetter(sp);
                          }}
                          title={`Replay ${ch}`}
                        >
                          {ch}
                        </button>
                      )
                    )}
                  </div>
                  <p className="small muted" style={{ margin: "4px 0 0" }}>
                    Tap a letter to replay just that sign.
                  </p>
                </div>
              )}
            </>
          )}
        </section>
        <section className="card reveal" style={{ "--i": 2 } as React.CSSProperties}>
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
