import { test } from "node:test";
import assert from "node:assert/strict";
import {
  sampleWord,
  scoreTypedWord,
  WORD_PRACTICE_POOL,
} from "../lib/practice-words.ts";
import { COMMON_WORDS } from "../lib/dictionary.ts";

test("word pool is non-empty, uppercase, drawn from COMMON_WORDS", () => {
  assert.ok(WORD_PRACTICE_POOL.length >= 50, "pool too small");
  const upper = new Set(COMMON_WORDS.map((w) => w.toUpperCase()));
  for (const w of WORD_PRACTICE_POOL) {
    assert.ok(upper.has(w), `${w} not in COMMON_WORDS`);
    assert.ok(w.length <= 7, `${w} too long for practice`);
  }
});

test("sampleWord returns pool members, honors exclusion", () => {
  const pool = ["CAT", "DOG", "BIRD"];
  const seen = new Set<string>();
  for (let i = 0; i < 200; i++) {
    const w = sampleWord(pool, undefined, "CAT");
    seen.add(w);
    assert.notEqual(w, "CAT", "excluded word was sampled");
  }
  assert.ok(seen.has("DOG") && seen.has("BIRD"), "sampling stuck on one word");
});

test("sampleWord is weighted toward short words", () => {
  const pool = ["HI", "UNDERSTAND", "UNDERSTANDING"];
  let short = 0;
  const N = 3000;
  for (let i = 0; i < N; i++) if (sampleWord(pool) === "HI") short++;
  // weight 1/len: HI should win ~62% of the time; allow wide margin
  assert.ok(short / N > 0.45, `short word share too low: ${short / N}`);
});

test("scoreTypedWord scores per-letter, position-wise", () => {
  assert.deepEqual(scoreTypedWord("CAT", "CAT"), {
    correct: 3,
    total: 3,
    perLetter: [
      { letter: "C", hit: true },
      { letter: "A", hit: true },
      { letter: "T", hit: true },
    ],
  });
  const r = scoreTypedWord("CAT", "CAP");
  assert.equal(r.correct, 2);
  assert.equal(r.total, 3);
  assert.deepEqual(
    r.perLetter.map((p) => p.hit),
    [true, true, false]
  );
  // wrong length: strict position-wise — "AT" misaligns against "CAT"
  const r2 = scoreTypedWord("CAT", "AT");
  assert.equal(r2.correct, 0);
  assert.equal(r2.total, 3);
  // case + junk chars are normalized away
  assert.equal(scoreTypedWord("CAT", " c-a-t! ").correct, 3);
});
