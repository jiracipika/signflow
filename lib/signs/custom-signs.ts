// Custom + built-in sign recognition: static templates (single frame, nearest
// prototype) and dynamic templates (frame sequences, DTW). Stored in
// localStorage. Built-in templates are geometric approximations, honestly
// labeled — Teach mode recordings beat them.

import type { Landmark } from "../types.ts";
import { normalizeFrame, resampleSequence } from "./normalize.ts";
import { dtwDistance } from "./dtw.ts";

export type SignKind = "static" | "dynamic";
export type SignLabel = { text: string; kind: SignKind; builtin: boolean };

type StoredSign = {
  label: string;
  kind: SignKind;
  builtin: boolean;
  /** static: array of prototype frames (already normalized, resampled to 1);
   *  dynamic: array of prototype sequences (each resampled to 32 frames) */
  prototypes: number[][][];
};

const KEY = "signflow.signs.v1";
const SEQ_LEN = 32;

// ---------- built-in templates ----------
// Geometric approximations of well-known single-shape signs, hand-authored
// from landmark-index positions (thumb=1-4, index=5-8, middle=9-12,
// ring=13-16, pinky=17-20). Approximate — teach mode is more accurate.

type Pose = Record<number, [number, number, number]>;

function buildFrame(pose: Pose): number[] {
  const lm: Landmark[] = Array.from({ length: 21 }, () => ({ x: 0, y: 0, z: 0 }));
  for (const [idx, [x, y, z]] of Object.entries(pose))
    lm[Number(idx)] = { x, y, z };
  // normalizeFrame centers on wrist(0) and scales by wrist->middleMCP(9),
  // so only relative pose matters.
  return Array.from(normalizeFrame(lm), (v) => Number(v.toFixed(4)));
}

// I LOVE YOU: thumb, index, pinky extended; middle+ring curled to palm.
const ILY_POSE: Pose = {
  0: [0.5, 0.9, 0],
  1: [0.38, 0.8, 0],
  2: [0.3, 0.7, 0.02],
  3: [0.27, 0.62, 0.04],
  4: [0.25, 0.55, 0.05], // thumb tip extended toward side
  5: [0.42, 0.55, 0],
  6: [0.41, 0.45, 0],
  7: [0.40, 0.36, 0],
  8: [0.39, 0.27, 0], // index tip extended up
  9: [0.5, 0.55, -0.01],
  10: [0.5, 0.48, 0.03],
  11: [0.5, 0.5, 0.08],
  12: [0.5, 0.52, 0.12], // middle curled
  13: [0.58, 0.55, -0.01],
  14: [0.58, 0.48, 0.03],
  15: [0.58, 0.5, 0.08],
  16: [0.58, 0.52, 0.12], // ring curled
  17: [0.66, 0.56, 0],
  18: [0.68, 0.46, 0.01],
  19: [0.70, 0.36, 0.02],
  20: [0.72, 0.27, 0.03], // pinky extended up
};

// YES: fist shape (nodding fist — the approximation is the shape only; the
// real sign adds the nodding motion). Distinct from ILY: all fingers curled.
const YES_POSE: Pose = {
  0: [0.5, 0.9, 0],
  1: [0.44, 0.78, 0.01],
  2: [0.4, 0.68, 0.02],
  3: [0.38, 0.62, 0.03],
  4: [0.37, 0.58, 0.03], // thumb curled against the side
  5: [0.44, 0.58, 0],
  6: [0.45, 0.5, 0.04],
  7: [0.45, 0.48, 0.09],
  8: [0.44, 0.52, 0.12], // index curled to palm
  9: [0.5, 0.57, 0],
  10: [0.5, 0.49, 0.04],
  11: [0.5, 0.47, 0.09],
  12: [0.5, 0.51, 0.12], // middle curled
  13: [0.56, 0.57, 0],
  14: [0.56, 0.49, 0.04],
  15: [0.56, 0.47, 0.09],
  16: [0.56, 0.51, 0.12], // ring curled
  17: [0.62, 0.58, 0],
  18: [0.62, 0.5, 0.04],
  19: [0.62, 0.48, 0.09],
  20: [0.62, 0.52, 0.12], // pinky curled
};

// NO: index + middle extended (tapping fingers — approximation is the shape
// only; the real sign taps index+middle down toward the thumb).
const NO_POSE: Pose = {
  0: [0.5, 0.9, 0],
  1: [0.42, 0.8, 0],
  2: [0.37, 0.72, 0.01],
  3: [0.34, 0.66, 0.02],
  4: [0.32, 0.62, 0.03], // thumb across palm
  5: [0.43, 0.56, 0],
  6: [0.42, 0.46, 0],
  7: [0.41, 0.37, 0],
  8: [0.4, 0.28, 0], // index extended up
  9: [0.5, 0.56, 0],
  10: [0.49, 0.46, 0],
  11: [0.48, 0.37, 0],
  12: [0.47, 0.28, 0], // middle extended up
  13: [0.57, 0.57, -0.01],
  14: [0.57, 0.5, 0.03],
  15: [0.57, 0.52, 0.08],
  16: [0.57, 0.54, 0.12], // ring curled
  17: [0.64, 0.58, -0.01],
  18: [0.64, 0.51, 0.03],
  19: [0.64, 0.53, 0.08],
  20: [0.64, 0.55, 0.12], // pinky curled
};

