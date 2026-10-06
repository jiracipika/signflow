// Movement-letter (J/Z) trajectory recognition tests. The watcher is fed
// synthetic raw-camera-space landmark frames; only lm 0/8/9/20 are read.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MotionLetterWatcher,
  classifyLetterPath,
  MIN_PATH,
  START_SPEED,
} from "../lib/signs/motion-letters.ts";
import type { Landmark } from "../lib/types.ts";

// Camera space = horizontal mirror of signer space (raw webcam image).
const toCamera = (s: [number, number][]) => s.map(([x, y]) => [1 - x, y] as [number, number]);

const STROKES: Record<string, [number, number][]> = {
  J: [
    [0.62, 0.1], [0.62, 0.45], [0.62, 0.7], [0.58, 0.84], [0.46, 0.9],
    [0.34, 0.86], [0.28, 0.74], [0.3, 0.62],
  ],
  Z: [
    [0.25, 0.18], [0.75, 0.18], [0.3, 0.82], [0.8, 0.82],
  ],
};

// Palm: wrist (0.5,0.5), middle-MCP (0.6,0.5) -> palm length 0.1 image units.
function makeLm(idx: [number, number], pnk: [number, number]): Landmark[] {
  const lm: Landmark[] = Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.5, z: 0 }));
  lm[9] = { x: 0.6, y: 0.5, z: 0 };
  lm[8] = { x: 0.5 + idx[0] * 0.1, y: 0.5 + idx[1] * 0.1, z: 0 };
  lm[20] = { x: 0.5 + pnk[0] * 0.1, y: 0.5 + pnk[1] * 0.1, z: 0 };
  return lm;
}

function mulberry(seed: number) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t ^ (t >>> 7) | 0) / 1;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Trace a stroke (palm units) at `speed` palm/s, 30fps; returns emitted letters.
function trace(
  strokeCam: [number, number][],
  { scale = 1, jitter = 0, seed = 1, speed = 2.2 } = {}
): string[] {
  const rand = mulberry(seed);
  const path = strokeCam.map(
    ([x, y]) => [x * scale + (rand() * 2 - 1) * jitter, y * scale + (rand() * 2 - 1) * jitter] as [number, number]
  );
  const step = speed / 30;
  const cur: [number, number] = [...path[0]] as [number, number];
  const frames: [number, number][] = [[...cur]];
  for (let i = 1; i < path.length; i++) {
    let guard = 0;
    while (Math.hypot(path[i][0] - cur[0], path[i][1] - cur[1]) >= step && guard++ < 500) {
      const d = Math.hypot(path[i][0] - cur[0], path[i][1] - cur[1]);
      cur[0] += ((path[i][0] - cur[0]) / d) * step;
      cur[1] += ((path[i][1] - cur[1]) / d) * step;
      frames.push([...cur] as [number, number]);
    }
    cur[0] = path[i][0];
    cur[1] = path[i][1];
    frames.push([...cur] as [number, number]);
  }
  const t = new MotionLetterWatcher();
  const emitted: string[] = [];
  let ms = 0;
  const parked: [number, number] = [0.4, 0.35];
  for (const f of frames) {
    ms += 1000 / 30;
    const r = t.feed(makeLm(f, parked), ms);
    if (r) emitted.push(r);
  }
  for (let i = 0; i < 12; i++) {
    ms += 1000 / 30;
    const r = t.feed(makeLm(cur, parked), ms);
    if (r) emitted.push(r);
  }
  return emitted;
}

const J_CAM = toCamera(STROKES.J).map(([x, y]) => [x * 2 - 1, y * 2 - 0.9] as [number, number]);
const Z_CAM = toCamera(STROKES.Z).map(([x, y]) => [x * 2.4 - 1.2, y * 2.4 - 1.2] as [number, number]);

test("a traced Z is recognized", () => {
  const got = trace(Z_CAM, { seed: 2 });
  assert.ok(got.includes("Z"), `expected Z, got ${JSON.stringify(got)}`);
});

test("a traced J is recognized", () => {
  const got = trace(J_CAM, { seed: 3 });
  assert.ok(got.includes("J"), `expected J, got ${JSON.stringify(got)}`);
});

test("strokes survive scale change and small jitter", () => {
  assert.ok(trace(Z_CAM, { scale: 0.75, jitter: 0.01, seed: 4 }).includes("Z"));
  assert.ok(trace(J_CAM, { scale: 1.35, jitter: 0.012, seed: 5 }).includes("J"));
});

test("a stationary hand emits nothing", () => {
  const t = new MotionLetterWatcher();
  const still = makeLm([0.35, 0.4], [0.4, 0.35]);
  let ms = 0;
  for (let i = 0; i < 90; i++) {
    ms += 33;
    assert.equal(t.feed(still, ms), null, "emitted on a still hand");
  }
});

test("a hand disappearing mid-trace judges the stroke (lost)", () => {
  const t = new MotionLetterWatcher();
  let ms = 0;
  const step = 2.2 / 30;
  const cur: [number, number] = [...Z_CAM[0]] as [number, number];
  ms += 33;
  t.feed(makeLm(cur, [0.4, 0.35]), ms);
  for (let i = 1; i < Z_CAM.length; i++) {
    let guard = 0;
    while (Math.hypot(Z_CAM[i][0] - cur[0], Z_CAM[i][1] - cur[1]) >= step && guard++ < 500) {
      const d = Math.hypot(Z_CAM[i][0] - cur[0], Z_CAM[i][1] - cur[1]);
      cur[0] += ((Z_CAM[i][0] - cur[0]) / d) * step;
      cur[1] += ((Z_CAM[i][1] - cur[1]) / d) * step;
      ms += 33;
      t.feed(makeLm(cur, [0.4, 0.35]), ms);
    }
    cur[0] = Z_CAM[i][0];
    cur[1] = Z_CAM[i][1];
    ms += 33;
    t.feed(makeLm(cur, [0.4, 0.35]), ms);
  }
  assert.equal(t.lost(), "Z", "a completed Z trace must commit when the hand leaves");
});

test("a scribble shorter than MIN_PATH is ignored", () => {
  const tiny: [number, number][] = [[0, 0], [0.15, 0.05], [0.3, 0], [0.45, 0.05]];
  assert.deepEqual(trace(tiny, { seed: 6 }), []);
});

test("classifyLetterPath rejects degenerate input and a straight line", () => {
  assert.equal(classifyLetterPath([]), null);
  assert.equal(classifyLetterPath(null as unknown as [number, number][]), null);
  const line: [number, number][] = [[0, 0], [0.3, 0], [0.6, 0], [0.9, 0]];
  assert.equal(classifyLetterPath(line), null, "a straight line is not J or Z");
});

test("classifyPath is direction-aware: reversed Z is not scored over a real Z", () => {
  const fwd = classifyLetterPath(Z_CAM);
  assert.equal(fwd?.letter, "Z");
  const rev = classifyLetterPath(Z_CAM.slice().reverse());
  assert.ok(!(rev && rev.letter === "Z" && rev.score <= (fwd?.score ?? 0)), "reversed Z outranked a real Z");
});

test("stroke sizes clear MIN_PATH with margin", () => {
  const len = (p: [number, number][]) => {
    let s = 0;
    for (let i = 1; i < p.length; i++) s += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]);
    return s;
  };
  assert.ok(len(Z_CAM) > MIN_PATH * 1.2);
  assert.ok(len(J_CAM) > MIN_PATH * 1.2);
  assert.ok(START_SPEED < 3);
});
