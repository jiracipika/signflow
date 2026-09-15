// Avatar playback engine v2: sequences poses for letters/words with natural
// fingerspelling flow — letters transition directly into each other (no
// return-to-rest between letters of a word), rest+dwell only at word gaps.
// J and Z get real stroke paths: the whole hand translates along the letter's
// true motion (J traced with the pinky, Z traced with the index) while the
// shape holds. Emits per-letter/per-word frame spans so the UI can sync a
// caption and offer per-letter replay.

import type { Pose } from "@/components/SignAvatar";

export const FRAME_MS = 45; // playback tick used by SignAvatar motion loop

export type LetterSpan = { letter: string; start: number; end: number };
export type WordSpan = { text: string; start: number; end: number };
export type SignSequence = {
  frames: Pose[][];
  caption: string;
  spans: LetterSpan[];
  words: WordSpan[];
};

type SequenceOpts = { holdMs?: number; gapMs?: number };

const LETTER_HOLD_MS = 700; // shape hold per letter at 1x
const WORD_GAP_MS = 620; // rest dwell between words
const TRANSITION_FRAMES = 7; // prev letter -> next letter
const WORD_IN_FRAMES = 9; // rest -> first letter of a word
const WORD_OUT_FRAMES = 6; // last letter -> rest

export function neutralPose(poses: Record<string, Pose[]>): Pose[] {
  // relaxed fist-ish average of C and E shapes as rest position
  const a = poses["C"] ?? Object.values(poses)[0];
  const b = poses["E"] ?? a;
  return a.map((p, i) => ({ x: (p.x + b[i].x) / 2, y: (p.y + b[i].y) / 2, z: p.z }));
}

function lerpFrames(a: Pose[], b: Pose[], t: number): Pose[] {
  const e = t * t * (3 - 2 * t); // smoothstep
  return a.map((p, i) => ({
    x: p.x + (b[i].x - p.x) * e,
    y: p.y + (b[i].y - p.y) * e,
    z: p.z + (b[i].z - p.z) * e,
  }));
}

function holdFrames(target: Pose[], ms: number): Pose[][] {
  const n = Math.max(1, Math.round(ms / FRAME_MS));
  return Array.from({ length: n }, () => target);
}

// ---------- J / Z stroke paths ----------
// Offsets are in hand-space (same scale as poses: palm size ~1). The shape
// holds; the whole hand translates so the tracing finger draws the letter.
// J: pinky (lm 20) draws a vertical line down then a bottom-left hook.
// Z: index (lm 8) draws right, diagonal down-left, then right again.

type Waypoint = { dx: number; dy: number; w: number };

const J_STROKE: Waypoint[] = [
  { dx: 0, dy: 0, w: 1 }, // start of vertical stroke
  { dx: 0.04, dy: -0.3, w: 3 }, // down the stem
  { dx: -0.22, dy: -0.34, w: 2 }, // hook curves left along the bottom
  { dx: -0.3, dy: -0.26, w: 1 }, // hook tip rises slightly
];

const Z_STROKE: Waypoint[] = [
  { dx: -0.18, dy: 0.1, w: 1 }, // top-left
  { dx: 0.18, dy: 0.1, w: 1 }, // top-right
  { dx: -0.18, dy: -0.16, w: 1.4 }, // diagonal to bottom-left
  { dx: 0.18, dy: -0.16, w: 1 }, // bottom-right
];

function strokeFrames(
  target: Pose[],
  stroke: Waypoint[],
  ms: number,
  traceIdx: number
): Pose[][] {
  const total = stroke.reduce((s, w) => s + w.w, 0);
  const n = Math.max(8, Math.round(ms / FRAME_MS));
  const frames: Pose[][] = [];
  let acc = 0;
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1); // 0..1 along the polyline
    acc = t * total;
    // find segment containing acc
    let seg = 0, segAcc = 0;
    for (let s = 0; s < stroke.length - 1; s++) {
      if (acc <= segAcc + stroke[s].w) { seg = s; break; }
      segAcc += stroke[s].w;
      seg = s;
    }
    const segLen = stroke[seg].w;
    const local = segLen > 0 ? (acc - segAcc) / segLen : 0;
    const e = local * local * (3 - 2 * local);
    const dx = stroke[seg].dx + (stroke[seg + 1].dx - stroke[seg].dx) * e;
    const dy = stroke[seg].dy + (stroke[seg + 1].dy - stroke[seg].dy) * e;
    // lead the translation so the tracing fingertip visually draws the letter:
    // move the hand opposite to the desired fingertip direction
    frames.push(target.map((p, j) => (j === traceIdx
      ? { x: p.x, y: p.y, z: p.z }
      : { x: p.x - dx * 0.5, y: p.y - dy * 0.5, z: p.z })));
    // trace fingertip itself translates fully with the stroke
    const tip = frames[i][traceIdx];
    tip.x = target[traceIdx].x + dx;
    tip.y = target[traceIdx].y + dy;
  }
  return frames;
}

/** Build a frame sequence signing `text` (fingerspelled) with letter spans. */
export function spellSequence(
  text: string,
  poses: Record<string, Pose[]>,
  opts?: SequenceOpts
): SignSequence {
  const holdMs = opts?.holdMs ?? LETTER_HOLD_MS;
  const gapMs = opts?.gapMs ?? WORD_GAP_MS;
  const rest = neutralPose(poses);
  const letters = text.toUpperCase().replace(/[^A-Z ]/g, "");
  const frames: Pose[][] = [];
  const spans: LetterSpan[] = [];
  const words: WordSpan[] = [];

  const wordsArr = letters.split(" ").filter((w) => w.length > 0);
  let prevPose: Pose[] | null = null;
  let wordStart = -1;

  wordsArr.forEach((word, wi) => {
    wordStart = frames.length;
    for (const ch of word) {
      const target = poses[ch];
      if (!target) continue;
      const spanStart = frames.length;
      if (prevPose === null) {
        // rest -> first letter of the sequence
        for (let i = 0; i <= WORD_IN_FRAMES; i++)
          frames.push(lerpFrames(rest, target, i / WORD_IN_FRAMES));
      } else if (wi > 0 && spanStart === wordStart) {
        // first letter after a word gap: brief rest dwell then flow in
        for (let i = 0; i < Math.round(gapMs / FRAME_MS); i++) frames.push(rest);
        for (let i = 0; i <= WORD_IN_FRAMES; i++)
          frames.push(lerpFrames(rest, target, i / WORD_IN_FRAMES));
      } else {
        // letter -> letter direct flow
        for (let i = 0; i <= TRANSITION_FRAMES; i++)
          frames.push(lerpFrames(prevPose, target, i / TRANSITION_FRAMES));
      }
      // shape hold (with stroke for J/Z)
      if (ch === "J") frames.push(...strokeFrames(target, J_STROKE, holdMs, 20));
      else if (ch === "Z") frames.push(...strokeFrames(target, Z_STROKE, holdMs, 8));
      else frames.push(...holdFrames(target, holdMs));
      spans.push({ letter: ch, start: spanStart, end: frames.length });
      prevPose = target;
    }
    if (spans.length && wordStart < frames.length)
      words.push({ text: word, start: wordStart, end: frames.length });
    // return to rest after each word (except we let the last letter's hold
    // blend out below if it's the final word)
    if (wi < wordsArr.length - 1 && prevPose) {
      for (let i = 0; i <= WORD_OUT_FRAMES; i++)
        frames.push(lerpFrames(prevPose, rest, i / WORD_OUT_FRAMES));
      prevPose = rest;
    }
  });

  return { frames, caption: wordsArr.join(" "), spans, words };
}
