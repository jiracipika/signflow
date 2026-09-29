import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";
import ts from "typescript";

// Exercise the hook's async resource lifecycle with controlled camera promises.
// Effects run once, as on mount; UI rendering is outside these resource tests.
function harness(waitForCamera = false) {
  const effects: (() => void | (() => void))[] = [];
  const frames = new Map<number, () => void>();
  let frameId = 0, time = 0, requests = 0, stopped = 0, closed = 0, detected = 0;
  let resolveCamera!: (stream: unknown) => void;
  const stream = { getTracks: () => [{ stop: () => stopped++ }] };
  const pending = new Promise((resolve) => { resolveCamera = resolve; });
  const task = { close: () => closed++, detectForVideo: () => { detected++; return { landmarks: [] }; } };
  const react = {
    useRef: (current: unknown) => ({ current }),
    useState: (initial: unknown) => [initial, () => {}],
    useCallback: (callback: unknown) => callback,
    useEffect: (effect: () => void | (() => void)) => effects.push(effect),
  };
  const context = createContext({
    exports: {},
    require: (name: string) => name === "react" ? react : {
      FilesetResolver: { forVisionTasks: async () => ({}) },
      HandLandmarker: { createFromOptions: async () => task },
    },
    navigator: { mediaDevices: { getUserMedia: async () => { requests++; return waitForCamera ? pending : stream; } } },
    performance: { now: () => time += 40 },
    requestAnimationFrame: (callback: () => void) => { frames.set(++frameId, callback); return frameId; },
    cancelAnimationFrame: (id: number) => frames.delete(id),
  });
  const code = ts.transpileModule(readFileSync(new URL("../lib/camera.ts", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  runInContext(code, context);
  const hook = context.exports.useHandTracking({ onFrame: () => {} });
  const cleanups = effects.map(effect => effect());
  hook.videoRef.current = { srcObject: null, readyState: 2, currentTime: 0, play: async () => {} };
  return {
    hook, stream,
    resolve: () => resolveCamera(stream),
    unmount: () => cleanups.forEach(cleanup => cleanup?.()),
    tick: () => { const entry = frames.entries().next().value; if (entry) { frames.delete(entry[0]); entry[1](); } },
    stats: () => ({ requests, stopped, closed, detected, frames: frames.size }),
  };
}

test("camera tracks and model close when a running hook unmounts", async () => {
  const h = harness();
  await h.hook.start();
  h.unmount();
  assert.equal(h.stats().stopped, 1);
  assert.equal(h.stats().closed, 1);
  assert.equal(h.stats().frames, 0);
});

test("camera permission resolving after unmount releases the late stream", async () => {
  const h = harness(true);
  const starting = h.hook.start();
  await new Promise(setImmediate);
  h.unmount();
  h.resolve();
  await starting;
  assert.equal(h.stats().stopped, 1);
  assert.equal(h.hook.videoRef.current.srcObject, null);
  assert.equal(h.stats().frames, 0);
});

test("duplicate starts share one active camera request", async () => {
  const h = harness(true);
  const first = h.hook.start();
  const second = h.hook.start();
  await new Promise(setImmediate);
  assert.equal(h.stats().requests, 1);
  h.resolve();
  await Promise.all([first, second]);
  h.unmount();
});

test("stop cancels pending camera acquisition", async () => {
  const h = harness(true);
  const starting = h.hook.start();
  await new Promise(setImmediate);
  h.hook.stop();
  h.resolve();
  await starting;
  assert.equal(h.stats().stopped, 1);
  assert.equal(h.stats().frames, 0);
  h.unmount();
});

test("unchanged video frames are not submitted twice to recognition", async () => {
  const h = harness();
  await h.hook.start();
  h.tick(); h.tick(); h.tick(); h.tick();
  assert.equal(h.stats().detected, 1);
  h.hook.videoRef.current.currentTime = 0.1;
  h.tick();
  assert.equal(h.stats().detected, 2);
  h.unmount();
});
