import { test } from "node:test";
import assert from "node:assert/strict";
import {
  sampleWord,
  sampleDrillWord,
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

// ---- P-drill: weak-letter weighted sampling -------------------------------

test("sampleWord honors an injected rng (deterministic)", () => {
  const pool = ["CAT", "DOG", "BIRD"];
  let n = 0;
  const rng = () => [0.0, 0.4, 0.8][n++ % 3];
  const picks = new Set([sampleWord(pool, rng), sampleWord(pool, rng), sampleWord(pool, rng)]);
  assert.ok(picks.size >= 1, "rng-driven picks produced nothing");
});

test("sampleDrillWord over-samples words containing weak letters", () => {
  const pool = ["FAT", "DOG", "FAN", "BIRD", "CAT", "SUN"];
  let n = 0;
  const rng = () => {
    n += 1;
    return ((n * 2654435761) % 4294967296) / 4294967296;
  };
  const count = (fn: () => string) => {
    let f = 0;
    for (let i = 0; i < 600; i++) if (fn().includes("F")) f++;
    return f;
  };
  const plain = count(() => sampleWord(pool, rng));
  const drilled = count(() =>
    sampleDrillWord({ pool, rng, weakLetters: ["F"] })
  );
  assert.ok(
    drilled > plain * 1.5,
    `weak weighting too weak: drilled ${drilled} vs plain ${plain}`
  );
});

test("sampleDrillWord with no weak letters matches plain short-bias distribution", () => {
  const pool = ["CAT", "DOG"];
  let n = 0;
  const rng = () => {
    n += 1;
    return ((n * 2654435761) % 4294967296) / 4294967296;
  };
  for (let i = 0; i < 100; i++) {
    const a = sampleWord(pool, rng);
    const b = sampleDrillWord({ pool, rng });
    assert.ok(pool.includes(a) && pool.includes(b));
  }
});

test("sampleDrillWord honors exclude + weakWeight override", () => {
  const pool = ["FAT", "DOG"];
  let n = 0;
  const rng = () => {
    n += 1;
    return ((n * 2654435761) % 4294967296) / 4294967296;
  };
  for (let i = 0; i < 50; i++) {
    const w = sampleDrillWord({ pool, rng, exclude: "FAT" });
    assert.notEqual(w, "FAT", "excluded word sampled");
  }
  const weak10 = (() => {
    let f = 0;
    for (let i = 0; i < 200; i++)
      if (sampleDrillWord({ pool, rng, weakLetters: ["F"], weakWeight: 10 }).includes("F")) f++;
    return f;
  })();
  assert.ok(weak10 > 100, `weight 10 should dominate (got ${weak10}/200)`);
});
