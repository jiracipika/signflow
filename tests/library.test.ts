import { test } from "node:test";
import assert from "node:assert/strict";
import {
  LIBRARY_ENTRIES,
  libraryRows,
  libraryEntry,
  taughtOrBuiltinStatus,
} from "../lib/signs/library.ts";

test("library has entries with word and reference link", () => {
  assert.ok(LIBRARY_ENTRIES.length >= 20, "too few library entries");
  for (const e of LIBRARY_ENTRIES) {
    assert.ok(e.word.length >= 2, `word too short: ${e.word}`);
    assert.ok(e.referenceUrl.startsWith("https://"), `bad ref url: ${e.referenceUrl}`);
    assert.ok(e.fingerspelling.length > 0, `no fingerspelling: ${e.word}`);
  }
});

test("libraryRows() resolves a status for every entry", () => {
  const rows = libraryRows();
  assert.equal(rows.length, LIBRARY_ENTRIES.length);
  for (const r of rows) {
    assert.ok(
      r.status === "taught" || r.status === "builtin" || r.status === "fingerspelled",
      `bad status: ${r.status}`
    );
  }
  // no-window env: I LOVE YOU is a builtin; words without builtins fingerspell
  assert.equal(rows.find((r) => r.word === "I LOVE YOU")?.status, "builtin");
  assert.equal(rows.find((r) => r.word === "HELLO")?.status, "fingerspelled");
});

test("words are unique and uppercase (avatar ?text= format)", () => {
  const words = LIBRARY_ENTRIES.map((e) => e.word);
  assert.equal(new Set(words).size, words.length, "duplicate words");
  for (const w of words) assert.equal(w, w.toUpperCase(), `not uppercase: ${w}`);
});

test("libraryEntry() is case-insensitive", () => {
  assert.equal(libraryEntry("HELLO")?.word, "HELLO");
  assert.equal(libraryEntry("hello")?.word, "HELLO");
  assert.equal(libraryEntry("zzzzz"), undefined);
});

test("taughtOrBuiltinStatus mirrors custom-signs state", () => {
  // In a no-window environment only built-ins exist, so I LOVE YOU is builtin
  // and there are no taught signs.
  assert.equal(taughtOrBuiltinStatus("I LOVE YOU"), "builtin");
  assert.equal(taughtOrBuiltinStatus("hello"), null);
});

test("every entry has a Lifeprint or Signing Savvy reference", () => {
  for (const e of LIBRARY_ENTRIES) {
    assert.ok(
      e.referenceUrl.includes("lifeprint.com") || e.referenceUrl.includes("signingsavvy.com"),
      `unexpected reference: ${e.referenceUrl}`
    );
  }
});
