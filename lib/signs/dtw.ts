// Dynamic Time Warping over normalized landmark-frame sequences,
// with a Sakoe-Chiba band. Returns path-normalized average per-frame distance.

function frameDist(a: Float64Array, b: Float64Array): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i];
    s += d * d;
  }
  return Math.sqrt(s);
}

export function dtwDistance(
  a: Float64Array[],
  b: Float64Array[]
): number {
  const n = a.length,
    m = b.length;
  if (n === 0 || m === 0) return Infinity;
  const w = Math.max(1, Math.floor(Math.max(n, m) / 4));
  const INF = Infinity;
  let prev = new Array<number>(m + 1).fill(INF);
  prev[0] = 0;
  for (let i = 1; i <= n; i++) {
    const cur = new Array<number>(m + 1).fill(INF);
    const lo = Math.max(1, i - w),
      hi = Math.min(m, i + w);
    for (let j = lo; j <= hi; j++) {
      const d = frameDist(a[i - 1], b[j - 1]);
      cur[j] = d + Math.min(prev[j], cur[j - 1], prev[j - 1]);
    }
    prev = cur;
  }
  if (prev[m] === Infinity) return Infinity;
  // normalize: average per-frame cost along the path
  return (prev[m] * 2) / (n + m);
}
