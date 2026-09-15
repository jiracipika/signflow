import { test } from "node:test";
import assert from "node:assert/strict";
import {
  listSigns,
  builtinSigns,
  matchStatic,
} from "../lib/signs/custom-signs.ts";
import type { Landmark } from "../lib/types.ts";

test("built-in signs include ILY plus YES and NO one-shape signs", () => {
  const builtins = builtinSigns();
  const labels = builtins.map((s) => s.text);
  assert.ok(labels.includes("I LOVE YOU"), "ILY missing");
  assert.ok(labels.includes("YES"), "YES missing");
  assert.ok(labels.includes("NO"), "NO missing");
  assert.ok(builtins.every((s) => s.builtin), "builtins must be flagged builtin");
  assert.ok(builtins.every((s) => s.kind === "static"), "builtins must be static");
  assert.equal(new Set(labels).size, labels.length, "duplicate builtin labels");
});

test("listSigns() (no window) exposes the built-ins for recognition", () => {
  const all = listSigns();
  for (const want of ["I LOVE YOU", "YES", "NO"]) {
    assert.ok(all.some((s) => s.text === want && s.builtin), `${want} not listed`);
  }
});

test("matchStatic returns near-zero distance for an exact ILY prototype probe", () => {
  // ILY pose, same coordinates as the template (normalizeFrame removes
  // translation/scale, so the raw pose matches its own prototype exactly).
  const ILY: [number, number, number][] = [
    [0.5, 0.9, 0], [0.38, 0.8, 0], [0.3, 0.7, 0.02], [0.27, 0.62, 0.04],
    [0.25, 0.55, 0.05], [0.42, 0.55, 0], [0.41, 0.45, 0], [0.4, 0.36, 0],
    [0.39, 0.27, 0], [0.5, 0.55, -0.01], [0.5, 0.48, 0.03], [0.5, 0.5, 0.08],
    [0.5, 0.52, 0.12], [0.58, 0.55, -0.01], [0.58, 0.48, 0.03], [0.58, 0.5, 0.08],
    [0.58, 0.52, 0.12], [0.66, 0.56, 0], [0.68, 0.46, 0.01], [0.7, 0.36, 0.02],
    [0.72, 0.27, 0.03],
  ];
  const probe: Landmark[] = ILY.map(([x, y, z]) => ({ x, y, z }));
  const m = matchStatic(probe);
  assert.ok(m, "no match for exact ILY pose");
  assert.equal(m.label, "I LOVE YOU");
  assert.ok(m.distance < 1e-3, `expected ~0 distance, got ${m.distance}`);
});
