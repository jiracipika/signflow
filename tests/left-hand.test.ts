// Left-hand support + letter-model artifact tests.
//
// The runtime mirrors left-handed signers' landmarks onto the right-hand
// geometry the model was trained on (lib/features.ts mirrorLandmarks), and the
// exported model is retrained with mirror/shift/scale/rotation augmentation
// (scripts/train_asl_augmented.py). These pins keep both properties honest.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mirrorLandmarks, engineerFeatures } from "../lib/features.ts";
import { predictFeatures, type AslModel } from "../lib/model.ts";
import type { Landmark } from "../lib/types.ts";

const repo = join(dirname(fileURLToPath(import.meta.url)), "..");
const MODEL: AslModel = JSON.parse(
  readFileSync(join(repo, "public", "models", "asl-static-v1.json"), "utf8")
);

// A plausible right-hand "B" in MediaPipe image space (wrist low-center,
// fingers together pointing up, thumb folded across the palm).
function rightHandB(): Landmark[] {
  const pts: [number, number, number][] = [
    [0.5, 0.9, 0], [0.42, 0.78, 0], [0.38, 0.68, 0], [0.35, 0.6, 0], [0.33, 0.55, 0],
    [0.44, 0.56, 0], [0.44, 0.46, 0], [0.44, 0.38, 0], [0.44, 0.3, 0],
    [0.5, 0.55, 0], [0.5, 0.46, 0], [0.5, 0.38, 0], [0.5, 0.31, 0],
    [0.56, 0.56, 0], [0.56, 0.48, 0], [0.56, 0.41, 0], [0.56, 0.35, 0],
    [0.62, 0.58, 0], [0.62, 0.51, 0], [0.62, 0.46, 0], [0.62, 0.42, 0],
  ];
  return pts.map(([x, y, z]) => ({ x, y, z }));
}

test("mirrorLandmarks is an involution on x and preserves y/z", () => {
  const lm = rightHandB();
  const once = mirrorLandmarks(lm);
  const twice = mirrorLandmarks(once);
  for (let i = 0; i < 21; i++) {
    assert.ok(Math.abs(twice[i].x - lm[i].x) < 1e-12);
    assert.equal(twice[i].y, lm[i].y);
    assert.equal(twice[i].z, lm[i].z);
    assert.ok(once[i].x >= 0 && once[i].x <= 1, "mirrored x left the image");
  }
});

test("engineerFeatures of a hand and its mirror agree on the mirror-invariant dims", () => {
  // derived dims 63-67 (tip-wrist distances), 68-71 (tip spreads), 73-77
  // (tip-MCP curls), 83-85 (angles, span) are distances/angles: invariant.
  const a = engineerFeatures(rightHandB());
  const b = engineerFeatures(mirrorLandmarks(rightHandB()));
  for (const i of [63, 64, 65, 66, 67, 68, 69, 70, 71, 73, 74, 75, 76, 77, 84, 85]) {
    assert.ok(Math.abs(a[i] - b[i]) < 1e-9, `dim ${i} not mirror-invariant: ${a[i]} vs ${b[i]}`);
  }
});

test("letter model artifact: 24 static letters, augmented-training provenance", () => {
  assert.equal(MODEL.format, "signflow-asl-static-v1");
  assert.equal(MODEL.letters.length, 24);
  assert.ok(!MODEL.letters.includes("J") && !MODEL.letters.includes("Z"), "J/Z must stay out of the static model");
  const meta = MODEL.meta as Record<string, unknown>;
  assert.ok(String(meta.augmentation).includes("mirror"), "model must be mirror-augmented");
  assert.ok(
    typeof meta.mirrored_test_accuracy === "number" && (meta.mirrored_test_accuracy as number) >= 0.9,
    `mirrored held-out accuracy ${(meta.mirrored_test_accuracy as number)} below the 0.9 floor`
  );
  assert.ok(
    typeof meta.test_accuracy === "number" && (meta.test_accuracy as number) >= 0.9,
    `held-out accuracy ${(meta.test_accuracy as number)} below the 0.9 floor`
  );
});

test("the model classifies a right-hand B and its mirror identically", () => {
  const lm = rightHandB();
  const p1 = predictFeatures(engineerFeatures(lm), MODEL);
  const p2 = predictFeatures(engineerFeatures(mirrorLandmarks(lm)), MODEL);
  assert.equal(p1.letter, "B", `right-hand B classified as ${p1.letter}`);
  assert.equal(p2.letter, p1.letter, "mirrored input changed the letter");
});
