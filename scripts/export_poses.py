"""Export canonical per-letter hand poses (mean of training landmarks) for the
signing avatar. Uses the same Siruyy/asl-static-landmarks-v1 dataset (CC-BY-4.0)
as the classifier: de-normalize features 0-62 (raw landmark coords), average
per letter. Includes J and Z shapes (static approximation - their motion is
not captured by a mean pose; UI says so).
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
# de-normalize first 63 features back to raw normalized image coords
raw = X[:, :63] * std[:63] + mean[:63]

poses = {}
for cls in range(26):
    letter = chr(65 + cls)
    sel = raw[y == cls]
    if len(sel) < 10:
        print(f"skip {letter}: only {len(sel)} samples")
        continue
    m = sel.mean(axis=0)
    # landmarks were captured palm-toward-camera; the avatar draws them
    # directly in normalized space
    poses[letter] = [round(float(v), 5) for v in m]
    print(letter, len(sel), "samples")

out = {
    "format": "signflow-asl-poses-v1",
    "source": "mean MediaPipe landmarks per letter, Siruyy/asl-static-landmarks-v1 (CC-BY-4.0)",
    "note": "J and Z are mean shapes only; their tracing motion is not encoded",
    "poses": poses,
}
with open("public/models/asl-poses-v1.json", "w") as f:
    json.dump(out, f)
print("exported", len(poses), "poses")
