"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useHandTracking } from "@/lib/camera";
import { loadModel, predictLandmarks } from "@/lib/model";
import { TemporalDecoder } from "@/lib/decoder";
import { createTranscript } from "@/lib/transcript";
import type { Transcript, TranscriptAction } from "@/lib/types";
import { buildDefaultSuggester } from "@/lib/dictionary";
import LandmarkOverlay from "@/components/LandmarkOverlay";
import { useSettings, addTranscript } from "@/lib/settings";
import { matchStatic, matchDynamic } from "@/lib/signs/custom-signs";
import { listSigns } from "@/lib/signs/custom-signs";
import type { Landmark } from "@/lib/types";

export default function LivePage() {
  const [settings] = useSettings();
  const [transcript, setTranscript] = useState<Transcript>(() => createTranscript());
  const [decoderState, setDecoderState] = useState({
    tentative: null as string | null,
    tentativeConfidence: 0,
    tracking: "searching" as "searching" | "tracking" | "lost",
  });
  const [landmarks, setLandmarks] = useState<Landmark[] | null>(null);
  const [modelReady, setModelReady] = useState(false);
  const [modelError, setModelError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  const [facing, setFacing] = useState<"user" | "environment">("user");
  const [ttsSupported, setTtsSupported] = useState(false);
  const [signMatch, setSignMatch] = useState<{ label: string; distance: number } | null>(null);
  const [recordingMotion, setRecordingMotion] = useState(false);
  const recordingMotionRef = useRef(false);
  const motionBufRef = useRef<Landmark[][]>([]);
  const [hasSigns, setHasSigns] = useState(false);

  const top3Ref = useRef<[string, number][]>([]);
  const [top3, setTop3] = useState<[string, number][]>([]);
  const decoderRef = useRef<TemporalDecoder | null>(null);
  const suggester = useMemo(() => buildDefaultSuggester(), []);
  const suggestions = useMemo(
    () => suggester.suggest(transcript.currentWord(), 3),
    [transcript, suggester]
  );

  // model load
  useEffect(() => {
    let cancelled = false;
    loadModel()
      .then((m) => {
        if (!cancelled) setModelReady(true);
        void m;
      })
      .catch((e) => {
        if (!cancelled) setModelError(e instanceof Error ? e.message : String(e));
      });
    const id = setTimeout(
      () => setTtsSupported(typeof window !== "undefined" && "speechSynthesis" in window),
      0
    );
    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, []);

  // do we have any word-signs (static or dynamic) to look for?
  useEffect(() => {
    const id = setTimeout(() => setHasSigns(listSigns().length > 0), 0);
    return () => clearTimeout(id);
  }, []);

  // decoder (re)creation when settings change
  useEffect(() => {
    decoderRef.current = new TemporalDecoder({
      stabilityFrames: settings.stabilityFrames,
      minConfidence: settings.minConfidence,
      autoCommit: settings.autoCommit,
    });
  }, [settings.stabilityFrames, settings.minConfidence, settings.autoCommit]);

  const apply = useCallback((action: TranscriptAction) => {
    setTranscript((t) => t.apply(action));
  }, []);

  const onFrame = useCallback(
    (frame: import("@/lib/types").HandFrame | null) => {
      setLandmarks(frame ? frame.landmarks : null);
      const d = decoderRef.current;
      if (!d || !modelReady) return;
      const pred = frame ? predictLandmarks(frame.landmarks) : null;
      const state = d.push(pred, frame?.timestampMs ?? performance.now());
      if (pred) {
        top3Ref.current = Object.entries(pred.probabilities)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .map(([l, p]) => [l, p] as [string, number]);
      } else {
        top3Ref.current = [];
      }

      if (frame) {
        // collect motion buffer while recording (ref, not state — avoids re-render per frame)
        if (recordingMotionRef.current) motionBufRef.current.push(frame.landmarks);
        // static word-sign check every 5th frame (cheap nearest-prototype)
        if (!recordingMotionRef.current && frameCountRef.current++ % 5 === 0) {
          const m = matchStatic(frame.landmarks);
          setSignMatch(m ? { label: m.label, distance: m.distance } : null);
        }
      }
      // auto-commit pending letters
      const pending = d.drainPending();
      if (pending.length) {
        setTranscript((t) =>
          pending.reduce((acc, ch) => acc.apply({ type: "letter", letter: ch }), t)
        );
      }
      setDecoderState((prev) => ({
        ...prev,
        tentative: state.tentative,
        tentativeConfidence: state.tentativeConfidence,
        tracking: state.tracking,
      }));
      setTop3([...top3Ref.current]);
    },
    [modelReady]
  );

  const { videoRef, status, error, start, stop, fps } = useHandTracking({ onFrame });

  const commitSign = () => {
    if (signMatch && signMatch.distance < 0.9) {
      apply({ type: "manual", text: (transcript.text + " " + signMatch.label).trim() + " " });
      decoderRef.current?.reset();
      setSignMatch(null);
    }
  };

  const startMotionRecording = () => {
    motionBufRef.current = [];
    recordingMotionRef.current = true;
    setRecordingMotion(true);
    setSignMatch(null);
  };
  const stopMotionRecording = () => {
    recordingMotionRef.current = false;
    setRecordingMotion(false);
    const m = matchDynamic(motionBufRef.current);
    if (m && m.distance < 0.16) {
      apply({ type: "manual", text: (transcript.text + " " + m.label).trim() + " " });
    } else if (m) {
      setSignMatch({ label: `no match (best ${m.label} ${m.distance.toFixed(2)})`, distance: 1 });
    }
    motionBufRef.current = [];
  };

  const frameCountRef = useRef(0);

  // keyboard shortcuts (desktop): Enter=commit, Space=space, Backspace=delete,
  // Ctrl/Cmd+Z=undo
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (editing || (e.target as HTMLElement)?.tagName === "TEXTAREA" || (e.target as HTMLElement)?.tagName === "INPUT") return;
      if (e.key === "Enter") {
        e.preventDefault();
        const d = decoderRef.current;
        const letter = d?.commitLetter();
        if (letter) apply({ type: "letter", letter, source: "manual" });
      } else if (e.key === " ") {
        e.preventDefault();
        apply({ type: "space" });
      } else if (e.key === "Backspace") {
        e.preventDefault();
        apply({ type: "delete" });
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        apply({ type: "undo" });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [apply, editing]);

  const commitTentative = () => {
    const d = decoderRef.current;
    if (!d) return;
    const letter = d.commitLetter();
    if (letter) apply({ type: "letter", letter, source: "manual" });
  };

  const copyText = async () => {
    try {
      await navigator.clipboard.writeText(transcript.text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard denied — textarea select fallback visible in edit mode
    }
  };

  const speak = () => {
    if (!("speechSynthesis" in window) || !transcript.text) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(transcript.text);
    u.rate = 0.95;
    window.speechSynthesis.speak(u);
  };

  const switchCamera = () => {
    const next = facing === "user" ? "environment" : "user";
    setFacing(next);
    stop();
    start(next);
  };

  const running = status === "running";
  const statusLabel =
    status === "idle" ? "Camera off"
    : status === "requesting" ? "Requesting camera…"
    : status === "denied" ? "Camera permission denied"
    : status === "model-loading" ? "Loading hand tracking…"
    : decoderState.tracking === "tracking" ? "Hand detected"
    : decoderState.tracking === "searching" ? "Looking for a hand…"
    : "Tracking lost — show your hand";

  return (
    <div className="live-layout">
      {/* left: camera + status */}
      <section aria-label="Camera">
        <div className="camera-wrap">
          <video
            ref={videoRef}
            playsInline
            muted
            autoPlay
            className={running && facing === "user" ? "mirrored" : ""}
          />
          {running && settings.showLandmarks && (
            <LandmarkOverlay landmarks={landmarks} mirrored={facing === "user"} />
          )}
          {!running && (
            <div className="camera-overlay" role="status">
              {status === "denied" ? (
                <>
                  <div className="perm-icon" aria-hidden="true">🚫</div>
                  <strong>Camera access denied</strong>
                  <p className="small muted" style={{ margin: 0 }}>
                    Allow camera access in your browser settings, then try again.
                    SignFlow never uploads video — processing happens on this device.
                  </p>
                </>
              ) : status === "model-loading" ? (
                <>
                  <div className="perm-icon" aria-hidden="true">⏳</div>
                  <strong>Loading on-device models…</strong>
                  <p className="small muted" style={{ margin: 0 }}>
                    First load downloads the hand tracker (a few MB), then it&apos;s cached.
                  </p>
                </>
              ) : status === "error" ? (
                <>
                  <div className="perm-icon" aria-hidden="true">⚠️</div>
                  <strong>Camera error</strong>
                  <p className="small muted" style={{ margin: 0 }}>{error}</p>
                </>
              ) : (
                <>
                  <div className="perm-icon" aria-hidden="true">🤟</div>
                  <strong>Camera is off</strong>
                  <p className="small muted" style={{ margin: 0 }}>
                    Video never leaves your device.
                  </p>
                </>
              )}
            </div>
          )}
        </div>

        <div className="btn-row" style={{ marginTop: 10 }}>
          {running ? (
            <button className="btn" onClick={stop}>Stop camera</button>
          ) : (
            <button
              className="btn primary"
              onClick={() => start(facing)}
              disabled={!modelReady}
            >
              Start camera
            </button>
          )}
          <button className="btn" onClick={switchCamera} disabled={!running}>
            {facing === "user" ? "Switch to rear" : "Switch to front"}
          </button>
        </div>

        <div className="status-line" aria-live="polite">
          <span
            className={`status-dot ${
              running
                ? decoderState.tracking === "tracking"
                  ? "tracking"
                  : decoderState.tracking === "searching"
                  ? "searching"
                  : "lost"
                : ""
            }`}
          />
          {statusLabel}
          {running && modelReady && (
            <span className="small muted" style={{ marginLeft: "auto" }}>
              ~{Math.round(fps)} fps
            </span>
          )}
        </div>

        {modelError && (
          <div className="card" role="alert">
            <strong>Recognition model failed to load.</strong>
            <p className="small muted">{modelError}</p>
            <button className="btn" onClick={() => location.reload()}>Retry</button>
          </div>
        )}
      </section>

      {/* right: recognition + text */}
      <section aria-label="Text">
        <div className="card">
          <h2 style={{ fontSize: 16 }}>Recognized letter</h2>
          <div className="tentative-letter">
            {decoderState.tentative ? (
              <>
                <span aria-label={`Tentative letter ${decoderState.tentative}`}>
                  {decoderState.tentative}
                </span>
                <span className="conf">
                  {Math.round(decoderState.tentativeConfidence * 100)}% confidence
                  <br />
                  <span className="small muted">not calibrated — press Commit to add</span>
                </span>
              </>
            ) : (
              <span className="muted" style={{ fontSize: 20 }}>
                {running && modelReady ? "Hold a handshape steady…" : "Start the camera to sign"}
              </span>
            )}
          </div>
          <button
            className="btn primary"
            style={{ width: "100%" }}
            onClick={commitTentative}
            disabled={!decoderState.tentative}
          >
            Commit letter
          </button>
          {top3.length > 0 && (
            <div className="btn-row" style={{ marginTop: 6 }}>
              <span className="small muted" style={{ alignSelf: "center" }}>
                Also seeing:
              </span>
              {top3.slice(1).map(([l, p]) => (
                <button
                  key={l}
                  className="btn"
                  style={{ minHeight: 40, padding: "6px 12px" }}
                  onClick={() => apply({ type: "letter", letter: l, source: "manual" })}
                  aria-label={`Insert letter ${l}`}
                >
                  {l} <span className="small muted">{Math.round(p * 100)}%</span>
                </button>
              ))}
            </div>
          )}
          <p className="small muted" style={{ marginTop: 8 }}>
            For a double letter (like &ldquo;LL&rdquo;), commit, lower your hand briefly,
            then sign it again. Keyboard: Enter = commit, Space, Backspace, Ctrl/Cmd+Z.
          </p>
        </div>

        {(hasSigns || recordingMotion) && (
          <div className="card">
            <h2 style={{ fontSize: 16 }}>Word signs</h2>
            {recordingMotion ? (
              <>
                <p style={{ color: "var(--warn)" }}>● Recording motion…</p>
                <button className="btn primary" style={{ width: "100%" }} onClick={stopMotionRecording}>
                  Stop &amp; match
                </button>
              </>
            ) : signMatch && signMatch.distance < 0.9 ? (
              <>
                <p style={{ margin: 0 }}>
                  <strong style={{ fontSize: 24 }}>{signMatch.label}</strong>
                  <span className="small muted"> · match {signMatch.distance.toFixed(2)} (lower = better, uncalibrated)</span>
                </p>
                <button className="btn primary" style={{ width: "100%", marginTop: 8 }} onClick={commitSign}>
                  Commit &ldquo;{signMatch.label}&rdquo;
                </button>
              </>
            ) : (
              <p className="small muted" style={{ margin: 0 }}>
                No word sign detected. Hold an I LOVE YOU shape, or record a motion.
              </p>
            )}
            <div className="btn-row" style={{ marginTop: 10 }}>
              <button className="btn" onClick={startMotionRecording} disabled={!running || recordingMotion}>
                Record motion sign
              </button>
            </div>
            <p className="small muted" style={{ marginBottom: 0 }}>
              Teach your own in <a href="/teach">Teach</a>.
            </p>
          </div>
        )}

        <div className="card">
          <h2 style={{ fontSize: 16 }}>Text</h2>
          <div className="transcript-box" aria-live="polite">
            {editing ? (
              <textarea
                autoFocus
                defaultValue={transcript.text}
                onBlur={(e) => {
                  setEditing(false);
                  apply({ type: "manual", text: e.target.value });
                }}
                aria-label="Edit transcript"
              />
            ) : (
              <span
                onClick={() => setEditing(true)}
                style={{ cursor: "text" }}
                title="Tap to edit"
              >
                {transcript.text ? (
                  <>
                    {transcript.text.slice(0, transcript.text.lastIndexOf(" ") + 1)}
                    <span className="current-word">{transcript.currentWord()}</span>
                  </>
                ) : (
                  <span className="muted" style={{ fontSize: 16 }}>
                    Committed letters appear here. Tap to edit manually.
                  </span>
                )}
              </span>
            )}
          </div>

          <div className="control-grid" style={{ marginTop: 10 }}>
            <button className="btn" onClick={() => apply({ type: "space" })}>Space</button>
            <button className="btn" onClick={() => apply({ type: "delete" })}>Delete</button>
            <button className="btn" onClick={() => apply({ type: "undo" })} disabled={!transcript.canUndo}>Undo</button>
            <button className="btn" onClick={() => apply({ type: "letter", letter: "J" })}>J</button>
            <button className="btn" onClick={() => apply({ type: "letter", letter: "Z" })}>Z</button>
            <button className="btn danger" onClick={() => apply({ type: "clear" })}>Clear</button>
          </div>

          <div className="btn-row" style={{ marginTop: 10 }}>
            <button className="btn" onClick={copyText} disabled={!transcript.text}>
              {copied ? "Copied ✓" : "Copy"}
            </button>
            {ttsSupported && (
              <button className="btn" onClick={speak} disabled={!transcript.text}>
                Speak
              </button>
            )}
            {settings.saveTranscripts && (
              <button
                className="btn"
                onClick={() => addTranscript(transcript.text)}
                disabled={!transcript.text}
              >
                Save
              </button>
            )}
          </div>
        </div>

        <div className="card">
          <h2 style={{ fontSize: 16 }}>Suggestions</h2>
          <div className="suggestions">
            {suggestions.length ? (
              suggestions.map((w) => (
                <button
                  key={w}
                  className="suggestion-btn"
                  onClick={() => setTranscript((t) => t.acceptSuggestion(w))}
                >
                  {w.slice(0, transcript.currentWord().length)}
                  <span className="sw">{w.slice(transcript.currentWord().length)}</span>
                </button>
              ))
            ) : (
              <span className="small muted">
                {transcript.currentWord()
                  ? "No dictionary match — your spelling is kept as-is."
                  : "Suggestions appear as you commit letters."}
              </span>
            )}
          </div>
          <p className="small muted" style={{ marginBottom: 0 }}>
            Suggestions are optional — tapping one replaces only the current word.
          </p>
        </div>
      </section>
    </div>
  );
}
