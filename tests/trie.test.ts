import { test } from "node:test";
import assert from "node:assert/strict";
import { WordTrie, buildTrieFromText } from "../lib/trie.ts";
import { COMMON_WORDS, buildDefaultSuggester } from "../lib/dictionary.ts";

test("suggest ranks by length then alpha", () => {
  const t = new WordTrie(["car", "card", "care", "carrot", "cart"]);
  assert.deepEqual(t.suggest("car"), ["car", "card", "care"]);
  // equal length after prefix: prefix-word itself wins
  const t2 = new WordTrie(["card", "care", "car"]);
  assert.deepEqual(t2.suggest("car"), ["car", "card", "care"]);
});

test("prefix itself counts when a word", () => {
  const t = new WordTrie(["train", "trainer"]);
  assert.deepEqual(t.suggest("train"), ["train", "trainer"]);
});

test("empty / unknown prefix -> no suggestions", () => {
  const t = buildDefaultSuggester();
  assert.deepEqual(t.suggest(""), []);
  assert.deepEqual(t.suggest("zzzzzz"), []);
});

test("case-insensitive", () => {
  const t = new WordTrie(["hello", "help"]);
  assert.deepEqual(t.suggest("hel"), ["help", "hello"]);
});

test("knows()", () => {
  const t = buildDefaultSuggester();
  assert.equal(t.knows("hello"), true);
  assert.equal(t.knows("HELLO"), true);
  assert.equal(t.knows("helloo"), false);
});

test("dictionary has reasonable size and no dups", () => {
  assert.ok(COMMON_WORDS.length > 700, `got ${COMMON_WORDS.length}`);
  const dupes = COMMON_WORDS.filter((w, i) => COMMON_WORDS.indexOf(w) !== i);
  assert.deepEqual(dupes, []);
});

test("buildTrieFromText", () => {
  const t = buildTrieFromText("cat catalog cow! dog; dog");
  assert.equal(t.knows("catalog"), true);
  assert.equal(t.knows("dog"), true);
  assert.equal(t.knows("cow"), true);
  assert.equal(t.knows("ca"), false);
});

test("suggestion flow after delete (trie side)", () => {
  const t = buildDefaultSuggester();
  // typing "hel" -> suggestions; delete one -> "he" -> new suggestions
  const s1 = t.suggest("hel");
  const s2 = t.suggest("he");
  assert.ok(s1.includes("hello") || s1.includes("help"));
  assert.ok(s2.length > 0);
  assert.notDeepEqual(s1, s2);
});
