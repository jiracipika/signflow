// Fully-local backup of user-taught signs: export to a JSON file the user
// keeps, import it back (here or on another device). Custom signs live only
// in this browser's localStorage, so this is the safety net against a cleared
// browser. The backup file is plain JSON, contains only user-taught signs
// (never built-ins), and never leaves the user's hands — nothing is uploaded.

import type { SignKind } from "./custom-signs.ts";
import { loadSigns, saveCustom, builtinSigns } from "./custom-signs.ts";

/** Mirrors the StoredSign shape used for user signs in custom-signs.ts. */
export type BackupSign = {
  label: string;
  kind: SignKind;
  /** static: array of single-frame prototypes (1 frame of 63 numbers);
   *  dynamic: array of sequences, each exactly 32 frames of 63 numbers. */
  prototypes: number[][][];
};

export type SignBackup = {
  version: 1;
  kind: "signflow-backup";
  /** ISO timestamp of the export. */
  exportedAt: string;
  signs: BackupSign[];
};

export type ParseResult =
  | { ok: true; backup: SignBackup }
  | { ok: false; error: string };

export type ImportReport = {
  imported: string[];
  skippedExisting: string[];
  rejected: { label: string; reason: string }[];
};

// normalizeFrame emits 21 landmarks × x/y/z = 63 numbers per frame; dynamic
// prototypes are resampled to SEQ_LEN = 32 frames (see custom-signs.ts).
const FRAME_DIM = 63;
const SEQ_LEN = 32;
// teach mode truncates labels to 40 chars — longer ones are not app-made.
const MAX_LABEL = 40;

// ---------- export ----------

/** Serialize the user-taught signs (builtin: false) from localStorage.
 *  Built-in signs are never exported — they ship with the app. */
export function buildBackup(): SignBackup {
  const signs = loadSigns()
    .filter((s) => !s.builtin)
    .map(({ label, kind, prototypes }) => ({ label, kind, prototypes }));
  return {
    version: 1,
    kind: "signflow-backup",
    exportedAt: new Date().toISOString(),
    signs,
  };
}

/** Pretty-printed JSON of buildBackup(), for file download. */
export function backupToJson(): string {
  return JSON.stringify(buildBackup(), null, 2);
}

// ---------- validation (shared by parse and import) ----------

function signLabel(v: unknown): string {
  if (typeof v === "object" && v !== null) {
    const label = (v as { label?: unknown }).label;
    if (typeof label === "string" && label.trim().length > 0) return label;
  }
  return "(unnamed)";
}

/** Validate one backup sign; returns a human-readable reason or null. */
function validateSign(v: unknown): string | null {
  if (typeof v !== "object" || v === null || Array.isArray(v))
    return "sign must be an object";
  const s = v as { label?: unknown; kind?: unknown; prototypes?: unknown };
  if (typeof s.label !== "string" || s.label.trim().length === 0)
    return "label must be a non-empty string";
  if (s.label.length > MAX_LABEL)
    return `label longer than ${MAX_LABEL} characters`;
  if (s.kind !== "static" && s.kind !== "dynamic")
    return 'kind must be "static" or "dynamic"';
  if (!Array.isArray(s.prototypes) || s.prototypes.length === 0)
    return "prototypes must be a non-empty array";
  const frames = s.kind === "static" ? 1 : SEQ_LEN;
  for (let p = 0; p < s.prototypes.length; p++) {
    const proto = s.prototypes[p];
    if (!Array.isArray(proto) || proto.length !== frames)
      return `prototypes[${p}] must hold exactly ${frames} frame(s)`;
    for (let f = 0; f < proto.length; f++) {
      const frame = proto[f];
      if (!Array.isArray(frame) || frame.length !== FRAME_DIM)
        return `prototypes[${p}][${f}] must hold ${FRAME_DIM} numbers`;
      for (let i = 0; i < frame.length; i++)
        if (typeof frame[i] !== "number" || !Number.isFinite(frame[i]))
          return `prototypes[${p}][${f}][${i}] must be a finite number`;
    }
  }
  return null;
}

// ---------- import ----------

/** Strictly parse and validate a backup file's contents. Never throws —
 *  malformed input always yields { ok: false, error }. */
export function parseBackup(raw: string): ParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, error: "not valid JSON" };
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed))
    return { ok: false, error: "backup must be a JSON object" };
  const { kind, version, exportedAt, signs } = parsed as Record<string, unknown>;
  if (kind !== "signflow-backup")
    return { ok: false, error: `wrong kind ${JSON.stringify(kind)}` };
  if (version !== 1)
    return { ok: false, error: `unsupported version ${JSON.stringify(version)}` };
  if (typeof exportedAt !== "string" || exportedAt.length === 0)
    return { ok: false, error: "exportedAt must be a non-empty string" };
  if (!Array.isArray(signs)) return { ok: false, error: "signs must be an array" };
  for (let i = 0; i < signs.length; i++) {
    const reason = validateSign(signs[i]);
    if (reason)
      return { ok: false, error: `signs[${i}] (${signLabel(signs[i])}): ${reason}` };
  }
  // Rebuild clean objects: unknown extra fields from hand-edited files are
  // dropped, so only {label, kind, prototypes} ever reaches storage.
  const cleanSigns = (signs as BackupSign[]).map((s) => ({
    label: s.label,
    kind: s.kind,
    prototypes: s.prototypes,
  }));
  return {
    ok: true,
    backup: { version: 1, kind: "signflow-backup", exportedAt, signs: cleanSigns },
  };
}

/** Merge a (pre-parsed) backup into localStorage through the same write path
 *  teach mode uses. Never overwrites: labels already taught here win
 *  (skippedExisting), built-in signs are never touched or shadowed (labels
 *  colliding with a built-in are rejected), and duplicates inside one backup
 *  import once. Every sign is re-validated before anything is written. */
export function importBackup(backup: SignBackup): ImportReport {
  const report: ImportReport = { imported: [], skippedExisting: [], rejected: [] };
  const userSigns = loadSigns().filter((s) => !s.builtin);
  const existingKeys = new Set(userSigns.map((s) => s.label.toLowerCase()));
  const builtinKeys = new Set(builtinSigns().map((s) => s.text.toLowerCase()));
  const toAdd: ReturnType<typeof loadSigns> = [];
  for (const sign of backup.signs) {
    const reason = validateSign(sign);
    if (reason) {
      report.rejected.push({ label: signLabel(sign), reason });
      continue;
    }
    // Label identity is case-insensitive, matching teach-mode dedupe.
    const key = sign.label.toLowerCase();
    if (builtinKeys.has(key)) {
      report.rejected.push({
        label: sign.label,
        reason: "label conflicts with a built-in sign",
      });
      continue;
    }
    if (existingKeys.has(key)) {
      report.skippedExisting.push(sign.label);
      continue;
    }
    if (toAdd.some((s) => s.label.toLowerCase() === key)) {
      report.rejected.push({ label: sign.label, reason: "duplicate label in backup" });
      continue;
    }
    toAdd.push({ label: sign.label, kind: sign.kind, builtin: false, prototypes: sign.prototypes });
    report.imported.push(sign.label);
  }
  if (toAdd.length > 0) saveCustom([...userSigns, ...toAdd]);
  return report;
}
