// Tests for the sign playback engine: sequence structure, letter spans,
// word gaps, and J/Z stroke translation.

import { test } from "node:test";
import assert from "node:assert/strict";
import { spellSequence, sequenceComplete, FRAME_MS } from "../lib/signs/avatar-engine.ts";

function poses(letters: string[]): Record<string, { x: number; y: number; z: number }[]> {
  const out: Record<string, { x: number; y: number; z: number }[]> = {};
  for (const l of letters) {
    out[l] = Array.from({ length: 21 }, (_, i) => ({
      x: i * 0.01 + l.charCodeAt(0) * 0.001,
      y: (i % 7) * 0.02,
      z: 0,
    }));
  }
  return out;
}
const P = poses("ABCDEFGHIJKLMNOPQRSTUVWXYZ".split(""));

test("FRAME_MS is exported and sane", () => {
  assert.equal(FRAME_MS, 45);
});

test("sequence has frames, caption, spans, words", () => {
  const s = spellSequence("AB", P);
  assert.ok(s.frames.length > 0);
  assert.equal(s.caption, "AB");
  assert.ok(s.spans.length === 2);
  assert.ok(s.words.length === 1);
});

test("spans are ordered, non-overlapping, in-range; contiguous within words", () => {
  const s = spellSequence("HELLO WORLD", P);
  let cursor = 0;
  for (let i = 0; i < s.spans.length; i++) {
    const sp = s.spans[i];
    assert.ok(sp.end > sp.start, "nonempty span");
    assert.ok(sp.start >= cursor, "span does not overlap previous");
    assert.ok(sp.end <= s.frames.length, "span in range");
    if (i > 0 && s.spans[i - 1] && sameWord(s.spans[i - 1], sp, s.words))
      assert.equal(sp.start, cursor, "letters within a word are contiguous");
    cursor = sp.end;
  }
  assert.equal(cursor <= s.frames.length, true);
  const last = s.spans[s.spans.length - 1];
  assert.ok(last.end > s.frames.length - 20, "no big tail beyond last span");
});

function sameWord(a: { start: number }, b: { start: number }, words: { start: number; end: number }[]) {
  return words.some((w) => a.start >= w.start && a.start < w.end && b.start >= w.start && b.start < w.end);
}

test("word gap is longer than intra-letter transition", () => {
  const s = spellSequence("AB CD", P);
  const a = s.spans.find((x) => x.letter === "A")!;
  const b = s.spans.find((x) => x.letter === "B")!;
  const c = s.spans.find((x) => x.letter === "C")!;
  const abGap = b.start - a.end;
  const wordGap = c.start - b.end;
  assert.ok(wordGap > abGap, `word gap ${wordGap} should exceed letter gap ${abGap}`);
});

test("two-letter sequence with no rest-return is not much longer than its spans", () => {
  // direct letter-to-letter flow: total frames close to spans coverage
  const s = spellSequence("AB", P);
  const covered = s.spans[s.spans.length - 1].end;
  assert.ok(s.frames.length - covered <= 2, "no big tail beyond spans");
});

test("J stroke translates pinky tip beyond shape hold", () => {
  const s = spellSequence("J", P);
  const span = s.spans[0];
  // pinky tip = landmark 20; measure x/y travel during the stroke frames
  let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
  for (let i = span.start; i < span.end; i++) {
    const p = s.frames[i][20];
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
  }
  const travel = (maxX - minX) + (maxY - minY);
  assert.ok(travel > 0.15, `J pinky travel ${travel} should be substantial`);
});

test("Z stroke translates index tip in a multi-waypoint path", () => {
  const s = spellSequence("Z", P);
  const span = s.spans[0];
  let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
  for (let i = span.start; i < span.end; i++) {
    const p = s.frames[i][8];
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
  }
  const travel = (maxX - minX) + (maxY - minY);
  assert.ok(travel > 0.2, `Z index travel ${travel} should be substantial`);
});

test("strip invalid characters, handle spaces and empty", () => {
  const s = spellSequence("a1b!", P);
  assert.equal(s.caption, "AB");
  const empty = spellSequence("123", P);
  assert.equal(empty.frames.length, 0);
  assert.equal(empty.spans.length, 0);
});

// ---- playback completion (used by the avatar sign player) ------------------

test("sequence completes at the last frame, not before", () => {
  const s = spellSequence("AB", P);
  const n = s.frames.length;
  assert.equal(sequenceComplete(0, n, false), false);
  assert.equal(sequenceComplete(n - 2, n, false), false);
  assert.equal(sequenceComplete(n - 1, n, false), true);
  assert.equal(sequenceComplete(n, n, false), true, "index past end still completes");
});

test("loop mode and empty sequences never complete", () => {
  const n = spellSequence("AB", P).frames.length;
  assert.equal(sequenceComplete(n - 1, n, true), false, "loop wraps, never finishes");
  assert.equal(sequenceComplete(0, 0, false), false, "nothing to play");
});

test("pacing lives in the frame count, not a separate clock", () => {
  // SignAvatar ticks exactly one frame per FRAME_MS, so playback duration is
  // frames.length * FRAME_MS — the sign player keys completion off the frame
  // index and must never rescale by a speed factor twice (regression: the old
  // completion timer divided by speed again, cutting fast playback short and
  // over-looping slow playback).
  const slow = spellSequence("HI", P, { holdMs: 700, gapMs: 620 });
  const fast = spellSequence("HI", P, { holdMs: 350, gapMs: 310 });
  assert.ok(fast.frames.length < slow.frames.length, "speed shrinks frame count");
  assert.ok(
    fast.frames.length * FRAME_MS < slow.frames.length * FRAME_MS,
    "duration is derivable from frames.length alone"
  );
  const slowHold = slow.spans[0].end - slow.spans[0].start;
  const fastHold = fast.spans[0].end - fast.spans[0].start;
  assert.ok(fastHold < slowHold, "per-letter span shrinks with holdMs");
});
