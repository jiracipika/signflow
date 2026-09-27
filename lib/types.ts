// Shared contracts for SignFlow. Do not rename exported symbols without
// updating all call sites (lib/, components/, app/).

export type Landmark = { x: number; y: number; z: number };

export type HandFrame = {
  landmarks: Landmark[]; // 21 points, normalized [0..1] image coords
  handedness: "Left" | "Right"; // Anatomical hand, corrected for unmirrored camera input
  timestampMs: number;
};

export type LetterPrediction = {
  letter: string; // single char A-Z, from model.letters
  confidence: number; // softmax max, NOT calibrated accuracy
  probabilities: Record<string, number>;
};

// ---------------- temporal decoder ----------------

export type DecoderConfig = {
  /** stability duration in 30 fps frame equivalents (default 4) */
  stabilityFrames: number;
  /** min softmax confidence to consider a prediction valid (default 0.42) */
  minConfidence: number;
  /** if enabled, settled letters auto-commit after holdFrames (default on) */
  autoCommit: boolean;
  /** optional explicit frame-count override for compatibility (default 8) */
  autoCommitFrames: number;
  /** stable time before auto-commit fires (default 240ms, frame-rate independent) */
  autoCommitMs: number;
};

export type DecoderState = {
  /** current tentative (not committed) letter or null */
  tentative: string | null;
  /** confidence of the tentative letter (0..1) */
  tentativeConfidence: number;
  /** settled letters pending commit (auto mode) */
  pending: string[];
  /** tracking lost if no hand seen for this many frames */
  tracking: "searching" | "tracking" | "lost";
};

export type CommitSource = "manual" | "auto" | "practice";

export interface Decoder {
  /** feed one frame's prediction (or null when no hand detected) */
  push(pred: LetterPrediction | null, nowMs: number): DecoderState;
  /** explicit commit of current tentative letter; returns committed letter or null */
  commitLetter(): string | null;
  /** current state snapshot */
  getState(): DecoderState;
  reset(): void;
  configure(cfg: Partial<DecoderConfig>): void;
}

// ---------------- transcript ----------------

export type TranscriptAction = {
  type: "letter" | "space" | "delete" | "undo" | "clear" | "manual";
  letter?: string;
  text?: string;
  source?: CommitSource;
};

export interface Transcript {
  /** committed text, words separated by single spaces */
  text: string;
  canUndo: boolean;
  /** apply an action, return new transcript (immutable style) */
  apply(action: TranscriptAction): Transcript;
  /** current word prefix being typed (after last space) */
  currentWord(): string;
  /** replace current word with a chosen suggestion */
  acceptSuggestion(word: string): Transcript;
}

// ---------------- trie / suggestions ----------------

export interface Suggester {
  /** up to `max` completions of the current word prefix, ranked */
  suggest(prefix: string, max?: number): string[];
  /** true if word exists in dictionary (for accepting custom words) */
  knows(word: string): boolean;
}

export type SuggestionSet = {
  prefix: string;
  items: string[]; // 0..3 items, each a full word
};
