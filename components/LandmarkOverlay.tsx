"use client";

// Draws hand landmarks on an overlay canvas aligned with the mirrored video.

import { useEffect, useRef } from "react";
import type { Landmark } from "@/lib/types";

const CONNECTIONS: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20],
  [0, 17],
];

export default function LandmarkOverlay({
  landmarks,
  mirrored,
}: {
  landmarks: Landmark[] | null;
  mirrored: boolean;
}) {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = c.clientWidth,
      h = c.clientHeight;
    if (c.width !== w * dpr || c.height !== h * dpr) {
      c.width = w * dpr;
      c.height = h * dpr;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    if (!landmarks || landmarks.length < 21) return;

    const px = (l: Landmark) => {
      const x = mirrored ? 1 - l.x : l.x;
      return [x * w, l.y * h] as const;
    };

    ctx.strokeStyle = "rgba(79, 156, 255, 0.9)";
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    for (const [a, b] of CONNECTIONS) {
      const [ax, ay] = px(landmarks[a]);
      const [bx, by] = px(landmarks[b]);
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
      ctx.stroke();
    }
    ctx.fillStyle = "#e8f4ff";
    for (const l of landmarks) {
      const [x, y] = px(l);
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    // wrist highlight
    const [wx, wy] = px(landmarks[0]);
    ctx.fillStyle = "#4f9cff";
    ctx.beginPath();
    ctx.arc(wx, wy, 5, 0, Math.PI * 2);
    ctx.fill();
  }, [landmarks, mirrored]);

  return <canvas ref={ref} aria-hidden="true" />;
}
