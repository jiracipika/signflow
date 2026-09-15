# SignFlow 🤟

**Live:** https://signflow-five.vercel.app · **Source:** https://github.com/jiracipika/signflow

An **ASL fingerspelling assistant** that runs entirely in your browser: the camera
tracks your hand, a trained classifier recognizes static alphabet letters, you
commit letters into text, and a prefix trie suggests whole words.

This is **not a full ASL translator**. It supports two recognition modes:

1. **Fingerspelling** — the 24 static letters of the ASL alphabet (A–Z except
   motion-based **J** and **Z**, which have manual buttons).
2. **Word/phrase signs** — single-shape signs like **I LOVE YOU**, **YES**, and
   **NO** via built-in geometric templates (approximations — shape only, no
   motion), and **anything you teach it**: open [Teach](/teach),
   record 5 samples of a static shape or a 2.5-second motion (e.g. THANK YOU,
   name signs, dynamic gestures), and it becomes locally recognizable
   (normalized landmarks + nearest-prototype for static, DTW for motions).
   Taught signs and samples stay in your browser — nothing is uploaded.

## Signing avatar, library, and word practice

- **[Avatar](/avatar)** — type anything and a canvas hand fingerspells it with
  natural letter-to-letter flow, real J/Z stroke paths, pause/replay/loop,
  speed control, and a letter-chip caption synced to the engine's frame spans
  (tap a chip to replay that letter). Deep link: `/avatar?text=HELLO`.
- **[Library](/library)** — browsable common words showing how SignFlow renders
  each one today (taught sign / built-in approximation / fingerspelled), with
  Lifeprint (ASLU) and Signing Savvy reference links per entry.
- **[Word practice](/practice?tab=words)** — the avatar signs a common word;
  you type what you saw. Scored letter-by-letter into the same stats and
  weak-letter drills as recognition practice.

No accounts, no uploads: camera frames are processed on-device.

## How it works

    camera frames → MediaPipe HandLandmarker (WASM, on-device)
                  → 86 engineered features from 21 landmarks
                  → MLP letter classifier (24 classes)
                  → temporal decoder (stability window + hold-gate)
                  → committed transcript → trie word suggestions (up to 3)

## Recognition model provenance

- **Dataset:** [Siruyy/asl-static-landmarks-v1](https://huggingface.co/datasets/Siruyy/asl-static-landmarks-v1)
  (HuggingFace, **CC-BY-4.0**) — 5,080 samples of MediaPipe hand landmarks,
  86 features per sample, single collector.
- **Feature pipeline:** mirrored exactly from
  [Siruyy/realtime-asl-recognizer](https://github.com/Siruyy/realtime-asl-recognizer) (MIT).
- **Model:** retrained here as a numpy MLP (86-256-128-64-32-24, Adam) and
  exported to JSON (`public/models/asl-static-v1.json`); inference is a
  hand-written TypeScript forward pass — no TF.js or ONNX runtime needed.
- **Measured accuracy (random 80/20 split, not signer-separated):**
  **98.93%** overall, 99.19% per-letter average. Top confusions: N↔T, M↔R/S, I↔Y.
  Verified end-to-end through the exact TS forward pass the browser runs:
  `node --experimental-strip-types scripts/verify-ts-forward.mjs`.
- Probabilities are softmax outputs and are **not calibrated accuracy**.

## Development

    npm install
    npm run dev          # http://localhost:3000
    npm test             # unit tests (node --test)
    npx tsc --noEmit     # typecheck
    npm run build        # production build (also copies MediaPipe assets)

Retraining requires the dataset .npy files (see script header):

    python3 scripts/train_asl.py

## Redeployment

The project is linked to Vercel (`.vercel/project.json`):

    vercel          # preview deploy
    vercel --prod   # production

Note: the "Vercel Authentication" SSO redirect on
`signflow-jiracipikas-projects.vercel.app` aliases is a team-level default;
`signflow-five.vercel.app` is the public production alias.

## Limitations (honest)

- J and Z are not recognized (motion-based; manual entry provided).
- Single-collector training data — different hand shapes may reduce accuracy.
- Designed for deliberate, paused fingerspelling, not continuous signing.
- The built-in I LOVE YOU / YES / NO templates are approximations (single hand
  shapes; the real signs add motion, and no licensed phrase-sign dataset
  exists); teach-your-own recordings are more accurate.
- Word-sign distances are uncalibrated template/DTW scores, not probabilities.
- Best in Chrome/Edge (desktop, Android) and Safari 16.4+ (iOS). Camera needs HTTPS.
