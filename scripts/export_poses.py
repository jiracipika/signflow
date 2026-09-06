"""Export canonical per-letter hand poses for the signing avatar.

v2: normalize EACH sample before averaging (center on wrist, scale by
wrist->middle-MCP distance) so hand-position variance doesn't blur the
mean shape. Result: wrist at origin, palm size 1 — the renderer centers.
All 26 letters incl. J/Z (static shape only; motion noted in UI).
"""
import numpy as np
import json

DATA = "/tmp/signflow-data"

Xtr = np.load(f"{DATA}/X_train.npy")
Xte = np.load(f"{DATA}/X_test.npy")
ytr = np.load(f"{DATA}/y_train.npy")
yte = np.load(f"{DATA}/y_test.npy")
mean = np.load(f"{DATA}/mean.npy")
std = np.load(f"{DATA}/std.npy")

X = np.vstack([Xtr, Xte])
y = np.concatenate([ytr, yte])
raw = X[:, :63] * std[:63] + mean[:63]

def normalize_sample(lm):
    wrist = lm[0:3]
    mcp = lm[27:30]
    scale = np.linalg.norm(mcp - wrist)
    if scale < 1e-6:
        return None
    return (lm.reshape(21, 3) - wrist) / scale

poses = {}
for cls in range(26):
    letter = chr(65 + cls)
    sel = raw[y == cls]
    normed = [normalize_sample(s) for s in sel]
    normed = [n for n in normed if n is not None]
    if len(normed) < 10:
        print(f"skip {letter}: only {len(normed)} samples")
        continue
    m = np.mean(normed, axis=0)
    # also record shape spread (mean distance from mean) for UI honesty
    spread = float(np.mean([np.linalg.norm(n - m) for n in normed]))
    poses[letter] = {
        "lm": [round(float(v), 5) for v in m.flatten()],
        "spread": round(spread, 4),
        "samples": len(normed),
    }
    print(letter, len(normed), "samples, spread", round(spread, 3))

out = {
    "format": "signflow-asl-poses-v2",
    "source": "per-sample-normalized mean MediaPipe landmarks, Siruyy/asl-static-landmarks-v1 (CC-BY-4.0)",
    "coords": "wrist at origin, palm size 1 (wrist->middle-MCP = 1)",
    "note": "J and Z are static shapes only; their tracing motion is animated as an approximation",
    "poses": poses,
}
with open("public/models/asl-poses-v1.json", "w") as f:
    json.dump(out, f)
print("exported", len(poses), "poses")
