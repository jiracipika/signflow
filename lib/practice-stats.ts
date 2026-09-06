// Practice statistics + daily streak + weak-letter drill, persisted locally.

export type LetterStat = { attempts: number; hits: number };
export type PracticeStats = {
  letters: Record<string, LetterStat>;
  streakCurrent: number;
  streakBest: number;
  lastDay: string | null; // YYYY-MM-DD
};

const KEY = "signflow.practice.v1";

const EMPTY: PracticeStats = {
  letters: {},
  streakCurrent: 0,
  streakBest: 0,
  lastDay: null,
};

export function loadStats(): PracticeStats {
  if (typeof window === "undefined") return EMPTY;
  try {
    return { ...EMPTY, ...JSON.parse(window.localStorage.getItem(KEY) ?? "{}") };
  } catch {
    return EMPTY;
  }
}

function save(s: PracticeStats) {
  window.localStorage.setItem(KEY, JSON.stringify(s));
}

function dayKey(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

/** Call once per practice round: hit=true when the target was recognized. */
export function recordRound(letter: string, hit: boolean): PracticeStats {
  const s = loadStats();
  const st = s.letters[letter] ?? { attempts: 0, hits: 0 };
  st.attempts++;
  if (hit) st.hits++;
  s.letters[letter] = st;

  // daily streak counts distinct days with at least one hit
  const today = dayKey();
  if (hit && s.lastDay !== today) {
    const yest = dayKey(new Date(Date.now() - 86400000));
    s.streakCurrent = s.lastDay === yest ? s.streakCurrent + 1 : 1;
    s.streakBest = Math.max(s.streakBest, s.streakCurrent);
    s.lastDay = today;
  }
  save(s);
  return s;
}

export function resetStats(): PracticeStats {
  window.localStorage.removeItem(KEY);
  return loadStats();
}

/** Letters with the worst accuracy (min 3 attempts), then least-practiced. */
export function weakestLetters(stats: PracticeStats, n = 3): string[] {
  const scored = Object.entries(stats.letters).map(([l, st]) => ({
    l,
    acc: st.hits / Math.max(1, st.attempts),
    n: st.attempts,
  }));
  const ranked = scored.sort((a, b) => {
    // both practiced: accuracy ascending; practiced always ranks above unpracticed
    const aPr = a.n >= 3,
      bPr = b.n >= 3;
    if (aPr !== bPr) return aPr ? 1 : -1;
    if (aPr && bPr && a.acc !== b.acc) return a.acc - b.acc;
    return a.n - b.n; // fewer attempts first
  });
  return ranked.slice(0, n).map((e) => e.l);
}
