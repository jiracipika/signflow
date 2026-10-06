// 86-feature engineering from 21 MediaPipe hand landmarks.
// Mirrors Siruyy/realtime-asl-recognizer feature_engineer.py (MIT) exactly,
// so the exported model applies to live landmark arrays.

export type Landmark = { x: number; y: number; z: number };

const WRIST = 0,
  THUMB_TIP = 4,
  INDEX_TIP = 8,
  MIDDLE_TIP = 12,
  RING_TIP = 16,
  PINKY_TIP = 20,
  THUMB_MCP = 2,
  INDEX_MCP = 5,
  MIDDLE_MCP = 9,
  RING_MCP = 13,
  PINKY_MCP = 17;

function pt(lm: Landmark[], i: number): [number, number, number] {
  const p = lm[i];
  return [p.x, p.y, p.z];
}

function dist(a: [number, number, number], b: [number, number, number]): number {
  const dx = a[0] - b[0],
    dy = a[1] - b[1],
    dz = a[2] - b[2];
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function angleBetween(
  v1: [number, number, number],
  v2: [number, number, number]
): number {
  const dot = v1[0] * v2[0] + v1[1] * v2[1] + v1[2] * v2[2];
  const n1 = Math.sqrt(v1[0] ** 2 + v1[1] ** 2 + v1[2] ** 2);
  const n2 = Math.sqrt(v2[0] ** 2 + v2[1] ** 2 + v2[2] ** 2);
  const cos = Math.min(1, Math.max(-1, dot / (n1 * n2 + 1e-8)));
  return (Math.acos(cos) * 180) / Math.PI;
}

function sub(
  a: [number, number, number],
  b: [number, number, number]
): [number, number, number] {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

/**
 * Mirror an image-space hand horizontally (x -> 1-x, relative depth kept).
 *
 * The letter model (and every built-in sign template) is trained/authored on
 * right-hand geometry. Left-handed signers produce horizontally flipped
 * landmarks, so the recognition path mirrors their frames onto right-hand
 * geometry first — same trick the augmented training uses, applied at runtime.
 * The overlay keeps drawing the raw landmarks so the skeleton stays glued to
 * the real hand on screen.
 */
export function mirrorLandmarks(lm: Landmark[]): Landmark[] {
  return lm.map((p) => ({ x: 1 - p.x, y: p.y, z: p.z }));
}

/** Returns the 86-dim feature vector for one hand's 21 landmarks. */
export function engineerFeatures(lm: Landmark[]): Float64Array {  const f = new Float64Array(86);
  let k = 0;

  // 1. raw landmarks (63)
  for (let i = 0; i < 21; i++) {
    f[k++] = lm[i].x;
    f[k++] = lm[i].y;
    f[k++] = lm[i].z;
  }

  const wrist = pt(lm, WRIST);
  const thumbTip = pt(lm, THUMB_TIP);
  const indexTip = pt(lm, INDEX_TIP);
  const middleTip = pt(lm, MIDDLE_TIP);
  const ringTip = pt(lm, RING_TIP);
  const pinkyTip = pt(lm, PINKY_TIP);
  const thumbMcp = pt(lm, THUMB_MCP);
  const indexMcp = pt(lm, INDEX_MCP);
  const middleMcp = pt(lm, MIDDLE_MCP);
  const ringMcp = pt(lm, RING_MCP);
  const pinkyMcp = pt(lm, PINKY_MCP);

  // 2. tip-wrist distances (5)
  for (const t of [thumbTip, indexTip, middleTip, ringTip, pinkyTip])
    f[k++] = dist(t, wrist);

  // 3. adjacent tip spread (4)
  f[k++] = dist(thumbTip, indexTip);
  f[k++] = dist(indexTip, middleTip);
  f[k++] = dist(middleTip, ringTip);
  f[k++] = dist(ringTip, pinkyTip);

  // 4. curl: tip-MCP distance (5)
  const mcps = [thumbMcp, indexMcp, middleMcp, ringMcp, pinkyMcp];
  const tips = [thumbTip, indexTip, middleTip, ringTip, pinkyTip];
  for (let i = 0; i < 5; i++) f[k++] = dist(tips[i], mcps[i]);

  // 5. palm vector components (3)
  const palm = sub(middleMcp, wrist);
  f[k++] = palm[0];
  f[k++] = palm[1];
  f[k++] = palm[2];

  // 6. finger angle vs palm (5)
  for (let i = 0; i < 5; i++) {
    f[k++] = angleBetween(sub(tips[i], mcps[i]), palm);
  }

  // 7. max tip span (1)
  let maxSpan = 0;
  for (let i = 0; i < 5; i++)
    for (let j = i + 1; j < 5; j++)
      maxSpan = Math.max(maxSpan, dist(tips[i], tips[j]));
  f[k++] = maxSpan;

  return f;
}
