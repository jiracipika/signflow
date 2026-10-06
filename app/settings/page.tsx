"use client";

import { useEffect, useState, type ChangeEvent } from "react";
import {
  useSettings,
  loadTranscripts,
  deleteTranscript,
  deleteAllTranscripts,
  type SavedTranscript,
} from "@/lib/settings";
import {
  buildBackup,
  backupToJson,
  parseBackup,
  importBackup,
} from "@/lib/signs/backup";

export default function SettingsPage() {
  const [settings, update] = useSettings();
  const [transcripts, setTranscripts] = useState<SavedTranscript[]>([]);
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false);
  const [taughtCount, setTaughtCount] = useState(0);
  const [importResult, setImportResult] = useState<string | null>(null);

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

  useEffect(() => {
    let cancelled = false;
    loadTaughtCountSafe();
    function loadTaughtCountSafe() {
      if (cancelled) return;
      setTaughtCount(buildBackup().signs.length);
    }
    return () => {
      cancelled = true;
    };
  }, []);

  function handleExport() {
    const blob = new Blob([backupToJson()], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `signflow-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function handleImport(e: ChangeEvent<HTMLInputElement>) {
    const input = e.currentTarget;
    const file = input.files?.[0];
    input.value = ""; // allow re-picking the same file
    if (!file) return;
    let raw: string;
    try {
      raw = await file.text();
    } catch {
      setImportResult("Could not read that file.");
      return;
    }
    const parsed = parseBackup(raw);
    if (!parsed.ok) {
      setImportResult(`Could not read backup: ${parsed.error}.`);
      return;
    }
    const report = importBackup(parsed.backup);
    const parts: string[] = [];
    if (report.imported.length > 0)
      parts.push(`Imported ${report.imported.length}: ${report.imported.join(", ")}`);
    if (report.skippedExisting.length > 0)
      parts.push(
        `Skipped ${report.skippedExisting.length} already taught here: ${report.skippedExisting.join(", ")}`
      );
    if (report.rejected.length > 0)
      parts.push(
        `Rejected ${report.rejected.length}: ${report.rejected
          .map((r) => `${r.label} (${r.reason})`)
          .join(", ")}`
      );
    setImportResult(parts.join(" · ") || "Nothing to import.");
    setTaughtCount(buildBackup().signs.length);
  }

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
              How long a handshape must stay steady before it becomes a letter.
              Higher values reduce flicker but respond more slowly.
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
              Commit a letter automatically after a short steady hold. Turn this
              off to review and commit every letter yourself.
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
        <h3>Taught signs ({taughtCount})</h3>
        <div className="setting-row">
          <div>
            <strong>Backup</strong>
            <div className="desc">
              Taught signs stay in this browser only — one cleared browser and
              they are gone. Export them to a file, and import that file here or
              on another device to restore them. Importing merges: signs you
              already taught here are kept as they are. The file stays with you;
              nothing is uploaded.
            </div>
            {importResult && (
              <div className="desc" style={{ overflowWrap: "anywhere" }}>
                {importResult}
              </div>
            )}
          </div>
          <div className="btn-row">
            <button
              className="btn"
              disabled={taughtCount === 0}
              onClick={handleExport}
            >
              Export my signs ({taughtCount})
            </button>
            <label
              className="btn"
              style={{ position: "relative", overflow: "hidden" }}
            >
              Import backup
              <input
                type="file"
                accept=".json,application/json"
                onChange={handleImport}
                aria-label="Import backup file"
                style={{
                  position: "absolute",
                  inset: 0,
                  opacity: 0,
                  cursor: "pointer",
                }}
              />
            </label>
          </div>
        </div>
        {taughtCount === 0 && (
          <div className="desc">
            Nothing to export yet — teach a sign first, then come back to back
            it up.
          </div>
        )}
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
