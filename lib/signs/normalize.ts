// Landmark normalization + sequence resampling for custom sign templates.
// Custom signs live in a translation/scale-invariant space (center on wrist,
// scale by wrist->middle-MCP distance), separate from the letter MLP space.

import type { Landmark } from "../types";

/** Center-on-wrist, scale-by-palm-size 63-dim vector for one frame. */
export function normalizeFrame(lm: Landmark[]): Float64Array {
  const v = new Float64Array(63);
  if (lm.length < 21) return v;
  const wx = lm[0].x,
    wy = lm[0].y,
    wz = lm[0].z;
  const scale =
    Math.hypot(lm[9].x - wx, lm[9].y - wy, lm[9].z - wz) || 1;
  for (let i = 0; i < 21; i++) {
    v[i * 3] = (lm[i].x - wx) / scale;
    v[i * 3 + 1] = (lm[i].y - wy) / scale;
    v[i * 3 + 2] = (lm[i].z - wz) / scale;
  }
  return v;
}

/** Linearly resample a frame sequence to exactly n frames. */
export function resampleSequence(seq: Float64Array[], n = 32): Float64Array[] {
  if (seq.length === 0) return [];
  if (seq.length === 1) return Array.from({ length: n }, () => seq[0]);
  const dim = seq[0].length;
  const out: Float64Array[] = [];
  for (let i = 0; i < n; i++) {
    const p = (i / (n - 1)) * (seq.length - 1);
    const i0 = Math.floor(p);
    const i1 = Math.min(i0 + 1, seq.length - 1);
    const t = p - i0;
    const f = new Float64Array(dim);
    for (let j = 0; j < dim; j++)
      f[j] = seq[i0][j] * (1 - t) + seq[i1][j] * t;
    out.push(f);
  }
  return out;
}

export function isValidHand(lm: Landmark[]): boolean {
  return lm.length === 21 &&
    lm.every(({ x, y, z }) => [x, y, z].every(Number.isFinite)) &&
    Math.hypot(lm[9].x - lm[0].x, lm[9].y - lm[0].y, lm[9].z - lm[0].z) > 1e-6;
}

/** Store wrist travel in the three otherwise-zero wrist coordinates. */
export function normalizeMotion(frames: Landmark[][]): Float64Array[] {
  const origin = frames[0][0];
  const palm = frames[0][9];
  const scale = Math.hypot(palm.x - origin.x, palm.y - origin.y, palm.z - origin.z);
  return frames.map((lm) => {
    const pose = normalizeFrame(lm);
    pose[0] = (lm[0].x - origin.x) / scale;
    pose[1] = (lm[0].y - origin.y) / scale;
    pose[2] = (lm[0].z - origin.z) / scale;
    return pose;
  });
}