const BUILTINS: StoredSign[] = [
  {
    label: "I LOVE YOU",
    kind: "static",
    builtin: true,
    prototypes: [[buildFrame(ILY_POSE)]],
  },
  {
    label: "YES",
    kind: "static",
    builtin: true,
    prototypes: [[buildFrame(YES_POSE)]],
  },
  {
    label: "NO",
    kind: "static",
    builtin: true,
    prototypes: [[buildFrame(NO_POSE)]],
  },
];

/** The built-in (non-taught) sign set — used by the library page and teach
 *  suggestions. Approximate static one-shape poses, not certified forms. */
export function builtinSigns(): SignLabel[] {
  return BUILTINS.map(({ label, kind, builtin }) => ({ text: label, kind, builtin }));
}

// ---------- storage ----------

export function loadSigns(): StoredSign[] {
  if (typeof window === "undefined") return BUILTINS;
  try {
    const raw = window.localStorage.getItem(KEY);
    const custom: StoredSign[] = raw ? JSON.parse(raw) : [];
    return [...BUILTINS, ...custom];
  } catch {
    return BUILTINS;
  }
}

export function saveCustom(signs: StoredSign[]) {
  window.localStorage.setItem(
    KEY,
    JSON.stringify(signs.filter((s) => !s.builtin))
  );
}

export function listSigns(): SignLabel[] {
  return loadSigns().map(({ label, kind, builtin }) => ({ text: label, kind, builtin }));
}

export function deleteSign(label: string) {
  saveCustom(loadSigns().filter((s) => s.label !== label));
}

// ---------- teaching ----------

export type TeachSample = { frames: Landmark[][] };

export function teachStaticSign(label: string, samples: TeachSample[]): boolean {
  const clean = label.trim().slice(0, 40);
  if (!clean || samples.length === 0) return false;
  const protos = samples
    .filter((s) => s.frames.length > 0)
    .map((s) => [Array.from(normalizeFrame(s.frames[s.frames.length - 1]))]);
  if (protos.length === 0) return false;
  const existing = loadSigns().filter(
    (s) => s.label.toLowerCase() !== clean.toLowerCase()
  );
  saveCustom([
    ...existing.filter((s) => !s.builtin),
    { label: clean, kind: "static", builtin: false, prototypes: protos },
  ]);
  return true;
}

export function teachDynamicSign(label: string, samples: TeachSample[]): boolean {
  const clean = label.trim().slice(0, 40);
  if (!clean || samples.length === 0) return false;
  const protos = samples
    .filter((s) => s.frames.length >= 4)
    .map((s) =>
      Array.from(resampleSequence(s.frames.map(normalizeFrame), SEQ_LEN), (f) =>
        Array.from(f)
      )
    );
  if (protos.length === 0) return false;
  const existing = loadSigns().filter(
    (s) => s.label.toLowerCase() !== clean.toLowerCase()
  );
  saveCustom([
    ...existing.filter((s) => !s.builtin),
    { label: clean, kind: "dynamic", builtin: false, prototypes: protos },
  ]);
  return true;
}

// ---------- recognition ----------

export type SignMatch = {
  label: string;
  kind: SignKind;
  builtin: boolean;
  /** static: nearest-prototype distance in normalized space; dynamic: DTW
   * cost. Comparable within a kind, NOT across kinds. Uncalibrated. */
  distance: number;
};

/** Match a single held frame against static sign prototypes. */
export function matchStatic(lm: Landmark[]): SignMatch | null {
  const v = normalizeFrame(lm);
  let best: SignMatch | null = null;
  for (const s of loadSigns()) {
    if (s.kind !== "static") continue;
    let bestD = Infinity;
    for (const p of s.prototypes) {
      const f = p[0];
      let d = 0;
      for (let i = 0; i < f.length; i++) d += (v[i] - f[i]) ** 2;
      d = Math.sqrt(d);
      if (d < bestD) bestD = d;
    }
    if (!best || bestD < best.distance)
      best = { label: s.label, kind: "static", builtin: s.builtin, distance: bestD };
  }
  return best;
}

/** Match a recorded motion sequence against dynamic sign prototypes. */
export function matchDynamic(frames: Landmark[][]): SignMatch | null {
  if (frames.length < 4) return null;
  const probe = resampleSequence(frames.map(normalizeFrame), SEQ_LEN);
  let best: SignMatch | null = null;
  for (const s of loadSigns()) {
    if (s.kind !== "dynamic") continue;
    let bestD = Infinity;
    for (const p of s.prototypes) {
      const proto = p.map((f) => Float64Array.from(f));
      const d = dtwDistance(probe, proto);
      if (d < bestD) bestD = d;
    }
    if (!best || bestD < best.distance)
      best = { label: s.label, kind: "dynamic", builtin: s.builtin, distance: bestD };
  }
  return best;
}
