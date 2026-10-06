// Movement letters J and Z: built-in trajectory recognition.
//
// The static MLP only sees single frames, so the two ASL letters that ARE
// motion never left the manual J/Z buttons. This module watches the fingertip
// path in raw camera coordinates and emits "J" (pinky traces a J) or "Z"
// (index traces a Z) when a stroke completes.
//
// Same matching scheme as SignQuest's js/motion.js (mean segment-angle
// difference over a resampled, unit-normalized path with modest rotation
// tolerance), adapted to SignFlow's Landmark type and 30fps frame cadence.
// Camera-space note: the signer draws the glyph as it reads in THEIR view;
// raw camera frames are its horizontal mirror, so the prototypes below are
// mirrored glyphs.

import type { Landmark } from "../types.ts";

// Strokes in SIGNER view (what the reader sees), unit square, y-down.
const SIGNER_STROKES: Record<"J" | "Z", [number, number][]> = {
  J: [
    [0.62, 0.1], [0.62, 0.45], [0.62, 0.7], [0.58, 0.84], [0.46, 0.9],
    [0.34, 0.86], [0.28, 0.74], [0.3, 0.62],
  ],
  Z: [
    [0.25, 0.18], [0.75, 0.18], [0.3, 0.82], [0.8, 0.82],
  ],
};

const toCameraSpace = (s: [number, number][]) => s.map(([x, y]) => [1 - x, y] as [number, number]);

const RESAMPLE_N = 16;

function resample(path: [number, number][], n: number): [number, number][] {
  if (path.length < 2) return path.slice();
  const lens = [0];
  for (let i = 1; i < path.length; i++) {
    lens.push(lens[i - 1] + Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]));
  }
  const total = lens[lens.length - 1];
  if (total < 1e-9) return Array.from({ length: n }, () => [...path[0]] as [number, number]);
  const out: [number, number][] = [];
  let j = 0;
  for (let k = 0; k < n; k++) {
    const target = (total * k) / (n - 1);
    while (j < lens.length - 2 && lens[j + 1] < target) j++;
    const seg = lens[j + 1] - lens[j];
    const t = seg < 1e-9 ? 0 : (target - lens[j]) / seg;
    out.push([
      path[j][0] + (path[j + 1][0] - path[j][0]) * t,
      path[j][1] + (path[j + 1][1] - path[j][1]) * t,
    ]);
  }
  return out;
}

function pathLength(path: [number, number][]): number {
  let s = 0;
  for (let i = 1; i < path.length; i++) {
    s += Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]);
  }
  return s;
}

// Origin at path start, scaled by bounding-box diagonal: translation/scale
// invariant, deliberately NOT rotation invariant (a Z rotated 90° is an N).
function normalizePath(path: [number, number][]): [number, number][] {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const [x, y] of path) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const diag = Math.max(Math.hypot(maxX - minX, maxY - minY), 1e-9);
  return path.map(([x, y]) => [(x - minX) / diag, (y - minY) / diag]);
}

function dirSeq(path: [number, number][]): number[] {
  const seq: number[] = [];
  for (let i = 1; i < path.length; i++) {
    seq.push(Math.atan2(path[i][1] - path[i - 1][1], path[i][0] - path[i - 1][0]));
  }
  return seq;
}

function scoreAgainst(path: [number, number][], proto: number[]): number {
  const seq = dirSeq(path);
  let s = 0;
  for (let i = 0; i < seq.length; i++) {
    let d = seq[i] - proto[i];
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    s += Math.abs(d);
  }
  return s / seq.length;
}

function rotatePath(path: [number, number][], ang: number): [number, number][] {
  let cx = 0, cy = 0;
  for (const [x, y] of path) { cx += x; cy += y; }
  cx /= path.length; cy /= path.length;
  const c = Math.cos(ang), s = Math.sin(ang);
  return path.map(([x, y]) => {
    const dx = x - cx, dy = y - cy;
    return [cx + dx * c - dy * s, cy + dx * s + dy * c];
  });
}

const ROTATIONS = [0, Math.PI / 12, -Math.PI / 12, Math.PI / 6, -Math.PI / 6];

const PROTOTYPES = (Object.entries(SIGNER_STROKES) as ["J" | "Z", [number, number][]][]).map(
  ([letter, stroke]) => ({
    letter,
    seq: dirSeq(normalizePath(resample(toCameraSpace(stroke), RESAMPLE_N))),
  })
);

/** Match a traced path (any coordinate units) against the J/Z stroke glyphs.
 *  Returns the letter and its mean angular score, or null if nothing fits. */
