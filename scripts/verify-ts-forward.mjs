#!/usr/bin/env node
// Verifies the exported JSON model through the REAL TypeScript forward pass
// (lib/model.ts predictFeatures) on the held-out test split.
import { readFileSync } from "node:fs";
import { predictFeatures } from "../lib/model.ts";

function loadNpy(path) {
  const b = readFileSync(path);
  const magic = [0x93, 0x4e, 0x55, 0x4d, 0x50, 0x59];
  for (let i = 0; i < 6; i++) if (b[i] !== magic[i]) throw new Error("not npy");
  const headerLen = b.readUInt16LE(8);
  const raw = b
      .toString("ascii", 10, 10 + headerLen)
      .replace(/'/g, '"')
      .replace(/False/g, "false")
      .replace(/True/g, "true")
      .replace(/\(/g, "[")
      .replace(/\)/g, "]")
      .replace(/\s+/g, "")
      .replace(/,]/g, "]")
      .replace(/,}/g, "}");
  const header = JSON.parse(raw);
  const n = header.shape.reduce((a, b) => a * b, 1);
  const bytesPer = header.descr.includes("f4") ? 4 : 8;
  const dv = new DataView(b.buffer, b.byteOffset + 10 + headerLen);
  const out = new Array(n);
  if (header.descr.includes("i8")) {
    for (let i = 0; i < n; i++) out[i] = Number(dv.getBigInt64(i * 8, true));
  } else {
    for (let i = 0; i < n; i++) out[i] = dv.getFloat64(i * bytesPer, true);
  }
  return { shape: header.shape, data: out };
}

const m = JSON.parse(readFileSync("public/models/asl-static-v1.json", "utf8"));
const X = loadNpy("/tmp/signflow-data/X_test.npy");
const y = loadNpy("/tmp/signflow-data/y_test.npy");
const letters = m.letters;

const staticIdx = new Map();
let k = 0;
for (let i = 0; i < 26; i++) {
  const c = String.fromCharCode(65 + i);
  if (c !== "J" && c !== "Z") staticIdx.set(i, k++);
}

// X_test ships pre-standardized with the DATASET's mean/std (Siruyy), but the
// exported model standardizes with its own raw-space training stats — so raw
// features must be reconstructed with the dataset constants, not the model's
const dmean = loadNpy("/tmp/signflow-data/mean.npy").data;
const dstd = loadNpy("/tmp/signflow-data/std.npy").data;

let correct = 0,
  total = 0;
const confusion = {};
for (let i = 0; i < X.shape[0]; i++) {
  const feat = X.data.slice(i * 86, (i + 1) * 86).map(
    (v, j) => v * dstd[j] + dmean[j]
  );
  const yi = y.data[i];
  if (!staticIdx.has(yi)) continue;
  const truth = letters[staticIdx.get(yi)];
  const pred = predictFeatures(feat, m).letter;
  if (pred === truth) correct++;
  else {
    const key = `${truth}->${pred}`;
    confusion[key] = (confusion[key] ?? 0) + 1;
  }
  total++;
}
console.log(
  "TS forward-pass accuracy:",
  (correct / total).toFixed(4),
  `(${total} samples)`
);
const top = Object.entries(confusion)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 12);
console.log("top confusions:", top);
