"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useHandTracking } from "@/lib/camera";
import { loadModel, predictLandmarks } from "@/lib/model";
import { TemporalDecoder } from "@/lib/decoder";
import { useSettings } from "@/lib/settings";
import { loadStats, recordRound, resetStats, weakestLetters, type PracticeStats } from "@/lib/practice-stats";
import type { Landmark } from "@/lib/types";
import LandmarkOverlay from "@/components/LandmarkOverlay";
import SignAvatar, { type Pose } from "@/components/SignAvatar";

const STATIC_LETTERS = "ABCDEFGHIKLMNOPQRSTUVWXY".split("");
const PRACTICE_WORDS = ["HI", "OK", "CAT", "DOG", "YOU", "EAT", "BYE"];

type Mode = { kind: "letter"; target: string } | { kind: "word"; target: string };

type Feedback =
  | { state: "idle" }
  | { state: "waiting" }
  | { state: "seen"; letter: string; top: [string, number][] }
  | { state: "done"; score: number };

export default function PracticePage() {
  const [settings] = useSettings();
  const [mode, setMode] = useState<Mode>({ kind: "letter", target: "A" });
  const [feedback, setFeedback] = useState<Feedback>({ state: "idle" });
  const [modelReady, setModelReady] = useState(false);
  const [landmarks, setLandmarks] = useState<Landmark[] | null>(null);
  const [stats, setStats] = useState<PracticeStats | null>(null);
  const [refPoses, setRefPoses] = useState<Record<string, Pose[]> | null>(null);
  const [wordIdx, setWordIdx] = useState(0);
  const [copied, setCopied] = useState(false);

  const decoderRef = useRef<TemporalDecoder | null>(null);
  const holdRef = useRef(0);
  const wordIdxRef = useRef(0);
  const bumpWord = () => {
    wordIdxRef.current += 1;
    setWordIdx(wordIdxRef.current);
  };
  const resetWord = () => {
    wordIdxRef.current = 0;
    setWordIdx(0);
  };

  useEffect(() => {
    let cancelled = false;
    const id = setTimeout(() => {
      if (!cancelled) setStats(loadStats());
    }, 0);
    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, []);

  // reference hand shapes for the animated guide
  useEffect(() => {
    let cancelled = false;
    fetch("/models/asl-poses-v1.json")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`poses ${r.status}`))))
      .then((d: { poses: Record<string, { lm: number[] }> }) => {
        if (cancelled) return;
        const out: Record<string, Pose[]> = {};
        for (const [k, v] of Object.entries(d.poses)) {
          out[k] = [];
          for (let i = 0; i < 21; i++)
            out[k].push({ x: v.lm[i * 3], y: v.lm[i * 3 + 1], z: v.lm[i * 3 + 2] });
        }
        setRefPoses(out);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    loadModel()
      .then(() => {
        if (!cancelled) setModelReady(true);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    decoderRef.current = new TemporalDecoder({
      stabilityFrames: settings.stabilityFrames,
      minConfidence: settings.minConfidence,
    });
  }, [settings.stabilityFrames, settings.minConfidence]);

  const onFrame = useCallback(
    (frame: import("@/lib/types").HandFrame | null) => {
      setLandmarks(frame ? frame.landmarks : null);
      const d = decoderRef.current;
      if (!d || !modelReady) return;
      const pred = frame ? predictLandmarks(frame.landmarks) : null;
      const state = d.push(pred, frame?.timestampMs ?? performance.now());

      if (!pred) {
        holdRef.current = 0;
        setFeedback({ state: "waiting" });
        return;
      }
      // top-3 predictions with scores (uncalibrated)
      const top = Object.entries(pred.probabilities)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([l, p]) => [l, p] as [string, number]);
      setFeedback({ state: "seen", letter: pred.letter, top });

      const want = mode.kind === "letter" ? mode.target : mode.target[wordIdxRef.current];
      if (state.tentative === want) {
        holdRef.current++;
        if (holdRef.current >= 8) {
          holdRef.current = 0;
          if (mode.kind === "letter") {
            setFeedback({ state: "done", score: pred.confidence });
            setStats(recordRound(want, true));
          } else {
            bumpWord();
            if (wordIdxRef.current >= mode.target.length) {
              setFeedback({ state: "done", score: pred.confidence });
              resetWord();
            }
          }
          d.commitLetter();
        }
      } else {
        holdRef.current = 0;
      }
    },
    [modelReady, mode]
  );

  const { videoRef, status, start, stop } = useHandTracking({ onFrame });
  const running = status === "running";

  const startCamera = () => {
    decoderRef.current?.reset();
    holdRef.current = 0;
    resetWord();
    setFeedback({ state: "waiting" });
    start("user");
  };

  const pickNew = (m: Mode) => {
    setMode(m);
    resetWord();
    holdRef.current = 0;
    decoderRef.current?.reset();
    setFeedback(running ? { state: "waiting" } : { state: "idle" });
  };

  const rngRef = useRef(0);
  const nextRandom = () => {
    const pool =
      mode.kind === "letter"
        ? STATIC_LETTERS.filter((l) => l !== mode.target)
        : PRACTICE_WORDS.filter((w) => w !== mode.target);
    rngRef.current = (rngRef.current * 1103515245 + 12345) & 0x7fffffff;
    const next = pool[rngRef.current % pool.length];
    pickNew(
      mode.kind === "letter"
        ? { kind: "letter", target: next }
        : { kind: "word", target: next }
    );
  };

  const weak = stats ? weakestLetters(stats, 3) : [];

  const shareResults = async () => {
    if (!stats) return;
    const total = Object.values(stats.letters).reduce((a, s) => a + s.attempts, 0);
    const hits = Object.values(stats.letters).reduce((a, s) => a + s.hits, 0);
    const text = `SignFlow practice: ${hits}/${total} letters recognized · ${stats.streakCurrent}-day streak 🔥`;
    try {
      if (navigator.share) {
        await navigator.share({ text });
      } else {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }
    } catch {
      /* user cancelled share */
    }
  };

  const progress =
    mode.kind !== "word" ? null : (
      <>
        {mode.target.split("").map((ch, i) => (
          <span
            key={i}
            className="tag"
            style={{
              opacity: i < wordIdx ? 1 : 0.4,
              color: i < wordIdx ? "var(--ok)" : undefined,
            }}
          >
            {ch}
          </span>
        ))}
      </>
    );

  const letterAcc = (l: string) => {
    const st = stats?.letters[l];
    if (!st || st.attempts === 0) return null;
    return { acc: st.hits / st.attempts, n: st.attempts };
  };

  return (
    <>
      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
          <h2 style={{ margin: 0 }}>Practice</h2>
          {stats && stats.streakCurrent > 0 && (
            <span className="tag ok" title="Days in a row with at least one recognized letter">
              🔥 {stats.streakCurrent}-day streak
            </span>
          )}
        </div>
        <p>
          Pick a letter or a short word, start the camera, and hold the sign steady.
          Practice uses the same recognition system as the live workspace, so results
          reflect real model behavior — including its mistakes.
        </p>
        {weak.length > 0 && (
          <div className="btn-row">
            <span className="small muted" style={{ alignSelf: "center" }}>Weakest letters:</span>
            {weak.map((l) => (
              <button
                key={l}
                className="btn"
                onClick={() => pickNew({ kind: "letter", target: l })}
                aria-label={`Drill letter ${l}`}
              >
                {l}
              </button>
            ))}
          </div>
        )}
        <div className="letter-grid" role="listbox" aria-label="Choose a letter">
          {STATIC_LETTERS.map((L) => {
            const acc = letterAcc(L);
            const state =
              acc === null ? undefined : acc.acc >= 0.8 ? "done" : acc.acc < 0.5 ? "partial" : undefined;
            return (
              <button
                key={L}
                role="option"
                aria-selected={mode.kind === "letter" && mode.target === L}
                className="letter-chip"
                data-state={mode.kind === "letter" && mode.target === L ? "partial" : state}
                onClick={() => pickNew({ kind: "letter", target: L })}
              >
                {L}
                {acc !== null && <small>{Math.round(acc.acc * 100)}%</small>}
              </button>
            );
          })}
        </div>
        <div className="btn-row" style={{ marginTop: 12 }}>
          {PRACTICE_WORDS.map((w) => (
            <button
              key={w}
              className="btn"
              aria-pressed={mode.kind === "word" && mode.target === w}
              onClick={() => pickNew({ kind: "word", target: w })}
            >
              {w}
            </button>
          ))}
        </div>
      </div>

      <div className="live-layout">
        <section>
          <div className="camera-wrap">
            <video ref={videoRef} playsInline muted autoPlay className={running ? "mirrored" : ""} />
            {running && settings.showLandmarks && (
              <LandmarkOverlay landmarks={landmarks} mirrored />
            )}
            {!running && (
              <div className="camera-overlay">
                <div className="perm-icon" aria-hidden="true">🤟</div>
                <strong>Camera is off</strong>
                <p className="small muted" style={{ margin: 0 }}>
                  Everything runs on your device.
                </p>
              </div>
            )}
          </div>
          <div className="btn-row" style={{ marginTop: 10 }}>
            {running ? (
              <button className="btn" onClick={stop}>Stop camera</button>
            ) : (
              <button className="btn primary" onClick={startCamera} disabled={!modelReady}>
                Start practicing
              </button>
            )}
          </div>
        </section>

        <section className="card" aria-live="polite">
          <h2>
            {mode.kind === "letter"
              ? `Sign the letter ${mode.target}`
              : `Spell: ${progress}`}
          </h2>
          {feedback.state === "idle" && (
            <p className="muted">Start the camera to begin.</p>
          )}
          {feedback.state === "waiting" && (
            <p className="muted">Show your hand to the camera…</p>
          )}
          {feedback.state === "seen" && (
            <>
              <p>
                Seeing: <strong style={{ fontSize: 28 }}>{feedback.letter}</strong>
              </p>
              <p className="small muted" style={{ marginTop: -4 }}>
                Model top-3:{" "}
                {feedback.top
                  .map(([l, p]) => `${l} ${Math.round(p * 100)}%`)
                  .join(" · ")}{" "}
                (uncalibrated)
              </p>
              {mode.kind === "letter" && feedback.letter !== mode.target && (
                <p className="small muted">Keep trying — hold the target shape steady.</p>
              )}
            </>
          )}
          {feedback.state === "done" && (
            <div>
              <p style={{ color: "var(--ok)", fontSize: 20, fontWeight: 700 }}>
                ✓ {mode.kind === "letter" ? mode.target : mode.target} recognized
              </p>
              <p className="small muted">
                Last confidence {Math.round(feedback.score * 100)}% (uncalibrated).
              </p>
              <div className="btn-row">
                <button className="btn primary" onClick={nextRandom}>
                  Next round
                </button>
                <button
                  className="btn"
                  onClick={() => {
                    if (mode.kind === "letter") setStats(recordRound(mode.target, false));
                    setFeedback(running ? { state: "waiting" } : { state: "idle" });
                    decoderRef.current?.reset();
                  }}
                >
                  Skip (count as miss)
                </button>
              </div>
            </div>
          )}
          {refPoses && mode.kind === "letter" && refPoses[mode.target] && (
            <div style={{ marginTop: 14 }}>
              <h3 style={{ margin: "6px 0" }}>Target shape — animated reference</h3>
              <div style={{ maxWidth: 260 }}>
                <SignAvatar
                  currentPose={feedback.state === "done" ? null : refPoses[mode.target]}
                  motion={feedback.state === "done" ? [refPoses[mode.target]] : null}
                  label={mode.target}
                  mirrored
                />
              </div>
              <p className="small muted" style={{ marginBottom: 0 }}>
                The average of many real recordings from the training dataset —
                an honest reference of how the model learned each letter, not a
                certified ASL teaching illustration.
              </p>
            </div>
          )}
          {refPoses && mode.kind === "word" && (
            <p className="small muted" style={{ marginTop: 14 }}>
              Word drill: sign each letter in sequence. Letter references appear in
              single-letter mode.
            </p>
          )}
        </section>
      </div>

      {stats && Object.keys(stats.letters).length > 0 && (
        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
            <h2 style={{ margin: 0 }}>Your stats</h2>
            <div className="btn-row" style={{ margin: 0 }}>
              <button className="btn" onClick={shareResults}>
                {copied ? "Copied ✓" : "Share"}
              </button>
              <button className="btn danger" onClick={() => setStats(resetStats())}>
                Reset stats
              </button>
            </div>
          </div>
          <p className="small muted">
            Best streak: {stats.streakBest} day{stats.streakBest === 1 ? "" : "s"}.
            Stats stay in this browser only.
          </p>
        </div>
      )}
    </>
  );
}
