#!/usr/bin/env node
// Copies MediaPipe WASM runtime + hand landmarker model into public/mediapipe.
// Run via `npm run assets` (prebuild). Deterministic, exits non-zero on failure.

import { cpSync, mkdirSync, existsSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const wasmSrc = path.join(root, "node_modules", "@mediapipe", "tasks-vision", "wasm");
const dest = path.join(root, "public", "mediapipe", "wasm");

rmSync(path.join(root, "public", "mediapipe"), { recursive: true, force: true });
mkdirSync(dest, { recursive: true });
for (const f of [
  "vision_wasm_internal.js",
  "vision_wasm_internal.wasm",
  "vision_wasm_module_internal.js",
  "vision_wasm_module_internal.wasm",
  "vision_wasm_nosimd_internal.js",
  "vision_wasm_nosimd_internal.wasm",
]) {
  const src = `${wasmSrc}/${f}`;
  if (!existsSync(src)) throw new Error(`missing wasm asset: ${src}`);
  cpSync(src, path.join(dest, f));
}

// hand landmarker model (Apache-2.0, Google)
const modelUrl =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";
const modelDest = path.join(root, "public", "mediapipe", "hand_landmarker.task");
if (!existsSync(modelDest)) {
  const res = await fetch(modelUrl);
  if (!res.ok) throw new Error(`model download failed: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const { writeFileSync } = await import("node:fs");
  writeFileSync(modelDest, buf);
}
console.log("mediapipe assets ready:", dest);
