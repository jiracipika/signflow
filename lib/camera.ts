// Camera + MediaPipe HandLandmarker wiring. All processing on-device.
// WASM files are copied into public/mediapipe/wasm at build time (see
// next.config.ts webpack hack + scripts/copy-mediapipe.mjs).

"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { FilesetResolver, HandLandmarker } from "@mediapipe/tasks-vision";
import type { HandFrame, Landmark } from "./types";

export type CameraStatus =
  | "idle"
  | "requesting"
  | "denied"
  | "running"
  | "model-loading"
  | "error";

export type UseHandTrackingOptions = {
  onFrame: (frame: HandFrame | null) => void;
  /** user preference: mirror preview (front camera default true) */
  mirrored?: boolean;
  /** prefer rear camera */
  facingMode?: "user" | "environment";
};

export function useHandTracking(
  { onFrame }: UseHandTrackingOptions,
  opts?: { fps?: number }
) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [status, setStatus] = useState<CameraStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const landmarkerRef = useRef<HandLandmarker | null>(null);
  const rafRef = useRef<number>(0);
  const lastTsRef = useRef<number>(-1);
  const nextAllowedRef = useRef<number>(0);
  const [fps, setFps] = useState(0);
  const targetFps = opts?.fps ?? 30;

  const stop = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    lastTsRef.current = -1;
    setStatus("idle");
    setFps(0);
  }, []);

  // keep latest callbacks/params in refs so the rAF loop identity is stable
  const onFrameRef = useRef(onFrame);
  const targetFpsRef = useRef(targetFps);
  useEffect(() => {
    onFrameRef.current = onFrame;
    targetFpsRef.current = targetFps;
  });

  const loopRef = useRef<() => void>(() => {});
  useEffect(() => {
    const step = () => {
      const v = videoRef.current;
      const lmk = landmarkerRef.current;
      if (!v || !lmk || v.readyState < 2) {
        rafRef.current = requestAnimationFrame(step);
        return;
      }
      const now = performance.now();
      if (now < nextAllowedRef.current) {
        rafRef.current = requestAnimationFrame(step);
        return;
      }
      nextAllowedRef.current = now + 1000 / targetFpsRef.current - 2;
      const res = lmk.detectForVideo(v, now);
      if (res.landmarks && res.landmarks.length > 0) {
        const handedness = res.handednesses?.[0]?.[0]?.categoryName;
        onFrameRef.current({
          landmarks: res.landmarks[0] as Landmark[],
          handedness: handedness === "Left" ? "Left" : "Right",
          timestampMs: now,
        });
      } else {
        onFrameRef.current(null);
      }
      rafRef.current = requestAnimationFrame(step);
    };
    loopRef.current = step;
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  const loop = useCallback(() => {
    rafRef.current = requestAnimationFrame(() => loopRef.current());
  }, []);

  const start = useCallback(
    async (facingMode: "user" | "environment" = "user") => {
      setStatus("requesting");
      setError(null);
      try {
        // load model once
        if (!landmarkerRef.current) {
          setStatus("model-loading");
          const fileset = await FilesetResolver.forVisionTasks(
            "/mediapipe/wasm"
          );
          landmarkerRef.current = await HandLandmarker.createFromOptions(
            fileset,
            {
              baseOptions: {
                modelAssetPath: "/mediapipe/hand_landmarker.task",
                delegate: "GPU",
              },
              runningMode: "VIDEO",
              numHands: 1,
            }
          );
        }
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode,
            width: { ideal: 640 },
            frameRate: 30,
          },
          audio: false,
});
        streamRef.current = stream;
        const v = videoRef.current;
        if (!v) throw new Error("Video element missing");
        v.srcObject = stream;
        await v.play();
        setStatus("running");
        rafRef.current = requestAnimationFrame(loop);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        const name = (e as { name?: string })?.name;
        if (msg.toLowerCase().includes("permission") || name === "NotAllowedError")
          setStatus("denied");
        else setError(msg);
        setStatus((s) => (s === "denied" ? s : "error"));
        stop();
      }
    },
    [loop, stop]
  );

  useEffect(() => {
    const stream = streamRef.current;
    const lmk = landmarkerRef.current;
    return () => {
      cancelAnimationFrame(rafRef.current);
      stream?.getTracks().forEach((t) => t.stop());
      lmk?.close?.();
    };
  }, []);

  return { videoRef, status, error, start, stop, fps };
}
