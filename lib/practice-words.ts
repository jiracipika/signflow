// Word practice: sample a word (weighted toward short words — they're the
// ASL-realistic practice range), score a typed answer letter-by-letter.
// Per-letter results feed lib/practice-stats.ts so words drill the same
// weak-letter grid as single letters.

import { COMMON_WORDS } from "./dictionary.ts";

/** Practice pool: short common words (≤7 letters — long words are tedious to
 *  fingerspell back). Uppercase to match the avatar caption format. */
export const WORD_PRACTICE_POOL: string[] = COMMON_WORDS.filter(
  (w) => w.length <= 7
).map((w) => w.toUpperCase());

/**
 * Sample a word, weighted by 1/length so short words dominate. Short words
 * are what a beginner can realistically read back; longer words appear as
 * occasional stretch rounds.
 */
export function sampleWord(pool?: string[], _rng?: () => number, exclude?: string): string {
  const p = pool ?? WORD_PRACTICE_POOL;
  const candidates = exclude ? p.filter((w) => w !== exclude) : p;
  const src = candidates.length > 0 ? candidates : p;
  // weighted pick without precomputing a full weight table
  const total = src.reduce((s, w) => s + 1 / w.length, 0);
  let r = Math.random() * total;
  for (const w of src) {
    r -= 1 / w.length;
    if (r <= 0) return w;
  }
  return src[src.length - 1];
}

export type LetterHit = { letter: string; hit: boolean };
export type WordScore = { correct: number; total: number; perLetter: LetterHit[] };

/** Normalize an answer: uppercase, keep A-Z only (spaces are stripped so
 *  multi-word entries still score as their letters). */
function normalize(s: string): string {
  return s.toUpperCase().replace(/[^A-Z]/g, "");
}

/** Position-wise letter score of a typed answer against the target word. */
export function scoreTypedWord(target: string, answer: string): WordScore {
  const t = normalize(target);
  const a = normalize(answer);
  const perLetter: LetterHit[] = [];
  let correct = 0;
  for (let i = 0; i < t.length; i++) {
    const hit = a[i] === t[i];
    if (hit) correct++;
    perLetter.push({ letter: t[i], hit });
  }
  return { correct, total: t.length, perLetter };
}
