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
  const targetRef = useRef<Landmark[] | null>(landmarks);
  const smoothRef = useRef<Landmark[] | null>(null);

  useEffect(() => {
    targetRef.current = landmarks;
  }, [landmarks]);

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    let raf = 0;
    let previousTime = 0;
    const step = (time: number) => {
      const dt = previousTime ? Math.min(64, time - previousTime) : 16;
      previousTime = time;
      const target = targetRef.current;
      if (target && target.length >= 21) {
        const current = smoothRef.current;
        if (!current || current.length !== target.length) {
          smoothRef.current = target.map((p) => ({ ...p }));
        } else {
          // Blend 10 Hz inference updates across display frames so the skeleton
          // follows the hand continuously without lagging behind it.
          const blend = 1 - Math.exp(-dt / 42);
          for (let i = 0; i < target.length; i++) {
            current[i].x += (target[i].x - current[i].x) * blend;
            current[i].y += (target[i].y - current[i].y) * blend;
            current[i].z += (target[i].z - current[i].z) * blend;
          }
        }
      } else {
        smoothRef.current = null;
      }

      const video = c.parentElement?.querySelector("video");
      const videoWidth = video?.videoWidth ?? 0;
      const videoHeight = video?.videoHeight ?? 0;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = c.clientWidth, h = c.clientHeight;
      if (c.width !== w * dpr || c.height !== h * dpr) {
        c.width = w * dpr;
        c.height = h * dpr;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const points = smoothRef.current;
      if (points) {
        // The preview uses object-fit: cover. Match its crop so the skeleton stays
        // on the fingers instead of drifting whenever the aspect ratios differ.
        const sourceAspect = videoWidth && videoHeight ? videoWidth / videoHeight : w / h;
        const canvasAspect = w / h;
        const sourceW = sourceAspect > canvasAspect ? h * sourceAspect : w;
        const sourceH = sourceAspect > canvasAspect ? h : w / sourceAspect;
        const cropX = (w - sourceW) / 2;
        const cropY = (h - sourceH) / 2;
        const px = (l: Landmark) => {
          const x = mirrored ? 1 - l.x : l.x;
          return [cropX + x * sourceW, cropY + l.y * sourceH] as const;
        };

        ctx.shadowColor = "rgba(79, 156, 255, 0.45)";
        ctx.shadowBlur = 8;
        ctx.strokeStyle = "rgba(113, 183, 255, 0.92)";
        ctx.lineWidth = Math.max(1.6, Math.min(2.5, w / 220));
        ctx.lineCap = "round";
        for (const [a, b] of CONNECTIONS) {
          const [ax, ay] = px(points[a]);
          const [bx, by] = px(points[b]);
          ctx.beginPath();
          ctx.moveTo(ax, ay);
          ctx.lineTo(bx, by);
          ctx.stroke();
        }
        ctx.shadowBlur = 0;
        ctx.fillStyle = "#e8f4ff";
        for (let i = 0; i < points.length; i++) {
          const [x, y] = px(points[i]);
          ctx.beginPath();
          ctx.arc(x, y, i === 0 || [4, 8, 12, 16, 20].includes(i) ? 3.5 : 2.2, 0, Math.PI * 2);
          ctx.fill();
        }
        const [wx, wy] = px(points[0]);
        ctx.fillStyle = "#4f9cff";
        ctx.beginPath();
        ctx.arc(wx, wy, 5, 0, Math.PI * 2);
        ctx.fill();
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [mirrored]);

  return <canvas ref={ref} aria-hidden="true" />;
}
