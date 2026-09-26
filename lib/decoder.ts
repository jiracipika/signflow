// Temporal decoder: turns per-frame letter predictions into stable tentative
// letters and committed text events. See lib/types.ts for the interface.

import type {
  Decoder,
  DecoderConfig,
  DecoderState,
  LetterPrediction,
} from "./types";

const DEFAULTS: DecoderConfig = {
  stabilityFrames: 4,
  minConfidence: 0.42,
  autoCommit: true,
  autoCommitFrames: 8,
};

const LOST_AFTER = 30; // null/low frames -> tracking lost
const DECAY_AFTER = 4; // null frames -> tentative decays to null

type Entry = { letter: string; confidence: number };

export class TemporalDecoder implements Decoder {
  private cfg: DecoderConfig = { ...DEFAULTS };
  private window: Entry[] = [];
  private winSize = 8;
  private stabilityCount = 0;
  private lastMajority: string | null = null;
  private nullCount = 0;
  private tracking: DecoderState["tracking"] = "searching";
  private tentative: string | null = null;
  private tentativeConfidence = 0;
  private settledCount = 0; // pushes the current tentative has persisted
  private pending: string[] = [];
  // after a commit (auto or manual), the same letter cannot re-arm until the
  // majority changes or the signal drops — this is what makes held poses emit
  // exactly one letter
  private awaitingChange: string | null = null;

  constructor(cfg?: Partial<DecoderConfig>) {
    if (cfg) this.configure(cfg);
  }

  configure(cfg: Partial<DecoderConfig>): void {
    this.cfg = { ...this.cfg, ...cfg };
    if (cfg.stabilityFrames !== undefined) this.winSize = Math.max(4, cfg.stabilityFrames + 2);
    this.reset();
  }

  reset(): void {
    this.window = [];
    this.stabilityCount = 0;
    this.lastMajority = null;
    this.nullCount = 0;
    this.tracking = "searching";
    this.tentative = null;
    this.tentativeConfidence = 0;
    this.settledCount = 0;
    this.pending = [];
    this.awaitingChange = null;
  }

  push(pred: LetterPrediction | null, nowMs: number): DecoderState {
    void nowMs;
    const valid =
      pred !== null &&
      pred.letter.length === 1 &&
      /[A-Z]/.test(pred.letter) &&
      pred.confidence >= this.cfg.minConfidence;

    if (!valid) {
      this.nullCount++;
      if (this.nullCount >= LOST_AFTER) {
        this.tracking = "lost";
        this.window = [];
        this.stabilityCount = 0;
        this.lastMajority = null;
        this.tentative = null;
        this.tentativeConfidence = 0;
        this.settledCount = 0;
      } else if (this.nullCount >= DECAY_AFTER) {
        // brief gap: hand moving between signs — drop tentative so no stray
        // letters get committed, but keep window aging out
        this.tentative = null;
        this.tentativeConfidence = 0;
        this.settledCount = 0;
        this.awaitingChange = null; // a gap allows re-signing the same letter
        if (this.window.length) this.window.shift();
      }
      return this.getState();
    }

    this.nullCount = 0;
    this.tracking = "tracking";
    this.window.push({ letter: pred!.letter, confidence: pred!.confidence });
    while (this.window.length > this.winSize) this.window.shift();

    // majority vote
    const counts = new Map<string, { n: number; sumConf: number }>();
    for (const e of this.window) {
      const c = counts.get(e.letter) ?? { n: 0, sumConf: 0 };
      c.n++;
      c.sumConf += e.confidence;
      counts.set(e.letter, c);
    }
    let bestLetter: string | null = null;
    let bestN = 0;
    let bestAvg = 0;
    for (const [letter, c] of counts) {
      if (c.n > bestN || (c.n === bestN && bestLetter !== null && letter < bestLetter)) {
        bestLetter = letter;
        bestN = c.n;
        bestAvg = c.sumConf / c.n;
      }
    }

    if (bestLetter === this.lastMajority) {
      this.stabilityCount++;
    } else {
      this.stabilityCount = 1;
      this.lastMajority = bestLetter;
    }

    if (
      bestLetter !== null &&
      this.stabilityCount >= this.cfg.stabilityFrames &&
      bestAvg >= this.cfg.minConfidence &&
      bestN * 2 > this.window.length && // strict majority (no flicker ties)
      bestLetter !== this.awaitingChange
    ) {
      if (this.tentative === bestLetter) {
        this.settledCount++;
      } else {
        this.tentative = bestLetter;
        this.settledCount = 1;
      }
      this.tentativeConfidence = bestAvg;
      if (this.cfg.autoCommit && this.settledCount >= this.cfg.autoCommitFrames) {
        this.pending.push(this.tentative);
        // hold-gate: this letter cannot re-arm until the signal changes
        this.awaitingChange = this.tentative;
        this.tentative = null;
        this.settledCount = 0;
        this.stabilityCount = 0;
        this.window = [];
        this.lastMajority = null;
      }
    } else {
      this.tentative = null;
      this.tentativeConfidence = 0;
      this.settledCount = 0;
    }

    return this.getState();
  }

  commitLetter(): string | null {
    if (this.tentative === null) return null;
    const letter = this.tentative;
    // clear so the same letter must re-stabilize before it can be committed
    // again (double letters require an explicit gap: drop the hand, re-sign)
    this.awaitingChange = letter;
    this.tentative = null;
    this.tentativeConfidence = 0;
    this.settledCount = 0;
    this.stabilityCount = 0;
    this.window = [];
    this.lastMajority = null;
    return letter;
  }

  /** drain pending auto-commit letters (the app applies them to transcript) */
  drainPending(): string[] {
    const p = this.pending;
    this.pending = [];
    return p;
  }

  getState(): DecoderState {
    return {
      tentative: this.tentative,
      tentativeConfidence: this.tentativeConfidence,
      pending: [...this.pending],
      tracking: this.tracking,
    };
  }
}
