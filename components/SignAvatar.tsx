"use client";

// Animated signing hand: renders 21-landmark poses as a stylized hand
// (filled palm, tapered capsule fingers, knuckle joints) with smooth
// interpolation, motion trails for J/Z tracing, and playback loop.

import { useEffect, useRef } from "react";

export type Pose = { x: number; y: number; z: number };

// finger chains: [mcp, pip, dip, tip]
const FINGERS: number[][] = [
  [1, 2, 3, 4], // thumb
  [5, 6, 7, 8],
  [9, 10, 11, 12],
  [13, 14, 15, 16],
  [17, 18, 19, 20],
];
const PALM_LOOP = [0, 1, 2, 5, 9, 13, 17];

function lerpPose(a: Pose[], b: Pose[], t: number): Pose[] {
  const e = t * t * (3 - 2 * t);
  return a.map((p, i) => ({
    x: p.x + (b[i].x - p.x) * e,
    y: p.y + (b[i].y - p.y) * e,
    z: p.z + (b[i].z - p.z) * e,
  }));
}

function drawHand(
  ctx: CanvasRenderingContext2D,
  pose: Pose[],
  w: number,
  h: number,
  opts: { mirrored: boolean; trail?: { x: number; y: number }[] }
) {
  // fit: poses are wrist-origin, palm-size-1
  let minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
  for (const p of pose) {
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
  }
  const span = Math.max(maxX - minX, maxY - minY, 0.8);
  const scale = (Math.min(w, h) * 0.62) / span;
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  const px = (p: Pose) => {
    let x = (p.x - cx) * scale + w / 2;
    const y = (p.y - cy) * scale + h / 2;
    if (opts.mirrored) x = w - x;
    return [x, y, scale] as const;
  };

  // motion trail (for J/Z)
  if (opts.trail && opts.trail.length > 1) {
    ctx.strokeStyle = "rgba(79,156,255,0.35)";
    ctx.lineWidth = 6;
    ctx.lineCap = "round";
    ctx.beginPath();
    opts.trail.forEach((t, i) => {
      const x = opts.mirrored ? w - t.x * w : t.x * w;
      const y = t.y * h;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }

  const P = pose.map(px);

  // palm
  ctx.fillStyle = "#1f2a44";
  ctx.strokeStyle = "#4f9cff";
  ctx.lineWidth = 2;
  ctx.beginPath();
  PALM_LOOP.forEach((i, k) => {
    const [x, y] = P[i];
    if (k === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // fingers as tapered capsules
  for (const [fi, chain] of FINGERS.entries()) {
    const baseR = fi === 0 ? 10 : 9 - fi * 0.7; // thumb thickest
    for (let j = 0; j < chain.length - 1; j++) {
      const [x1, y1] = P[chain[j]];
      const [x2, y2] = P[chain[j + 1]];
      const r1 = baseR * (1 - j * 0.2);
      const r2 = baseR * (1 - (j + 1) * 0.2);
      const ang = Math.atan2(y2 - y1, x2 - x1);
      ctx.beginPath();
      ctx.moveTo(x1 + Math.sin(ang) * r1, y1 - Math.cos(ang) * r1);
      ctx.lineTo(x2 + Math.sin(ang) * r2, y2 - Math.cos(ang) * r2);
      ctx.arc(x2, y2, r2, ang + Math.PI / 2, ang - Math.PI / 2, true);
      ctx.lineTo(x1 - Math.sin(ang) * r1, y1 + Math.cos(ang) * r1);
      ctx.arc(x1, y1, r1, ang - Math.PI / 2, ang + Math.PI / 2, true);
      ctx.closePath();
      ctx.fillStyle = "#2a3b5e";
      ctx.fill();
      ctx.strokeStyle = "#4f9cff";
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }

  // knuckle joints
  ctx.fillStyle = "#3d5a94";
  for (const chain of FINGERS)
    for (const i of chain) {
      const [x, y] = P[i];
      ctx.beginPath();
      ctx.arc(x, y, 3.2, 0, Math.PI * 2);
      ctx.fill();
    }
  // wrist dot
  const [wx, wy] = P[0];
  ctx.fillStyle = "#4f9cff";
  ctx.beginPath();
  ctx.arc(wx, wy, 5, 0, Math.PI * 2);
  ctx.fill();
}

export default function SignAvatar({
  currentPose,
  motion,
  mirrored = false,
  label,
}: {
  currentPose: Pose[] | null;
  motion?: Pose[][] | null;
  mirrored?: boolean;
  label?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const poseRef = useRef<Pose[] | null>(null);
  const targetRef = useRef<Pose[] | null>(null);
  const motionRef = useRef<Pose[][] | null>(null);
  const motionIdxRef = useRef(0);
  const trailRef = useRef<{ x: number; y: number }[]>([]);
  const rafRef = useRef(0);

  useEffect(() => {
    targetRef.current = currentPose ?? null;
    if (currentPose && poseRef.current === null) poseRef.current = currentPose;
  }, [currentPose]);
  useEffect(() => {
    motionRef.current = motion ?? null;
    motionIdxRef.current = 0;
    trailRef.current = [];
  }, [motion]);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;

    let lastT = 0;
    const step = (t: number) => {
      const dt = Math.min(64, t - lastT || 16);
      lastT = t;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = c.clientWidth, h = c.clientHeight;
      if (c.width !== w * dpr || c.height !== h * dpr) {
        c.width = w * dpr;
        c.height = h * dpr;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      const m = motionRef.current;
      if (m && m.length > 0) {
        const holdMs = 45;
        motionIdxRef.current += dt / holdMs;
        const i = Math.floor(motionIdxRef.current) % m.length;
        const cur = poseRef.current;
        poseRef.current = cur && cur.length === 21 ? lerpPose(cur, m[i], 0.5) : m[i];
        // trail from index fingertip (normalized coords for trail drawing)
        const tip = poseRef.current[8];
        trailRef.current.push({ x: tip.x, y: tip.y });
        if (trailRef.current.length > 28) trailRef.current.shift();
        drawHand(ctx, poseRef.current, w, h, { mirrored, trail: trailRef.current });
      } else {
        trailRef.current = [];
        const target = targetRef.current;
        const cur = poseRef.current;
        if (target && (!cur || cur.length !== 21)) poseRef.current = target;
        else if (target && cur) {
          const k = 1 - Math.pow(0.0025, dt / 1000);
          poseRef.current = lerpPose(cur, target, k);
        }
        drawHand(ctx, poseRef.current ?? target ?? [], w, h, { mirrored });
      }

      if (label) {
        ctx.fillStyle = "#f2f2f7";
        ctx.font = "700 26px ui-rounded, -apple-system, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(label, w / 2, h - 10);
      }
      rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafRef.current);
  }, [mirrored, label]);

  return (
    <canvas
      ref={canvasRef}
      aria-label={label ? `Avatar signing ${label}` : "Signing avatar"}
      style={{
        width: "100%",
        aspectRatio: "1",
        display: "block",
        background: "var(--card2)",
        borderRadius: "var(--radius)",
        border: "1px solid var(--border)",
      }}
    />
  );
}
