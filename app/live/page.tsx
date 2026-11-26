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
import { matchStatic, matchDynamic, type SignMatch } from "@/lib/signs/custom-signs";
import { listSigns } from "@/lib/signs/custom-signs";
import { MotionLetterWatcher } from "@/lib/signs/motion-letters";
import { recognitionLandmarks } from "@/lib/features";
import type { Landmark } from "@/lib/types";
import { MotionConfig, motion } from "@/components/motion-kit";

export default function LivePage() {
  const [settings, updateSettings] = useSettings();
  const [transcript, setTranscript] = useState<Transcript>(() => createTranscript());
  const [decoderState, setDecoderState] = useState({
    tentative: null as string | null,
    tentativeConfidence: 0,
    tracking: "searching" as "searching" | "tracking" | "lost",
  });
  const landmarksRef = useRef<Landmark[] | null>(null);
  const [modelReady, setModelReady] = useState(false);
  const [modelError, setModelError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  const editingRef = useRef(false);
  const [notice, setNotice] = useState("");
  const [facing, setFacing] = useState<"user" | "environment">("user");
  const [ttsSupported, setTtsSupported] = useState(false);
  const [signMatch, setSignMatch] = useState<SignMatch | null>(null);
  const [motionMessage, setMotionMessage] = useState("");
  const [wordMode, setWordMode] = useState(false);
  const [motionLetter, setMotionLetter] = useState<"J" | "Z" | null>(null);
  const staticMatchRef = useRef<{ label: string; since: number } | null>(null);
  const motionHandRef = useRef<"Left" | "Right" | null>(null);
  const motionInterruptedRef = useRef(false);
  const [recordingMotion, setRecordingMotion] = useState(false);
  const recordingMotionRef = useRef(false);
  const motionBufRef = useRef<Landmark[][]>([]);
  const [hasSigns, setHasSigns] = useState(false);
  const lastUiFrameAtRef = useRef(0);
  const motionWatcherRef = useRef<MotionLetterWatcher>(new MotionLetterWatcher());

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
    const id = setTimeout(() => setHasSigns(listSigns().some((sign) => sign.kind === "dynamic" && !sign.needsRecording)), 0);
    return () => clearTimeout(id);
  }, []);

  // decoder (re)creation when settings change
  useEffect(() => {
    decoderRef.current = new TemporalDecoder({
      stabilityFrames: settings.stabilityFrames,
      minConfidence: settings.minConfidence,
      autoCommit: settings.autoCommit,
    });
    motionWatcherRef.current.reset();
  }, [settings.stabilityFrames, settings.minConfidence, settings.autoCommit]);

  const apply = useCallback((action: TranscriptAction) => {
    setTranscript((t) => t.apply(action));
  }, []);

  const onFrame = useCallback(
    (frame: import("@/lib/types").HandFrame | null) => {
      landmarksRef.current = frame?.landmarks ?? null;
      const d = decoderRef.current;
      if (!d || !modelReady || editingRef.current) return;
      const lmRec = frame ? recognitionLandmarks(frame) : null;
      if (recordingMotionRef.current) {
        if (!frame || (motionHandRef.current && motionHandRef.current !== frame.handedness)) {
          if (motionBufRef.current.length) motionInterruptedRef.current = true;
          return;
        }
        motionHandRef.current = frame.handedness;
        if (motionBufRef.current.length < 600) motionBufRef.current.push(lmRec!);
        else motionInterruptedRef.current = true;
        return;
      }
      if (wordMode) {
        if (!frame || !lmRec) {
          staticMatchRef.current = null;
          setSignMatch((match) => match?.kind === "dynamic" ? match : null);
          return;
        }
        if (frameCountRef.current++ % 3 !== 0) return;
        const match = matchStatic(lmRec);
        const previous = staticMatchRef.current;
        if (!match || previous?.label !== match.label) {
          staticMatchRef.current = match ? { label: match.label, since: frame.timestampMs } : null;
          setSignMatch((current) => current?.kind === "dynamic" ? current : null);
        } else if (frame.timestampMs - previous.since >= 250) {
          setSignMatch((current) => current?.kind === "dynamic" || current?.label === match.label ? current : match);
        }
        return;
      }
      // movement letters first: a finished J/Z trace commits directly (like
      // the manual J/Z buttons) and resets the decoder so the post-trace pose
      // cannot also fire a stale letter
      if (lmRec && frame) {
        const ml = motionWatcherRef.current.feed(lmRec, frame.timestampMs);
        if (ml) {
          if (settings.autoCommit) apply({ type: "letter", letter: ml });
          else setMotionLetter(ml);
          d.reset();
          top3Ref.current = [];
          setTop3([]);
          setDecoderState({ tentative: null, tentativeConfidence: 0, tracking: "tracking" });
          return;
        }
      } else {
        motionWatcherRef.current.lost();
      }
      if (motionLetter) return;
      if (!frame) setTop3((current) => current.length ? [] : current);
      const pred = lmRec ? predictLandmarks(lmRec) : null;
      const state = d.push(pred, frame?.timestampMs ?? performance.now());
      if (pred) {
        top3Ref.current = Object.entries(pred.probabilities)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .map(([l, p]) => [l, p] as [string, number]);
      } else {
        top3Ref.current = [];
      }

      // auto-commit pending letters
      const pending = d.drainPending();
      if (pending.length) {
        setTranscript((t) =>
          pending.reduce((acc, ch) => acc.apply({ type: "letter", letter: ch }), t)
        );
      }
      // Keep landmark inference at camera cadence, but render the React UI at
      // 10 fps. The old per-camera-frame state updates forced the whole live
      // workspace to reconcile 30 times a second on mobile.
      const now = performance.now();
      if (now - lastUiFrameAtRef.current >= 100) {
        lastUiFrameAtRef.current = now;
        setDecoderState((prev) => {
          if (
            prev.tentative === state.tentative &&
            prev.tentativeConfidence === state.tentativeConfidence &&
            prev.tracking === state.tracking
          ) return prev;
          return {
            tentative: state.tentative,
            tentativeConfidence: state.tentativeConfidence,
            tracking: state.tracking,
          };
        });
        setTop3([...top3Ref.current]);
      }
    },
    [modelReady, apply, settings.autoCommit, wordMode, motionLetter]
  );

  const { videoRef, status, error, start, stop: stopTracking, fps } = useHandTracking({
    onFrame,
    dominantHand: settings.dominantHand,
  });

  const stop = () => {
    stopTracking();
    decoderRef.current?.reset();
    motionWatcherRef.current.reset();
    landmarksRef.current = null;
    setDecoderState({ tentative: null, tentativeConfidence: 0, tracking: "searching" });
    setTop3([]);
    setSignMatch(null);
    recordingMotionRef.current = false;
    motionBufRef.current = [];
    setRecordingMotion(false);
    setMotionLetter(null);
    setMotionMessage("");
    staticMatchRef.current = null;
  };

  const commitSign = () => {
    if (signMatch && !editing && running) {
      setTranscript((current) => current.apply({ type: "manual", text: (current.text + " " + signMatch.label).trim() + " " }));
      decoderRef.current?.reset();
      setSignMatch(null);
    }
  };

  const startMotionRecording = () => {
    setMotionMessage("");
    staticMatchRef.current = null;
    motionHandRef.current = null;
    motionInterruptedRef.current = false;
    motionBufRef.current = [];
    recordingMotionRef.current = true;
    setRecordingMotion(true);
    decoderRef.current?.reset();
    setDecoderState((state) => ({ ...state, tentative: null, tentativeConfidence: 0 }));
    setTop3([]);
    setSignMatch(null);
  };
  const stopMotionRecording = () => {
    recordingMotionRef.current = false;
    setRecordingMotion(false);
    const interrupted = motionInterruptedRef.current;
    const match = interrupted ? null : matchDynamic(motionBufRef.current);
    setSignMatch(match);
    setMotionMessage(interrupted ? "Keep the same hand in view throughout the recording." :
      match ? "" : "No clear motion match. Try again or record a sample in Teach.");
    motionBufRef.current = [];
  };

  const frameCountRef = useRef(0);

  const changeRecognitionMode = (words: boolean) => {
    setWordMode(words);
    decoderRef.current?.reset();
    motionWatcherRef.current.reset();
    staticMatchRef.current = null;
    recordingMotionRef.current = false;
    motionBufRef.current = [];
    setRecordingMotion(false);
    setMotionMessage("");
    setMotionLetter(null);
    setSignMatch(null);
    setTop3([]);
    setDecoderState({ tentative: null, tentativeConfidence: 0, tracking: "searching" });
  };

  const commitTentative = useCallback(() => {
    if (wordMode || editingRef.current) return;
    const letter = motionLetter ?? decoderRef.current?.commitLetter();
    if (letter) {
      apply({ type: "letter", letter, source: "manual" });
      setMotionLetter(null);
    }
  }, [apply, motionLetter, wordMode]);

  // keyboard shortcuts (desktop): Enter=commit, Space=space, Backspace=delete,
  // Ctrl/Cmd+Z=undo
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target instanceof Element ? e.target : null;
      if (editing || e.repeat || target?.closest("input, textarea, select, button, a, [contenteditable='true']")) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() !== "z") return;
      if (e.altKey || e.shiftKey) return;
      if (e.key === "Enter") {
        e.preventDefault();
        commitTentative();
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
  }, [apply, editing, commitTentative]);

  const copyText = async () => {
    try {
      await navigator.clipboard.writeText(transcript.text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setNotice("Copy was blocked. Use Edit text to select and copy your words.");
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
  const busy = status === "requesting" || status === "model-loading";
  const wordCount = transcript.text.trim() ? transcript.text.trim().split(/\s+/).length : 0;
  const readyLetter = motionLetter ?? decoderState.tentative;
  const statusLabel =
    status === "idle" ? "Camera off"
    : status === "requesting" ? "Requesting camera…"
    : status === "denied" ? "Camera permission denied"
    : status === "model-loading" ? "Loading hand tracking…"
    : status === "error" ? "Camera needs attention"
    : wordMode ? "Looking for taught signs"
    : decoderState.tracking === "tracking" ? "Hand detected"
    : decoderState.tracking === "searching" ? "Looking for a hand…"
    : "Tracking lost — show your hand";

  return (
    <MotionConfig reducedMotion="user">
      {/* Camera view is latency-critical: the video element and detection
          overlays are never animated. The whole workspace gets a single
          opacity-only fade on mount — no transforms here. */}
      <motion.div
        className="live-workspace"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.35, ease: "easeOut" }}
      >
      <header className="workspace-heading">
        <div>
          <h1>Live recognition</h1>
          <p>Read fingerspelled letters or match a sign you recorded.</p>
        </div>
        <span className={`privacy-pill ${running ? "is-live" : ""}`}>
          <span /> {running ? "Camera stays on this device" : "Private, on-device recognition"}
        </span>
      </header>
      <div className="studio-toolbar">
        <div className="studio-mode" role="group" aria-label="Recognition mode">
          <button aria-pressed={!wordMode} onClick={() => changeRecognitionMode(false)}>Fingerspelling</button>
          <button aria-pressed={wordMode} onClick={() => changeRecognitionMode(true)}>Word signs</button>
        </div>
        {!wordMode && <div className="studio-mode" role="group" aria-label="Letter entry mode">
          <button aria-pressed={settings.autoCommit} onClick={() => updateSettings({ autoCommit: true })}>Automatic</button>
          <button aria-pressed={!settings.autoCommit} onClick={() => updateSettings({ autoCommit: false })}>Review first</button>
        </div>}
        <a className="studio-settings" href="/settings">Tune recognition ↗</a>
      </div>
      <div className="live-layout">
      {/* left: camera + status */}
      <section className="camera-column" aria-label="Camera">
        <div className={`camera-wrap studio-camera ${running ? "is-running" : ""}`}>
          <div className="camera-label"><span className={running ? "live-dot" : ""} />{running ? "LIVE CAMERA" : "CAMERA PREVIEW"}</div>
          {running && <div className="camera-coach">{recordingMotion ? "Keep the same hand in view, then stop to review" : editing ? "Recognition paused while you edit" : wordMode ? "Keep your signing hand in view" : decoderState.tracking === "tracking" ? "Hand in view" : "Bring your signing hand into the frame"}</div>}
          {!running && <div className="camera-reticle" aria-hidden="true" /> }
          <video
            ref={videoRef}
            playsInline
            muted
            autoPlay
            className={running && facing === "user" && settings.mirrorPreview ? "mirrored" : ""}
          />
          {running && settings.showLandmarks && (
            <LandmarkOverlay
              landmarks={null}
              landmarksRef={landmarksRef}
              mirrored={facing === "user" && settings.mirrorPreview}
            />
          )}
          {!running && (
            <div className="camera-overlay" role="status">
              {status === "denied" ? (
                <>
                  <div className="perm-icon" aria-hidden="true">×</div>
                  <strong>Camera access denied</strong>
                  <p className="small muted" style={{ margin: 0 }}>
                    Allow camera access in your browser settings, then try again.
                    SignFlow never uploads video — processing happens on this device.
                  </p>
                </>
              ) : busy ? (
                <>
                  <div className="camera-spinner" aria-hidden="true" />
                  <strong>{status === "requesting" ? "Waiting for camera access…" : "Preparing your studio…"}</strong>
                  <p className="small muted" style={{ margin: 0 }}>
                    First load downloads the hand tracker (a few MB), then it&apos;s cached.
                  </p>
                </>
              ) : status === "error" ? (
                <>
                  <div className="perm-icon" aria-hidden="true">!</div>
                  <strong>Camera error</strong>
                  <p className="small muted" style={{ margin: 0 }}>{error}</p>
                </>
              ) : (
                <>
                  <svg className="studio-camera-icon" viewBox="0 0 48 48" fill="none" aria-hidden="true"><rect x="5" y="13" width="38" height="28" rx="7"/><path d="m15 13 3-6h12l3 6"/><circle cx="24" cy="27" r="8"/><path d="M36 20h1"/></svg>
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
              disabled={!modelReady || busy}
            >
              {busy ? "Connecting…" : "Start signing"}
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

        <details className="studio-help"><summary>Quick signing tips</summary>
        <div className="studio-guide">
          <div><strong>Frame your hand</strong><p>Keep your wrist and fingertips in view, with light in front of you.</p></div>
          <div><strong>Find your rhythm</strong><p>Hold a letter briefly. Relax your hand between repeated letters.</p></div>
          <div><strong>Make it yours</strong><p>Add spaces, choose a suggestion, or edit your message anytime.</p></div>
        </div>
        <div className="studio-tip"><span aria-hidden="true">✦</span><p>New to fingerspelling? <a href="/practice">Warm up in Practice ↗</a></p></div>
        </details>
        {modelError && (
          <div className="card" role="alert">
            <strong>Recognition model failed to load.</strong>
            <p className="small muted">{modelError}</p>
            <button className="btn" onClick={() => location.reload()}>Retry</button>
          </div>
        )}
      </section>

      {/* right: recognition + text */}
      <section className="studio-output" aria-label="Text">
        {!wordMode && <div className="card">
          <div className="panel-heading"><h2>Recognition</h2><span className="panel-tag">{settings.autoCommit ? "AUTO ADD" : "MANUAL ADD"}</span></div>
          <div className="tentative-letter">
            {readyLetter ? (
              <>
                <span aria-label={`Tentative letter ${readyLetter}`}>
                  {readyLetter}
                </span>
                <span className="conf">
                  Letter ready
                  <br />
                  <span className="small muted">{settings.autoCommit ? "Hold briefly to add" : "Confirm the letter before adding it"}</span>
                </span>
              </>
            ) : (
              <span className="muted" style={{ fontSize: 20 }}>
                {running && modelReady ? "Hold a handshape steady…" : "Start the camera to sign"}
              </span>
            )}
          </div>
          {decoderState.tentative && (
            <div className="signal-meter-wrap">
              <div className="signal-meter-label">
                <span>Model score</span>
                <span>{Math.round(decoderState.tentativeConfidence * 100)}%</span>
              </div>
              <div
                className="signal-meter"
                role="progressbar"
                aria-label="Relative model score, not calibrated accuracy"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(decoderState.tentativeConfidence * 100)}
              >
                <span style={{ width: `${decoderState.tentativeConfidence * 100}%` }} />
              </div>
            </div>
          )}
          <button
            className="btn primary"
            style={{ width: "100%" }}
            onClick={commitTentative}
            disabled={!running || !readyLetter || editing}
          >
            Add letter
          </button>
          {!editing && !motionLetter && top3.length > 1 && (
            <div className="btn-row" style={{ marginTop: 6 }}>
              <span className="small muted" style={{ alignSelf: "center" }}>
                Also seeing:
              </span>
              {top3.slice(1).map(([l, p]) => (
                <button
                  key={l}
                  className="btn"
                  style={{ minHeight: 40, padding: "6px 12px" }}
                  onClick={() => { decoderRef.current?.commitLetter(); apply({ type: "letter", letter: l, source: "manual" }); }}
                  aria-label={`Insert letter ${l}`}
                >
                  {l} <span className="small muted">{Math.round(p * 100)}%</span>
                </button>
              ))}
            </div>
          )}
          <p className="small muted" style={{ marginTop: 8 }}>
            {settings.autoCommit ? "A steady hold adds a letter automatically." : "Press Add letter or Enter when the shape is ready."}
            {" "}For a double letter, relax your hand briefly and sign it again.
          </p>
        </div>}

        {wordMode && (
          <div className="card word-signs">
            <h2>Sign match</h2>
            {recordingMotion ? (
              <>
                <p style={{ color: "var(--warn)" }}>● Recording motion…</p>
                <button className="btn primary" style={{ width: "100%" }} onClick={stopMotionRecording}>
                  Stop &amp; match
                </button>
              </>
            ) : signMatch ? (
              <>
                <p style={{ margin: 0 }}>
                  <strong style={{ fontSize: 24 }}>{signMatch.label}</strong>
                  <span className="small muted"> · {signMatch.builtin ? "Built-in handshape" : "Your recording"}</span>
                </p>
                <button className="btn primary" style={{ width: "100%", marginTop: 8 }} onClick={commitSign} disabled={editing || !running}>
                  Commit &ldquo;{signMatch.label}&rdquo;
                </button>
              </>
            ) : (
              <p className="small muted" style={{ margin: 0 }}>
                {motionMessage || (running ? "Hold a taught handshape or record a motion to look for a match." : "Start the camera to look for a sign.")}
              </p>
            )}
            <div className="btn-row" style={{ marginTop: 10 }}>
              <button className="btn" onClick={startMotionRecording} disabled={!running || recordingMotion || editing || !hasSigns}>
                Record motion sign
              </button>
            </div>
            <p className="small muted" style={{ marginBottom: 0 }}>
              Teach your own in <a href="/teach">Teach</a>.
            </p>
          </div>
        )}
        <div className="card">
          <div className="panel-heading"><h2>Your message</h2><span className="panel-tag">{wordCount} {wordCount === 1 ? "WORD" : "WORDS"}</span></div>
          <div className="message-actions"><button className="btn" disabled={editing || recordingMotion} onClick={() => {
            editingRef.current = true;
            decoderRef.current?.reset();
            motionWatcherRef.current.reset();
            setMotionLetter(null);
            staticMatchRef.current = null;
            setSignMatch(null);
            setTop3([]);
            setDecoderState({ tentative: null, tentativeConfidence: 0, tracking: "searching" });
            setEditing(true);
          }}>Edit text</button><span className="small muted">{editing ? "Recognition is paused" : "Built one letter at a time"}</span></div>
          <div className="transcript-box" aria-live="polite">
            {editing ? (
              <textarea
                autoFocus
                defaultValue={transcript.text}
                onBlur={(e) => {
                  apply({ type: "manual", text: e.target.value });
                  decoderRef.current?.reset();
                  editingRef.current = false;
                  setEditing(false);
                }}
                maxLength={2000}
                aria-label="Edit transcript"
              />
            ) : (
              <span
                onClick={() => { editingRef.current = true; decoderRef.current?.reset(); setEditing(true); }}
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
                    Your next conversation starts here. Sign a letter or choose Edit text.
                  </span>
                )}
              </span>
            )}
          </div>

          <div className="control-grid" style={{ marginTop: 10 }}>
            <button className="btn" onClick={() => apply({ type: "space" })}>Space</button>
            <button className="btn" onClick={() => apply({ type: "delete" })} disabled={!transcript.text}>Delete</button>
            <button className="btn" onClick={() => apply({ type: "undo" })} disabled={!transcript.canUndo}>Undo</button>
            <button className="btn" onClick={() => apply({ type: "letter", letter: "J" })}>J</button>
            <button className="btn" onClick={() => apply({ type: "letter", letter: "Z" })}>Z</button>
            <button className="btn danger" onClick={() => apply({ type: "clear" })} disabled={!transcript.text}>Clear</button>
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
                onClick={() => {
                  try { addTranscript(transcript.text); setNotice("Message saved on this device."); }
                  catch { setNotice("This browser could not save the message. You can still copy it."); }
                }}
                disabled={!transcript.text}
              >
                Save
              </button>
            )}
          </div>
        </div>

        <div className="card">
          <div className="panel-heading"><h2>Finish your word</h2><span className="panel-tag">OPTIONAL</span></div>
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
      {notice && <p className="studio-notice" role="status">{notice}</p>}
      </motion.div>
    </MotionConfig>
  );
}
