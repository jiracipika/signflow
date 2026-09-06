"use client";

// Persisted app settings (localStorage). Keep in sync with Settings page.

import { useState } from "react";

export type Settings = {
  dominantHand: "right" | "left";
  mirrorPreview: boolean;
  showLandmarks: boolean;
  stabilityFrames: number; // decoder stability (frames), 3..12
  minConfidence: number; // 0.3..0.8
  autoCommit: boolean;
  saveTranscripts: boolean;
};

export const DEFAULT_SETTINGS: Settings = {
  dominantHand: "right",
  mirrorPreview: true,
  showLandmarks: true,
  stabilityFrames: 6,
  minConfidence: 0.5,
  autoCommit: false,
  saveTranscripts: false,
};

const KEY = "signflow.settings.v1";

export function loadSettings(): Settings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(s: Settings) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // storage unavailable — settings stay session-only
  }
}

export function useSettings(): [Settings, (patch: Partial<Settings>) => void] {
  const [settings, setSettings] = useState<Settings>(() =>
    typeof window === "undefined" ? DEFAULT_SETTINGS : loadSettings()
  );
  const update = (patch: Partial<Settings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      saveSettings(next);
      return next;
    });
  };
  return [settings, update];
}

// ---------- saved transcripts (explicit opt-in) ----------

export type SavedTranscript = {
  id: string;
  text: string;
  savedAt: number; // epoch ms
};

const TKEY = "signflow.transcripts.v1";

export function loadTranscripts(): SavedTranscript[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(window.localStorage.getItem(TKEY) ?? "[]");
  } catch {
    return [];
  }
}

export function addTranscript(text: string): SavedTranscript {
  const t: SavedTranscript = {
    id: crypto.randomUUID(),
    text: text.slice(0, 2000),
    savedAt: Date.now(),
  };
  const all = loadTranscripts();
  all.unshift(t);
  window.localStorage.setItem(TKEY, JSON.stringify(all.slice(0, 50)));
  return t;
}

export function deleteTranscript(id: string) {
  window.localStorage.setItem(
    TKEY,
    JSON.stringify(loadTranscripts().filter((t) => t.id !== id))
  );
}

export function deleteAllTranscripts() {
  window.localStorage.removeItem(TKEY);
}
