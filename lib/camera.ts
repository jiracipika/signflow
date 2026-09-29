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
  /** Anatomical hand the signer prefers to use. */
  dominantHand?: "right" | "left";
  /** user preference: mirror preview (front camera default true) */
  mirrored?: boolean;
  /** prefer rear camera */
  facingMode?: "user" | "environment";
};

export function useHandTracking(
  { onFrame, dominantHand = "right" }: UseHandTrackingOptions,
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
  const fpsCountRef = useRef(0);
  const fpsStartedAtRef = useRef(0);
  const targetFps = opts?.fps ?? 30;
  const requestRef = useRef(0);
  const startingRef = useRef(false);

  const stop = useCallback(() => {
    requestRef.current++;
    startingRef.current = false;
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    lastTsRef.current = -1;
    fpsCountRef.current = 0;
    fpsStartedAtRef.current = 0;
    setStatus("idle");
    setFps(0);
  }, []);

  // keep latest callbacks/params in refs so the rAF loop identity is stable
  const onFrameRef = useRef(onFrame);
  const targetFpsRef = useRef(targetFps);
  const dominantHandRef = useRef(dominantHand);
  useEffect(() => {
    onFrameRef.current = onFrame;
    targetFpsRef.current = targetFps;
    dominantHandRef.current = dominantHand;
  });

  const loopRef = useRef<() => void>(() => {});
  useEffect(() => {
    const step = () => {
      if (!streamRef.current) return;
      const v = videoRef.current;
      const lmk = landmarkerRef.current;
      if (!v || !lmk || v.readyState < 2) {
        rafRef.current = requestAnimationFrame(step);
        return;
      }
      const now = performance.now();
      if (now < nextAllowedRef.current || v.currentTime === lastTsRef.current) {
        rafRef.current = requestAnimationFrame(step);
        return;
      }
      nextAllowedRef.current = now + 1000 / targetFpsRef.current - 2;
      lastTsRef.current = v.currentTime;
      const res = lmk.detectForVideo(v, now);
      fpsCountRef.current++;
      if (now - fpsStartedAtRef.current >= 1000) {
        setFps(Math.round((fpsCountRef.current * 1000) / (now - fpsStartedAtRef.current)));
        fpsCountRef.current = 0;
        fpsStartedAtRef.current = now;
      }
      if (res.landmarks && res.landmarks.length > 0) {
        // MediaPipe assumes mirrored selfie input for handedness. Camera
        // frames here are raw/unmirrored, so its Left/Right labels are swapped.
        const categories = res.handednesses ?? [];
        const desiredCategory = dominantHandRef.current === "right" ? "Left" : "Right";
        const selectedIndex = categories.findIndex(
          (categoriesForHand) => categoriesForHand[0]?.categoryName === desiredCategory
        );
        const handIndex = selectedIndex >= 0 ? selectedIndex : 0;
        const category = categories[handIndex]?.[0]?.categoryName;
        const handedness = category
          ? category === "Left" ? "Right" : "Left"
          : dominantHandRef.current === "right" ? "Right" : "Left";
        onFrameRef.current({
          landmarks: res.landmarks[handIndex] as Landmark[],
          handedness,
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
      if (startingRef.current || streamRef.current) return;
      startingRef.current = true;
      const request = ++requestRef.current;
      const isCurrent = () => request === requestRef.current;
      setStatus("requesting");
      setError(null);
      try {
        fpsCountRef.current = 0;
        fpsStartedAtRef.current = performance.now();
        nextAllowedRef.current = 0;
        // load model once
        if (!landmarkerRef.current) {
          setStatus("model-loading");
          const fileset = await FilesetResolver.forVisionTasks(
            "/mediapipe/wasm"
          );
          const options = {
            baseOptions: { modelAssetPath: "/mediapipe/hand_landmarker.task" },
            runningMode: "VIDEO" as const,
            numHands: 2,
          };
          let task: HandLandmarker;
          try {
            task = await HandLandmarker.createFromOptions(
              fileset,
              { ...options, baseOptions: { ...options.baseOptions, delegate: "GPU" } }
            );
          } catch {
            // Some browsers expose WebGL but cannot create this task's GPU
            // delegate. CPU inference is slower, but still keeps tracking usable.
            task = await HandLandmarker.createFromOptions(fileset, options);
          }
          if (!isCurrent()) { task.close(); return; }
          landmarkerRef.current = task;
        }
        if (!isCurrent()) return;
        setStatus("requesting");
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode,
            width: { ideal: 640 },
            frameRate: 30,
          },
          audio: false,
        });
        if (!isCurrent()) { stream.getTracks().forEach((track) => track.stop()); return; }
        streamRef.current = stream;
        const v = videoRef.current;
        if (!v) throw new Error("Video element missing");
        v.srcObject = stream;
        await v.play();
        if (!isCurrent()) return;
        startingRef.current = false;
        fpsCountRef.current = 0;
        fpsStartedAtRef.current = performance.now();
        setStatus("running");
        rafRef.current = requestAnimationFrame(loop);
      } catch (e) {
        if (!isCurrent()) return;
        const msg = e instanceof Error ? e.message : String(e);
        const name = (e as { name?: string })?.name;
        stop();
        if (msg.toLowerCase().includes("permission") || name === "NotAllowedError")
          setStatus("denied");
        else {
          setError(msg);
          setStatus("error");
        }
      }
    },
    [loop, stop]
  );

  useEffect(() => {
    const requests = requestRef;
    return () => {
      requests.current++;
      startingRef.current = false;
      cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      landmarkerRef.current?.close();
      landmarkerRef.current = null;
    };
  }, []);

  return { videoRef, status, error, start, stop, fps };
}
