// Word-sign library: a browsable set of common words, each marked with how
// SignFlow currently renders it and where to learn the real sign. Static data
// only — statuses are resolved at render time from the sign store.
//
// Honest-limitations note, which the UI repeats: built-in statuses are
// approximate static one-shape poses (shape only, no motion, not certified
// ASL); taught statuses replay recordings made on the Teach page; everything
// else fingerspells.

import { listSigns } from "./custom-signs.ts";

export type LibraryStatus = "taught" | "builtin" | "fingerspelled";

export type LibraryEntry = {
  /** uppercase display word, matches avatar ?text= format */
  word: string;
  /** fingerspelled caption shown as the preview line */
  fingerspelling: string;
  /** short note about the real sign's nature */
  note: string;
  /** external reference for the real sign (Lifeprint/ASLU or Signing Savvy) */
  referenceUrl: string;
};

const ENTRIES: (Omit<LibraryEntry, "fingerspelling"> & { word: string })[] = [
  { word: "HELLO", note: "Flat hand salutes from the temple outward.", referenceUrl: "https://www.lifeprint.com/asl101/pages-signs/h/hello.htm" },
  { word: "THANK YOU", note: "Flat hand touches the chin, moves forward and down.", referenceUrl: "https://www.lifeprint.com/asl101/pages-signs/t/thankyou.htm" },
  { word: "YES", note: "Fist nods up and down like a head saying yes.", referenceUrl: "https://www.lifeprint.com/asl101/pages-signs/y/yes.htm" },
  { word: "NO", note: "Index and middle fingers tap down onto the thumb.", referenceUrl: "https://www.lifeprint.com/asl101/pages-signs/n/no.htm" },
  { word: "PLEASE", note: "Flat palm circles on the chest.", referenceUrl: "https://www.lifeprint.com/asl101/pages-signs/p/please.htm" },
  { word: "SORRY", note: "Fist circles over the heart.", referenceUrl: "https://www.lifeprint.com/asl101/pages-signs/s/sorry.htm" },
  { word: "I LOVE YOU", note: "Thumb, index and pinky extended — combines I, L, Y.", referenceUrl: "https://www.lifeprint.com/asl101/pages-signs/i/iloveyou.htm" },
  { word: "GOOD MORNING", note: "Good + morning: hand off chin, arm rises like the sun.", referenceUrl: "https://www.signingsavvy.com/sign/GOOD%20MORNING" },
  { word: "GOODNIGHT", note: "Good + night: hands come together as the sun sets.", referenceUrl: "https://www.signingsavvy.com/sign/GOODNIGHT" },
  { word: "HELP", note: "Fist with thumb up rests on flat palm, lifts together.", referenceUrl: "https://www.lifeprint.com/asl101/pages-signs/h/help.htm" },
  { word: "STOP", note: "Flat hand chops down onto the open palm.", referenceUrl: "https://www.signingsavvy.com/sign/STOP" },
  { word: "MORE", note: "Flat hands tap fingertips together (often a first sign).", referenceUrl: "https://www.lifeprint.com/asl101/pages-signs/m/more.htm" },
  { word: "FINISH", note: "Open hands flip outward — done, all gone.", referenceUrl: "https://www.signingsavvy.com/sign/FINISH" },
  { word: "WATER", note: "W hand taps the chin.", referenceUrl: "https://www.lifeprint.com/asl101/pages-signs/w/water.htm" },
  { word: "EAT", note: "Flattened O hand taps the lips.", referenceUrl: "https://www.lifeprint.com/asl101/pages-signs/e/eat.htm" },
  { word: "DRINK", note: "C hand tips toward the mouth.", referenceUrl: "https://www.signingsavvy.com/sign/DRINK" },
  { word: "LEARN", note: "Hand lifts information from palm to the head.", referenceUrl: "https://www.lifeprint.com/asl101/pages-signs/l/learn.htm" },
  { word: "NAME", note: "H hands tap twice, one over the other.", referenceUrl: "https://www.lifeprint.com/asl101/pages-signs/n/name.htm" },
  { word: "YOUR", note: "B palm pushes forward toward the person.", referenceUrl: "https://www.signingsavvy.com/sign/YOUR" },
  { word: "MY", note: "Flat palm presses to the chest.", referenceUrl: "https://www.signingsavvy.com/sign/MY" },
  { word: "YOU", note: "Index finger points at the person.", referenceUrl: "https://www.signingsavvy.com/sign/YOU" },
  { word: "ME", note: "Index finger points at own chest.", referenceUrl: "https://www.signingsavvy.com/sign/ME" },
  { word: "UNDERSTAND", note: "Index flicks up beside the forehead — a lightbulb.", referenceUrl: "https://www.signingsavvy.com/sign/UNDERSTAND" },
  { word: "KNOW", note: "Fingertips tap the side of the forehead.", referenceUrl: "https://www.signingsavvy.com/sign/KNOW" },
];

export type LibraryRow = LibraryEntry & { status: LibraryStatus };

/** All library entries with the live status resolved from the sign store. */
export function libraryRows(): LibraryRow[] {
  const signs = new Map(
    listSigns().map((s) => [s.text.toUpperCase(), s] as const)
  );
  return ENTRIES.map(({ word, note, referenceUrl }) => {
    const s = signs.get(word);
    return {
      word,
      fingerspelling: word.split("").join(" "),
      note,
      referenceUrl,
      status: !s ? "fingerspelled" : s.builtin ? "builtin" : "taught",
    };
  });
}

/** Status for one word (case-insensitive), or null if it has no sign at all. */
export function taughtOrBuiltinStatus(word: string): LibraryStatus | null {
  const w = word.trim().toUpperCase();
  const s = listSigns().find((x) => x.text.toUpperCase() === w);
  if (!s) return null;
  return s.builtin ? "builtin" : "taught";
}

/** Single entry lookup, case-insensitive. */
export function libraryEntry(word: string): (LibraryEntry & { word: string }) | undefined {
  const w = word.trim().toUpperCase();
  const e = ENTRIES.find((x) => x.word === w);
  if (!e) return undefined;
  return { ...e, fingerspelling: e.word.split("").join(" ") };
}

/** Words the library knows that currently have no taught/built-in sign. */
export function untaughtLibraryWords(): string[] {
  const signed = new Set(listSigns().map((s) => s.text.toUpperCase()));
  return ENTRIES.map((e) => e.word).filter((w) => !signed.has(w));
}

/** Raw entries with the derived fingerspelling preview filled in. */
export const LIBRARY_ENTRIES: LibraryEntry[] = ENTRIES.map((e) => ({
  ...e,
  fingerspelling: e.word.split("").join(" "),
}));
