"use client";

// Signing avatar: renders hand poses (21 normalized landmarks) with smooth
// interpolation between letters, tracing motions for J/Z, and replay of
// taught dynamic signs. Pose data = real mean landmarks from the training
// dataset (see public/models/asl-poses-v1.json provenance).

import { useEffect, useRef } from "react";

export type Pose = { x: number; y: number; z: number };

const CONNECTIONS: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20],
  [0, 17],
];

function lerpPose(a: Pose[], b: Pose[], t: number): Pose[] {
  // smoothstep for nicer easing
  const e = t * t * (3 - 2 * t);
  return a.map((p, i) => ({
    x: p.x + (b[i].x - p.x) * e,
    y: p.y + (b[i].y - p.y) * e,
    z: p.z + (b[i].z - p.z) * e,
  }));
}

/** Avatar canvas. Props:
 *  - currentPose: target pose to display (letter shape)
 *  - motion: optional full frame sequence to play (dynamic sign replay)
 */
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
  const rafRef = useRef(0);

  useEffect(() => {
    targetRef.current = currentPose ?? null;
    if (currentPose && poseRef.current === null) poseRef.current = currentPose;
  }, [currentPose]);
  useEffect(() => {
    motionRef.current = motion ?? null;
    motionIdxRef.current = 0;
  }, [motion]);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;

    const draw = (pose: Pose[] | null) => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = c.clientWidth,
        h = c.clientHeight;
      if (c.width !== w * dpr || c.height !== h * dpr) {
        c.width = w * dpr;
        c.height = h * dpr;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      if (!pose || pose.length < 21) return;

      // fit pose (roughly [0.2..0.8] box) into canvas with padding
      let minX = 1,
        minY = 1,
        maxX = 0,
        maxY = 0;
      for (const p of pose) {
        minX = Math.min(minX, p.x);
        maxX = Math.max(maxX, p.x);
        minY = Math.min(minY, p.y);
        maxY = Math.max(maxY, p.y);
      }
      const span = Math.max(maxX - minX, maxY - minY, 0.15);
      const scale = (Math.min(w, h) * 0.7) / span;
      const cx = (minX + maxX) / 2,
        cy = (minY + maxY) / 2;
      const px = (p: Pose) => {
        let x = (p.x - cx) * scale + w / 2;
        const y = (p.y - cy) * scale + h / 2;
        if (mirrored) x = w - x;
        return [x, y] as const;
      };

      // palm fill for depth
      ctx.fillStyle = "rgba(79, 156, 255, 0.08)";
      ctx.beginPath();
      const palmOrder = [0, 1, 2, 5, 9, 13, 17];
      palmOrder.forEach((i, k) => {
        const [x, y] = px(pose[i]);
        if (k === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.closePath();
      ctx.fill();

      ctx.strokeStyle = "#4f9cff";
      ctx.lineWidth = 3.5;
      ctx.lineCap = "round";
      for (const [a, b] of CONNECTIONS) {
        const [ax, ay] = px(pose[a]);
        const [bx, by] = px(pose[b]);
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(bx, by);
        ctx.stroke();
      }
      ctx.fillStyle = "#e8f4ff";
      for (const p of pose) {
        const [x, y] = px(p);
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, Math.PI * 2);
        ctx.fill();
      }
      if (label) {
        ctx.fillStyle = "#f2f2f7";
        ctx.font = "700 28px ui-rounded, -apple-system, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(label, w / 2, h - 12);
      }
    };

    let lastT = 0;
    const step = (t: number) => {
      const dt = Math.min(64, t - lastT || 16);
      lastT = t;

      // motion replay takes priority
      const m = motionRef.current;
      if (m && m.length > 0) {
        const holdMs = 45; // ~22fps playback
        motionIdxRef.current += dt / holdMs;
        const i = Math.floor(motionIdxRef.current) % m.length;
        // simple frame-hold playback with light smoothing to previous frame
        const cur = poseRef.current;
        poseRef.current = cur && cur.length === 21 ? lerpPose(cur, m[i], 0.5) : m[i];
        draw(poseRef.current);
        rafRef.current = requestAnimationFrame(step);
        return;
      }

      // otherwise ease toward target pose
      const target = targetRef.current;
      const cur = poseRef.current;
      if (!target) {
        draw(cur);
      } else if (!cur || cur.length !== 21) {
        poseRef.current = target;
        draw(target);
      } else {
        const k = 1 - Math.pow(0.0025, dt / 1000); // ~fast approach
        poseRef.current = lerpPose(cur, target, k);
        draw(poseRef.current);
      }
      rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafRef.current);
  }, [mirrored, label]);

  return <canvas ref={canvasRef} aria-label={label ? `Avatar signing ${label}` : "Signing avatar"} style={{ width: "100%", aspectRatio: "1", display: "block", background: "var(--card2)", borderRadius: "var(--radius)", border: "1px solid var(--border)" }} />;
}