export function classifyLetterPath(
  pathRaw: [number, number][]
): { letter: "J" | "Z"; score: number } | null {
  if (!pathRaw || pathRaw.length < 2) return null;
  const norm = normalizePath(resample(pathRaw, RESAMPLE_N));
  let best: { letter: "J" | "Z"; score: number } | null = null;
  for (const p of PROTOTYPES) {
    for (const ang of ROTATIONS) {
      const score = scoreAgainst(rotatePath(norm, ang), p.seq);
      if (!best || score < best.score) best = { letter: p.letter, score };
    }
  }
  return best && best.score < 0.5 ? best : null;
}

// ---- the frame-fed watcher ----------------------------------------------------

export const START_SPEED = 0.9; // palm units/s to begin a stroke
export const ACTIVE_SPEED = 0.55;
export const QUIET_MS = 260; // low-speed time that ends a stroke
export const MIN_PATH = 1.1; // palm units — shorter is noise
export const MAX_PATH = 9.0; // longer is hand travel
export const COOLDOWN_MS = 700;

type Tip = { x: number; y: number };

/** Feed camera frames; emits a committed "J"/"Z" when a trace completes. */
export class MotionLetterWatcher {
  private buf: { t: number; x: number; y: number }[] = [];
  private tracing = false;
  private driver: "j" | "z" = "z";
  private quietSince: number | null = null;
  private lastT: number | null = null;
  private lastIdx: Tip | null = null;
  private lastPnk: Tip | null = null;
  private cooldownUntil = 0;

  reset() {
    this.buf = [];
    this.tracing = false;
    this.quietSince = null;
    this.lastT = null;
    this.lastIdx = null;
    this.lastPnk = null;
    this.cooldownUntil = 0;
  }

  /** Live traced length in palm units — useful for progress UI. */
  get livePathLength(): number {
    return pathLength(this.buf.map((p) => [p.x, p.y]));
  }

  /** A no-hand frame: end an in-flight stroke (the hand left = trace over). */
  lost(): "J" | "Z" | null {
    if (!this.tracing || this.buf.length < 2) {
      this.reset();
      return null;
    }
    return this.judge(this.lastT ?? 0);
  }

  /** One frame of landmarks in RAW camera coords + ms timestamp. */
  feed(lm: Landmark[], t: number): "J" | "Z" | null {
    if (!lm || lm.length < 21 || !Number.isFinite(t)) return null;
    const palm = Math.hypot(lm[9].x - lm[0].x, lm[9].y - lm[0].y);
    if (palm < 1e-6) return null;
    if (t < this.cooldownUntil) return null;

    const idx: Tip = { x: (lm[8].x - lm[0].x) / palm, y: (lm[8].y - lm[0].y) / palm };
    const pnk: Tip = { x: (lm[20].x - lm[0].x) / palm, y: (lm[20].y - lm[0].y) / palm };

    let result: "J" | "Z" | null = null;
    if (this.lastT !== null && this.lastIdx && this.lastPnk) {
      const dt = Math.max(1, t - this.lastT) / 1000;
      // speeds vs the PREVIOUS frame's tips — an idle hand has no buffer yet,
      // and that is exactly when a stroke needs to be able to start
      const spdI = Math.hypot(idx.x - this.lastIdx.x, idx.y - this.lastIdx.y) / dt;
      const spdP = Math.hypot(pnk.x - this.lastPnk.x, pnk.y - this.lastPnk.y) / dt;
      const driverFaster = spdI >= spdP;
      const driver = driverFaster ? "z" : "j";
      const spd = driverFaster ? spdI : spdP;
      const other = driverFaster ? spdP : spdI;

      if (!this.tracing) {
        if (spd >= START_SPEED && other < START_SPEED) {
          this.tracing = true;
          this.driver = driver;
          this.buf = [{ t, ...(driverFaster ? idx : pnk) }];
          this.quietSince = null;
        }
      } else if (this.driver !== driver && other >= START_SPEED) {
        // the other finger took over — not a glyph
        this.reset();
      } else {
        const tip = driverFaster ? idx : pnk;
        const last = this.buf[this.buf.length - 1];
        if (spd >= ACTIVE_SPEED || Math.hypot(tip.x - last.x, tip.y - last.y) > 0.01) {
          this.buf.push({ t, x: tip.x, y: tip.y });
          this.quietSince = null;
        } else {
          if (this.quietSince === null) this.quietSince = t;
          if (t - this.quietSince >= QUIET_MS) result = this.judge(t);
        }
        if (this.buf.length > 240) result = this.judge(t);
      }
    }
    this.lastT = t;
    this.lastIdx = idx;
    this.lastPnk = pnk;
    return result;
  }

  private judge(t: number): "J" | "Z" | null {
    const path = this.buf.map((p) => [p.x, p.y] as [number, number]);
    const len = pathLength(path);
    this.reset();
    this.cooldownUntil = t + COOLDOWN_MS;
    if (len < MIN_PATH || len > MAX_PATH) return null;
    const best = classifyLetterPath(path);
    return best ? best.letter : null;
  }
}
