import { test } from "node:test";
import assert from "node:assert/strict";
import { createTranscript } from "../lib/transcript.ts";

test("letters append and uppercase-guard", () => {
  let t = createTranscript();
  t = t.apply({ type: "letter", letter: "h" });
  t = t.apply({ type: "letter", letter: "I" });
  t = t.apply({ type: "letter", letter: "!" }); // rejected
  assert.equal(t.text, "HI");
});

test("space semantics", () => {
  let t = createTranscript();
  t = t.apply({ type: "space" }); // no leading space
  assert.equal(t.text, "");
  t = t.apply({ type: "letter", letter: "H" });
  t = t.apply({ type: "space" });
  t = t.apply({ type: "space" }); // no double space
  assert.equal(t.text, "H ");
});

test("delete removes last char", () => {
  let t = createTranscript();
  t = t.apply({ type: "letter", letter: "H" }).apply({ type: "letter", letter: "I" });
  t = t.apply({ type: "delete" });
  assert.equal(t.text, "H");
  t = t.apply({ type: "delete" }).apply({ type: "delete" });
  assert.equal(t.text, "");
});

test("undo restores previous state and canUndo flag", () => {
  let t = createTranscript();
  assert.equal(t.canUndo, false);
  t = t.apply({ type: "letter", letter: "A" });
  t = t.apply({ type: "letter", letter: "B" });
  assert.equal(t.canUndo, true);
  t = t.apply({ type: "undo" });
  assert.equal(t.text, "A");
  t = t.apply({ type: "undo" });
  assert.equal(t.text, "");
  t = t.apply({ type: "undo" }); // no-op
  assert.equal(t.text, "");
});

test("clear snapshots for undo", () => {
  let t = createTranscript();
  t = t.apply({ type: "letter", letter: "X" });
  t = t.apply({ type: "clear" });
  assert.equal(t.text, "");
  t = t.apply({ type: "undo" });
  assert.equal(t.text, "X");
});

test("manual replace canonicalizes spaces", () => {
  let t = createTranscript();
  t = t.apply({ type: "manual", text: "  hello   world  " });
  assert.equal(t.text, "hello world ");
});

test("currentWord", () => {
  let t = createTranscript();
  t = t.apply({ type: "manual", text: "hello wor" });
  assert.equal(t.currentWord(), "wor");
  t = t.apply({ type: "manual", text: "end " });
  assert.equal(t.currentWord(), "");
});

test("acceptSuggestion replaces word, preserves capitalization", () => {
  let t = createTranscript();
  t = t.apply({ type: "manual", text: "hello wor" });
  t = t.acceptSuggestion("world");
  assert.equal(t.text, "hello world");
  t = t.apply({ type: "manual", text: "Wor" });
  t = t.acceptSuggestion("world");
  assert.equal(t.text, "World");
});
