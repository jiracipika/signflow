import { test } from "node:test";
import assert from "node:assert/strict";
import { TemporalDecoder } from "../lib/decoder.ts";
import type { LetterPrediction } from "../lib/types.ts";

const P = (letter: string, confidence = 0.9): LetterPrediction => ({
  letter,
  confidence,
  probabilities: {},
});

test("stable letter becomes tentative", () => {
  const d = new TemporalDecoder({ stabilityFrames: 4 });
  for (let i = 0; i < 10; i++) d.push(P("A"), i * 33);
  const s = d.getState();
  assert.equal(s.tentative, "A");
  assert.equal(s.tracking, "tracking");
});

test("held pose with autoCommit emits exactly one letter", () => {
  const d = new TemporalDecoder({ stabilityFrames: 4, autoCommit: true, autoCommitFrames: 10 });
  for (let i = 0; i < 100; i++) d.push(P("B"), i * 33);
  const pending = d.drainPending();
  assert.equal(pending.length, 1);
  assert.equal(pending[0], "B");
});

test("manual commit clears tentative; re-commit needs re-stabilization", () => {
  const d = new TemporalDecoder({ stabilityFrames: 4 });
  for (let i = 0; i < 10; i++) d.push(P("A"), i * 33);
  assert.equal(d.commitLetter(), "A");
  // immediately after, tentative is null even though pose is still held,
  // and holding the SAME pose must NOT re-arm (no accidental double letters)
  for (let i = 0; i < 20; i++) d.push(P("A"), 1000 + i * 33);
  assert.equal(d.getState().tentative, null);
  assert.equal(d.commitLetter(), null);
  // to spell a double letter: drop the hand (gap), then re-sign A
  for (let i = 0; i < 6; i++) d.push(null, 2000 + i * 33);
  for (let i = 0; i < 10; i++) d.push(P("A"), 3000 + i * 33);
  assert.equal(d.getState().tentative, "A");
  assert.equal(d.commitLetter(), "A");
});

test("tracking lost after 30 nulls, recovers on confident frame", () => {
  const d = new TemporalDecoder({ stabilityFrames: 4 });
  for (let i = 0; i < 35; i++) d.push(null, i * 33);
  assert.equal(d.getState().tracking, "lost");
  d.push(P("C"), 2000);
  assert.equal(d.getState().tracking, "tracking");
});

test("brief 5-frame gap inserts no letters and decays tentative", () => {
  const d = new TemporalDecoder({ stabilityFrames: 4, autoCommit: true, autoCommitFrames: 10 });
  for (let i = 0; i < 10; i++) d.push(P("D"), i * 33);
  assert.equal(d.getState().tentative, "D");
  for (let i = 0; i < 5; i++) d.push(null, 1000 + i * 33);
  assert.equal(d.getState().tentative, null);
  assert.equal(d.drainPending().length, 0);
});

test("flickering predictions never settle", () => {
  const d = new TemporalDecoder({ stabilityFrames: 6 });
  for (let i = 0; i < 60; i++) d.push(P(i % 2 === 0 ? "A" : "B"), i * 33);
  assert.equal(d.getState().tentative, null);
});

test("low confidence predictions are ignored", () => {
  const d = new TemporalDecoder({ minConfidence: 0.7 });
  for (let i = 0; i < 20; i++) d.push(P("E", 0.4), i * 33);
  assert.equal(d.getState().tentative, null);
});
