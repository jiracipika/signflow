"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useHandTracking } from "@/lib/camera";
import { loadModel, predictLandmarks } from "@/lib/model";
import { TemporalDecoder } from "@/lib/decoder";
import { useSettings } from "@/lib/settings";
import type { Landmark } from "@/lib/types";
import LandmarkOverlay from "@/components/LandmarkOverlay";

const STATIC_LETTERS = "ABCDEFGHIKLMNOPQRSTUVWXY".split("");
const PRACTICE_WORDS = ["HI", "OK", "CAT", "DOG", "YOU", "EAT", "BYE"];

type Mode = { kind: "letter"; target: string } | { kind: "word"; target: string };

type Feedback =
  | { state: "idle" }
  | { state: "waiting" }
  | { state: "seen"; letter: string; confidence: number }
  | { state: "match"; letter: string; confidence: number }
  | { state: "done"; score: number };

export default function PracticePage() {
  const [settings] = useSettings();
  const [mode, setMode] = useState<Mode>({ kind: "letter", target: "A" });
  const [feedback, setFeedback] = useState<Feedback>({ state: "idle" });
  const [modelReady, setModelReady] = useState(false);
  const [landmarks, setLandmarks] = useState<Landmark[] | null>(null);

  const decoderRef = useRef<TemporalDecoder | null>(null);
  const holdRef = useRef(0);
  const [wordIdx, setWordIdx] = useState(0);
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
      setFeedback({ state: "seen", letter: pred.letter, confidence: pred.confidence });

      const want = mode.kind === "letter" ? mode.target : mode.target[wordIdxRef.current];
      if (state.tentative === want) {
        holdRef.current++;
        if (holdRef.current >= 8) {
          holdRef.current = 0;
          if (mode.kind === "letter") {
            setFeedback({ state: "done", score: pred.confidence });
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

  return (
    <>
      <div className="card">
        <h2>Practice</h2>
        <p>
          Pick a letter or a short word, start the camera, and hold the sign steady.
          Practice uses the same recognition system as the live workspace, so results
          reflect real model behavior — including its mistakes. Treat a green match as
          a good sign, not a guarantee.
        </p>
        <div className="letter-grid" role="listbox" aria-label="Choose a letter">
          {STATIC_LETTERS.map((L) => (
            <button
              key={L}
              role="option"
              aria-selected={mode.kind === "letter" && mode.target === L}
              className="letter-chip"
              data-state={
                mode.kind === "letter" && mode.target === L ? "partial" : undefined
              }
              onClick={() => pickNew({ kind: "letter", target: L })}
            >
              {L}
            </button>
          ))}
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
                Seeing: <strong style={{ fontSize: 28 }}>{feedback.letter}</strong>{" "}
                <span className="small muted">
                  ({Math.round(feedback.confidence * 100)}% — uncalibrated)
                </span>
              </p>
              {mode.kind === "letter" && feedback.letter !== mode.target && (
                <p className="small muted">Keep trying — hold the target shape steady.</p>
              )}
            </>
          )}
          {feedback.state === "match" && (
            <p style={{ color: "var(--ok)" }}>Match! Hold it…</p>
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
                {STATIC_LETTERS.length > 0 && (
                  <button
                    className="btn primary"
                    onClick={() => {
                      const pool =
                        mode.kind === "letter"
                          ? STATIC_LETTERS.filter((l) => l !== mode.target)
                          : PRACTICE_WORDS.filter((w) => w !== mode.target);
                      const next = pool[Math.floor(Math.random() * pool.length)];
                      pickNew(
                        mode.kind === "letter"
                          ? { kind: "letter", target: next }
                          : { kind: "word", target: next }
                      );
                    }}
                  >
                    Next round
                  </button>
                )}
              </div>
            </div>
          )}
          <p className="small muted" style={{ marginTop: 14 }}>
            Note: we deliberately include no sign illustrations. Teaching images
            require verified ASL accuracy and usage rights we haven&apos;t secured —
            descriptions here are text-only and feedback comes from your own camera.
          </p>
        </section>
      </div>
    </>
  );
}
