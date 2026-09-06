# SignFlow 🤟

**Live:** https://signflow-five.vercel.app · **Source:** https://github.com/jiracipika/signflow

An **ASL fingerspelling assistant** that runs entirely in your browser: the camera
tracks your hand, a trained classifier recognizes static alphabet letters, you
commit letters into text, and a prefix trie suggests whole words.

This is **not a full ASL translator** — it recognizes the 24 static letters of
the ASL alphabet (A–Z except motion-based **J** and **Z**, which have manual
buttons). No accounts, no uploads: camera frames are processed on-device.

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
    npm test             # 23 unit tests (decoder, transcript, trie)
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
- Best in Chrome/Edge (desktop, Android) and Safari 16.4+ (iOS). Camera needs HTTPS.
