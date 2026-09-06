// Immutable transcript with bounded undo stack.

import type { CommitSource, Transcript, TranscriptAction } from "./types";

const MAX_LEN = 2000;
const UNDO_CAP = 100;

export class TranscriptT implements Transcript {
  readonly text: string;
  private readonly stack: string[];

  constructor(text = "", stack: string[] = []) {
    this.text = text;
    this.stack = stack;
  }

  get canUndo(): boolean {
    return this.stack.length > 0;
  }

  private canonicalize(s: string): string {
    return s.replace(/\s+/g, " ").trimStart();
  }

  private next(text: string): TranscriptT {
    const stack = [...this.stack, this.text].slice(-UNDO_CAP);
    return new TranscriptT(this.canonicalize(text), stack);
  }

  apply(action: TranscriptAction): Transcript {
    switch (action.type) {
      case "letter": {
        const ch = (action.letter ?? "").toUpperCase();
        if (!/^[A-Z]$/.test(ch)) return this;
        if (this.text.length >= MAX_LEN) return this;
        return this.next(this.text + ch);
      }
      case "space": {
        if (this.text.length === 0 || this.text.endsWith(" ")) return this;
        return this.next(this.text + " ");
      }
      case "delete": {
        if (this.text.length === 0) return this;
        return this.next(this.text.slice(0, -1));
      }
      case "undo": {
        if (this.stack.length === 0) return this;
        const prev = this.stack[this.stack.length - 1];
        return new TranscriptT(prev, this.stack.slice(0, -1));
      }
      case "clear":
        return this.next("");
      case "manual": {
        const t = (action.text ?? "").slice(0, MAX_LEN);
        return this.next(t);
      }
      default:
        return this;
    }
  }

  currentWord(): string {
    const idx = this.text.lastIndexOf(" ");
    return this.text.slice(idx + 1);
  }

  acceptSuggestion(word: string): Transcript {
    const clean = word.replace(/[^A-Za-z]/g, "");
    if (!clean) return this;
    const current = this.currentWord();
    const w =
      current && current[0] === current[0].toUpperCase()
        ? clean[0].toUpperCase() + clean.slice(1).toLowerCase()
        : clean.toLowerCase();
    const idx = this.text.lastIndexOf(" ");
    const head = idx === -1 ? "" : this.text.slice(0, idx + 1);
    return this.next(head + w);
  }
}

export function createTranscript(): Transcript {
  return new TranscriptT();
}

// re-export for consumers that import from this module
export type { TranscriptAction, CommitSource };
