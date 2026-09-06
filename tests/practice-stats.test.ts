import { test } from "node:test";
import assert from "node:assert/strict";
import { weakestLetters, type PracticeStats } from "../lib/practice-stats.ts";

const mk = (m: Record<string, [number, number]>): PracticeStats => ({
  letters: Object.fromEntries(
    Object.entries(m).map(([l, [a, h]]) => [l, { attempts: a, hits: h }])
  ),
  streakCurrent: 0,
  streakBest: 0,
  lastDay: null,
});

test("weakestLetters ranks by accuracy among practiced", () => {
  const s = mk({ A: [10, 10], B: [10, 4], C: [10, 7], D: [5, 1] });
  assert.deepEqual(weakestLetters(s, 3), ["D", "B", "C"]);
});

test("letters with <3 attempts fill from least-attempted", () => {
  const s = mk({ A: [10, 9], B: [1, 1], C: [2, 0], E: [10, 5] });
  const weak = weakestLetters(s, 3);
  assert.ok(weak.includes("E"));
  assert.ok(weak.includes("C") || weak.includes("B"));
  assert.ok(!weak.includes("A"));
});

test("empty stats -> empty list", () => {
  assert.deepEqual(weakestLetters(mk({}), 3), []);
});
