import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeFrame, resampleSequence } from "../lib/signs/normalize.ts";
import { dtwDistance } from "../lib/signs/dtw.ts";
import type { Landmark } from "../lib/types.ts";

const lm = (arr: [number, number, number][]) =>
  arr.map(([x, y, z]) => ({ x, y, z }));

// a simple open-hand pose
const openHand: [number, number, number][] = Array.from({ length: 21 }, (_, i) => [
  0.4 + (i % 3) * 0.02,
  0.8 - Math.floor(i / 3) * 0.05,
  0,
]);

test("normalizeFrame is translation+scale invariant", () => {
  const a = normalizeFrame(lm(openHand));
  const shifted = lm(openHand.map(([x, y, z]) => [x + 0.2, y - 0.1, z + 0.05] as [number, number, number]));
  const scaled = lm(openHand.map(([x, y, z]) => [x * 2, y * 2, z * 2] as [number, number, number]));
  const b = normalizeFrame(shifted);
  const c = normalizeFrame(scaled);
  let d1 = 0,
    d2 = 0;
  for (let i = 0; i < 63; i++) {
    d1 += Math.abs(a[i] - b[i]);
    d2 += Math.abs(a[i] - c[i]);
  }
  assert.ok(d1 < 1e-6, `translation changed norm by ${d1}`);
  assert.ok(d2 < 1e-6, `scale changed norm by ${d2}`);
});

test("normalizeFrame separates different poses", () => {
  const open = normalizeFrame(lm(openHand));
  // fist: all tips near wrist
  const fistArr = openHand.map((p, i) =>
    i % 4 === 0 ? p : ([p[0], p[1] + 0.25, p[2]] as [number, number, number])
  );
  const fist = normalizeFrame(lm(fistArr));
  let d = 0;
  for (let i = 0; i < 63; i++) d += Math.abs(open[i] - fist[i]);
  assert.ok(d > 1.5, `poses too close: ${d}`);
});

test("resampleSequence produces exact length, preserves endpoints", () => {
  const seq = [1, 2, 3, 4, 5, 6, 7, 8].map((v) => Float64Array.from([v]));
  const out = resampleSequence(seq, 4);
  assert.equal(out.length, 4);
  assert.equal(out[0][0], 1);
  assert.equal(out[3][0], 8);
  // midpoint between 1..8 sampled at 0, 7/3, 14/3, 7
  assert.ok(Math.abs(out[1][0] - 1 + 7 / 3 - 0) < 1e-9 || Math.abs(out[1][0] - (1 + 7 / 3)) < 1e-9);
});

test("dtw: identical sequences -> ~0, different -> larger", () => {
  const mk = (arr: number[]) => arr.map((v) => Float64Array.from([v, v * 0.1]));
  const a = mk([1, 2, 3, 4, 5]);
  const same = mk([1, 2, 3, 4, 5]);
  const other = mk([5, 1, 2, 9, 0]);
  assert.ok(dtwDistance(a, same) < 0.01);
  assert.ok(dtwDistance(a, other) > 0.5);
});

test("dtw: time-warped similar sequences stay close", () => {
  const mk = (arr: number[]) => arr.map((v) => Float64Array.from([v]));
  const a = mk([1, 2, 3, 4, 5, 6, 7, 8]);
  // same ramp, slower start (tempo change)
  const b = mk([1, 1.5, 2, 3, 4, 5, 6, 7, 8, 8]);
  const resampledA = resampleSequence(a, 32);
  const resampledB = resampleSequence(b, 32);
  assert.ok(dtwDistance(resampledA, resampledB) < 0.15);
});

test("dtw rejects empty", () => {
  assert.equal(dtwDistance([], [Float64Array.from([1])]), Infinity);
});
