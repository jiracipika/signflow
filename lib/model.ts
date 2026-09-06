// Pure-TS forward pass for the exported ASL static-letter MLP.
// Model file: public/models/asl-static-v1.json (86 in, 24 classes out).

import { engineerFeatures, type Landmark } from "./features.ts";

type Layer = { W: number[][]; b: number[] }; // W[i][j]: input i -> output j
export type AslModel = {
  format: string;
  letters: string[];
  mean: number[];
  std: number[];
  layers: Layer[];
  meta: Record<string, unknown>;
};

export type Prediction = {
  letter: string; // argmax letter, "" if below threshold handled by caller
  confidence: number;
  probabilities: Record<string, number>;
  letters: string[];
};

let cached: AslModel | null = null;

export async function loadModel(
  url = "/models/asl-static-v1.json"
): Promise<AslModel> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Model fetch failed: ${res.status}`);
  const m = (await res.json()) as AslModel;
  cached = m;
  return m;
}

export function getModel(): AslModel {
  if (!cached) throw new Error("Model not loaded — call loadModel() first");
  return cached;
}

export function predictLandmarks(
  lm: Landmark[],
  model?: AslModel
): Prediction {
  return predictFeatures(engineerFeatures(lm), model);
}

export function predictFeatures(
  features: Float64Array | number[],
  model?: AslModel
): Prediction {
  const m = model ?? getModel();
  let x = new Float64Array(features.length);
  for (let i = 0; i < features.length; i++)
    x[i] = (features[i] - m.mean[i]) / m.std[i];

  const L = m.layers;
  for (let li = 0; li < L.length; li++) {
    const { W, b } = L[li];
    const nOut = b.length;
    const out = new Float64Array(nOut);
    for (let j = 0; j < nOut; j++) out[j] = b[j];
    for (let i = 0; i < x.length; i++) {
      const xi = x[i];
      if (xi === 0) continue;
      const row = W[i];
      for (let j = 0; j < nOut; j++) out[j] += xi * row[j];
    }
    if (li < L.length - 1) {
      for (let j = 0; j < nOut; j++) if (out[j] < 0) out[j] = 0;
    }
    x = out;
  }

  // softmax
  let max = -Infinity;
  for (let i = 0; i < x.length; i++) if (x[i] > max) max = x[i];
  let sum = 0;
  const probs = new Float64Array(x.length);
  for (let i = 0; i < x.length; i++) {
    probs[i] = Math.exp(x[i] - max);
    sum += probs[i];
  }
  let argmax = 0;
  for (let i = 1; i < probs.length; i++) if (probs[i] > probs[argmax]) argmax = i;

  const probabilities: Record<string, number> = {};
  for (let i = 0; i < m.letters.length; i++)
    probabilities[m.letters[i]] = probs[i] / sum;

  return {
    letter: m.letters[argmax],
    confidence: probs[argmax] / sum,
    probabilities,
    letters: m.letters,
  };
}
