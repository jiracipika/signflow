"use client";

import { useEffect, useState } from "react";
import {
  useSettings,
  loadTranscripts,
  deleteTranscript,
  deleteAllTranscripts,
  type SavedTranscript,
} from "@/lib/settings";

export default function SettingsPage() {
  const [settings, update] = useSettings();
  const [transcripts, setTranscripts] = useState<SavedTranscript[]>([]);
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadTranscriptsSafe();
    function loadTranscriptsSafe() {
      if (cancelled) return;
      setTranscripts(loadTranscripts());
    }
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
      <div className="card">
        <h2>Recognition</h2>

        <div className="setting-row">
          <div>
            <strong>Dominant hand</strong>
            <div className="desc">Which hand you sign with</div>
          </div>
          <select
            value={settings.dominantHand}
            onChange={(e) =>
              update({ dominantHand: e.target.value as "right" | "left" })
            }
            aria-label="Dominant hand"
          >
            <option value="right">Right</option>
            <option value="left">Left</option>
          </select>
        </div>

        <div className="setting-row">
          <div>
            <strong>Stability</strong>
            <div className="desc">
              Frames a letter must stay steady before it becomes tentative
              (higher = steadier but slower)
            </div>
          </div>
          <input
            type="range"
            min={3}
            max={12}
            value={settings.stabilityFrames}
            onChange={(e) => update({ stabilityFrames: Number(e.target.value) })}
            aria-label="Stability frames"
          />
          <span style={{ minWidth: 28, textAlign: "right" }}>
            {settings.stabilityFrames}
          </span>
        </div>

        <div className="setting-row">
          <div>
            <strong>Minimum confidence</strong>
            <div className="desc">
              Predictions below this are ignored. Note: model confidence is not
              calibrated accuracy.
            </div>
          </div>
          <input
            type="range"
            min={30}
            max={80}
            value={Math.round(settings.minConfidence * 100)}
            onChange={(e) => update({ minConfidence: Number(e.target.value) / 100 })}
            aria-label="Minimum confidence percent"
          />
          <span style={{ minWidth: 28, textAlign: "right" }}>
            {Math.round(settings.minConfidence * 100)}%
          </span>
        </div>

        <div className="setting-row">
          <div>
            <strong>Automatic commit</strong>
            <div className="desc">
              Commit a letter automatically after holding it still. Off by default —
              manual commit is more reliable.
            </div>
          </div>
          <label className="switch">
            <input
              type="checkbox"
              checked={settings.autoCommit}
              onChange={(e) => update({ autoCommit: e.target.checked })}
              aria-label="Automatic commit"
            />
            <span className="track" />
          </label>
        </div>
      </div>

      <div className="card">
        <h2>Display</h2>
        <div className="setting-row">
          <div>
            <strong>Mirror preview</strong>
            <div className="desc">Show the camera like a mirror (recommended)</div>
          </div>
          <label className="switch">
            <input
              type="checkbox"
              checked={settings.mirrorPreview}
              onChange={(e) => update({ mirrorPreview: e.target.checked })}
              aria-label="Mirror preview"
            />
            <span className="track" />
          </label>
        </div>
        <div className="setting-row">
          <div>
            <strong>Hand skeleton overlay</strong>
            <div className="desc">Draw the tracked landmarks on the video</div>
          </div>
          <label className="switch">
            <input
              type="checkbox"
              checked={settings.showLandmarks}
              onChange={(e) => update({ showLandmarks: e.target.checked })}
              aria-label="Show landmarks"
            />
            <span className="track" />
          </label>
        </div>
      </div>

      <div className="card">
        <h2>Transcripts</h2>
        <div className="setting-row">
          <div>
            <strong>Allow saving transcripts</strong>
            <div className="desc">
              Show a Save button in the live workspace. Saved transcripts stay in
              this browser only.
            </div>
          </div>
          <label className="switch">
            <input
              type="checkbox"
              checked={settings.saveTranscripts}
              onChange={(e) => update({ saveTranscripts: e.target.checked })}
              aria-label="Allow saving transcripts"
            />
            <span className="track" />
          </label>
        </div>

        {transcripts.length > 0 && (
          <div>
            <h3>Saved transcripts ({transcripts.length})</h3>
            {transcripts.map((t) => (
              <div
                key={t.id}
                className="setting-row"
                style={{ alignItems: "flex-start" }}
              >
                <div style={{ overflowWrap: "anywhere" }}>
                  {t.text || <span className="muted">(empty)</span>}
                  <div className="desc">
                    {new Date(t.savedAt).toLocaleString()}
                  </div>
                </div>
                <button
                  className="btn danger"
                  onClick={() => {
                    deleteTranscript(t.id);
                    setTranscripts(loadTranscripts());
                  }}
                >
                  Delete
                </button>
              </div>
            ))}
            <div className="btn-row">
              <button
                className="btn danger"
                onClick={() => {
                  if (confirmDeleteAll) {
                    deleteAllTranscripts();
                    setTranscripts([]);
                    setConfirmDeleteAll(false);
                  } else {
                    setConfirmDeleteAll(true);
                  }
                }}
              >
                {confirmDeleteAll ? "Really delete ALL transcripts?" : "Delete all"}
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="card">
        <h2>Supported letters &amp; limitations</h2>
        <p>
          <strong>Supported (static):</strong> A B C D E F G H I K L M N O P Q R S T U
          V W X Y — 24 letters.
        </p>
        <p>
          <strong>Not recognized:</strong> J and Z (they are motion-based and this
          release has no temporal letter model — use the J/Z buttons or keyboard),
          numbers, and any non-alphabet handshape.
        </p>
        <p>
          The model was trained on one contributor&apos;s hand shapes. People with
          different hand proportions may see lower accuracy. Common confusions
          observed in evaluation: M↔N/T, I↔Y, and occasionally A↔S.
        </p>
      </div>

      <div className="card">
        <h2>Camera troubleshooting</h2>
        <p>
          <strong>Camera blocked?</strong> Camera access requires HTTPS (or
          localhost). Check your browser&apos;s site permissions — in iOS Safari:
          Settings → Safari → Camera; in Chrome: the camera icon in the address bar.
        </p>
        <p>
          <strong>Tracking lost?</strong> Improve lighting, keep your hand fully in
          frame, avoid busy backgrounds, and hold ~30–60 cm from the camera.
        </p>
        <p>
          <strong>Recognition feels wrong?</strong> Try raising Stability in
          Recognition settings, and make sure your palm faces the camera the same
          way the training data did (palm toward camera, upright).
        </p>
      </div>

      <div className="card">
        <h2>Privacy &amp; data</h2>
        <p>
          Camera frames are processed on-device and never uploaded or recorded.
          Settings and (if you opt in) transcripts are stored in this browser&apos;s
          localStorage only.
        </p>
        <div className="btn-row">
          <button
            className="btn danger"
            onClick={() => {
              localStorage.removeItem("signflow.settings.v1");
              location.reload();
            }}
          >
            Reset settings
          </button>
          <button
            className="btn danger"
            onClick={() => {
              deleteAllTranscripts();
              setTranscripts([]);
            }}
          >
            Delete saved transcripts
          </button>
        </div>
      </div>
    </>
  );
}
