"use client";

// Teach mode: record custom signs (static or dynamic) with the camera.
// Samples stay in localStorage — nothing leaves the device.

import { useCallback, useEffect, useRef, useState } from "react";
import { useHandTracking } from "@/lib/camera";
import LandmarkOverlay from "@/components/LandmarkOverlay";
import {
  listSigns,
  deleteSign,
  teachStaticSign,
  teachDynamicSign,
  type TeachSample,
  type SignLabel,
} from "@/lib/signs/custom-signs";
import type { Landmark } from "@/lib/types";

const STATIC_SAMPLES = 5;
const DYNAMIC_SAMPLES = 5;
const DYNAMIC_MS = 2500;

export default function TeachPage() {
  const [signs, setSigns] = useState<SignLabel[]>([]);
  const [label, setLabel] = useState("");
  const [kind, setKind] = useState<"static" | "dynamic">("static");
  const [samples, setSamples] = useState<TeachSample[]>([]);
  const [recording, setRecording] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [landmarks, setLandmarks] = useState<Landmark[] | null>(null);

  const bufRef = useRef<Landmark[][]>([]);
  const collectingRef = useRef(false);

  useEffect(() => {
    const id = setTimeout(() => setSigns(listSigns()), 0);
    return () => clearTimeout(id);
  }, []);

  const onFrame = useCallback((frame: import("@/lib/types").HandFrame | null) => {
    if (frame) setLandmarks(frame.landmarks);
    if (frame && collectingRef.current) bufRef.current.push(frame.landmarks);
  }, []);

  const { videoRef, status, start, stop } = useHandTracking({ onFrame });
  const running = status === "running";

  const captureSample = () => {
    if (kind === "static") {
      // hold-pose capture: we grab the last frame when buffer has data
      if (!landmarks) {
        setMsg("No hand visible — hold your hand in frame first.");
        return;
      }
      setSamples((s) => [...s, { frames: [landmarks] }]);
      return;
    }
    // dynamic: record 2.5s of motion
    bufRef.current = [];
    collectingRef.current = true;
    setRecording(true);
    setMsg("Recording… make the sign now.");
    setTimeout(() => {
      collectingRef.current = false;
      setRecording(false);
      const frames = bufRef.current;
      bufRef.current = [];
      if (frames.length < 8) {
        setMsg("Too few frames captured — hold the hand in view the whole time.");
        return;
      }
      setSamples((s) => [...s, { frames }]);
      setMsg("Sample captured.");
    }, DYNAMIC_MS);
  };

  const needed = kind === "static" ? STATIC_SAMPLES : DYNAMIC_SAMPLES;

  const save = () => {
    if (!label.trim()) {
      setMsg("Give the sign a name first.");
      return;
    }
    if (samples.length < needed) {
      setMsg(`Need ${needed} samples (have ${samples.length}).`);
      return;
    }
    const ok =
      kind === "static"
        ? teachStaticSign(label, samples)
        : teachDynamicSign(label, samples);
    if (ok) {
      setSigns(listSigns());
      setSamples([]);
      setLabel("");
      setMsg(`Saved "${label.trim()}" — it now competes with letters in Sign mode.`);
    } else {
      setMsg("Save failed — check samples have hand data.");
    }
  };

  return (
    <>
      <div className="card">
        <h2>Teach a new sign</h2>
        <p>
          Record your own signs — whole words like &ldquo;THANK YOU&rdquo;, name signs,
          or dynamic gestures. Samples are matched locally against your camera and
          <strong> never leave this device</strong>. Custom signs appear as
          suggestions in the live workspace alongside letters.
        </p>

        <div className="setting-row">
          <div>
            <strong>Name</strong>
            <div className="desc">What gets inserted when recognized</div>
          </div>
          <input
            type="text"
            value={label}
            maxLength={40}
            placeholder="e.g. THANK YOU"
            onChange={(e) => setLabel(e.target.value)}
            style={{ minWidth: 180 }}
            aria-label="Sign name"
          />
        </div>

        <div className="setting-row">
          <div>
            <strong>Type</strong>
            <div className="desc">
              Static = one handshape held still. Dynamic = a motion (2.5s recording).
            </div>
          </div>
          <select
            value={kind}
            onChange={(e) => {
              setKind(e.target.value as "static" | "dynamic");
              setSamples([]);
              setMsg(null);
            }}
            aria-label="Sign type"
          >
            <option value="static">Static (one shape)</option>
            <option value="dynamic">Dynamic (motion)</option>
          </select>
        </div>
      </div>

      <div className="live-layout">
        <section>
          <div className="camera-wrap">
            <video ref={videoRef} playsInline muted autoPlay className={running ? "mirrored" : ""} />
            {running && <LandmarkOverlay landmarks={landmarks} mirrored />}
            {!running && (
              <div className="camera-overlay">
                <div className="perm-icon" aria-hidden="true">🤟</div>
                <strong>Camera is off</strong>
              </div>
            )}
          </div>
          <div className="btn-row" style={{ marginTop: 10 }}>
            {running ? (
              <button className="btn" onClick={stop}>Stop camera</button>
            ) : (
              <button className="btn primary" onClick={() => start("user")}>
                Start camera
              </button>
            )}
            <button
              className="btn"
              onClick={captureSample}
              disabled={!running || recording}
            >
              {recording ? "Recording…" : `Capture sample (${samples.length}/${needed})`}
            </button>
          </div>
        </section>

        <section className="card">
          <h2>Samples: {samples.length}/{needed}</h2>
          <p className="small muted">
            {kind === "static"
              ? "Hold the sign steady and capture the same pose a few times from slightly different angles."
              : "Each capture records 2.5 seconds — perform the full motion each time."}
          </p>
          <div className="btn-row">
            <button className="btn" onClick={() => setSamples((s) => s.slice(0, -1))} disabled={!samples.length}>
              Remove last
            </button>
            <button
              className="btn primary"
              onClick={save}
              disabled={samples.length < needed || !label.trim()}
            >
              Save sign
            </button>
          </div>
          {msg && (
            <p aria-live="polite" className="small" style={{ color: "var(--accent)" }}>
              {msg}
            </p>
          )}
        </section>
      </div>

      <div className="card">
        <h2>Known signs</h2>
        {signs.length === 0 && <p className="muted">No custom signs yet.</p>}
        {signs.map((s) => (
          <div className="setting-row" key={s.text}>
            <div>
              <strong>{s.text}</strong>{" "}
              <span className="tag">{s.kind}</span>
              {s.builtin && <span className="tag warn">approximate built-in</span>}
            </div>
            {!s.builtin && (
              <button
                className="btn danger"
                onClick={() => {
                  deleteSign(s.text);
                  setSigns(listSigns());
                }}
              >
                Delete
              </button>
            )}
          </div>
        ))}
        <p className="small muted">
          Built-in &ldquo;I LOVE YOU&rdquo; is a geometric approximation, not trained
          data — if it misfires, teach your own version and it will usually win.
        </p>
      </div>
    </>
  );
}
