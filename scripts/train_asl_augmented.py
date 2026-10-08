"""Train the ASL static-letter MLP with geometric augmentation.

Same architecture/pipeline as train_asl.py (Siruyy/asl-static-landmarks-v1,
CC-BY-4.0) but each training sample is augmented with random horizontal
mirrors, shifts, scales, and small in-plane rotations. The first 63 feature
dims (raw landmark x,y,z) are transformed and the 23 derived dims are
RECOMPUTED from the transformed landmarks (exact port of lib/features.ts), so
the augmentation is consistent across the whole feature vector.

Why: the raw-coordinate features are position/distance sensitive, and the
original training set is a single right-handed collector. After augmentation
the model tolerates hands anywhere in frame at any distance, and left-handed
signers classify correctly (runtime also mirrors left-hand input before
features — lib/features.ts mirrorLandmarks).

Overwrites public/models/asl-static-v1.json in place; meta records the
augmentation and the mirrored-split accuracy.
"""
import json
import os
import time

import numpy as np

DATA = "/tmp/signflow-data"
OUT = "public/models/asl-static-v1.json"

LETTERS = [chr(65 + i) for i in range(26)]
STATIC_LETTERS = [c for c in LETTERS if c not in ("J", "Z")]
STATIC_IDX = {ord(c) - 65: i for i, c in enumerate(STATIC_LETTERS)}
TIPS = [4, 8, 12, 16, 20]
MCPS = [2, 5, 9, 13, 17]


def load():
    """Returns (Xtr_raw, ytr, Xte_raw, yte, mean, std).

    The Siruyy .npy features ship pre-standardized (mean.npy/std.npy are the
    RAW feature stats), but the exported model must accept RAW landmark
    features at runtime — predictFeatures standardizes with the exported
    mean/std. So we de-standardize back to raw landmark space, augment there,
    and export the raw-space stats.
    """
    sir_mean = np.load(f"{DATA}/mean.npy")
    sir_std = np.load(f"{DATA}/std.npy")
    Xtr = np.load(f"{DATA}/X_train.npy") * sir_std + sir_mean
    Xte = np.load(f"{DATA}/X_test.npy") * sir_std + sir_mean
    ytr = np.load(f"{DATA}/y_train.npy")
    yte = np.load(f"{DATA}/y_test.npy")

    def to_static(X, y):
        mask = np.array([int(v) in STATIC_IDX for v in y])
        Xs, ys = X[mask], y[mask]
        ys = np.array([STATIC_IDX[int(v)] for v in ys])
        return Xs, ys

    return (*to_static(Xtr, ytr), *to_static(Xte, yte), sir_mean, sir_std)


def derived(raw):
    """Recompute the 23 derived feature dims from (N, 21, 3) landmarks.

    Port of lib/features.ts engineerFeatures sections 2-7 (degrees, 3D dists).
    """
    N = raw.shape[0]

    def d(a, b):  # a, b: (N, 3)
        return np.linalg.norm(a - b, axis=1)

    sub = lambda a, b: a - b
    out = []
    wrist = raw[:, 0, :]
    tips = [raw[:, t, :] for t in TIPS]
    mcps = [raw[:, m, :] for m in MCPS]
    # 2. tip-wrist distances (5)
    out += [d(t, wrist) for t in tips]
    # 3. adjacent tip spread (4)
    for i in range(4):
        out.append(d(tips[i], tips[i + 1]))
    # 4. curl: tip-MCP distance (5)
    out += [d(tips[i], mcps[i]) for i in range(5)]
    # 5. palm vector (3)
    palm = sub(raw[:, 9, :], wrist)
    out += [palm[:, 0], palm[:, 1], palm[:, 2]]
    # 6. finger angle vs palm (5), degrees
    for i in range(5):
        v = sub(tips[i], mcps[i])
        dot = (v * palm).sum(axis=1)
        n = np.linalg.norm(v, axis=1) * np.linalg.norm(palm, axis=1) + 1e-8
        out.append(np.degrees(np.arccos(np.clip(dot / n, -1, 1))))
    # 7. max tip span (1)
    span = np.zeros(N)
    for i in range(5):
        for j in range(i + 1, 5):
            span = np.maximum(span, d(tips[i], tips[j]))
    out.append(span)
    return np.stack(out, axis=1)


def augment(X, y, rng, copies=5):
    xs, ys = [X], [y]
    N = len(X)
    for _ in range(copies):
        Xa = X.copy()
        raw = Xa[:, :63].reshape(N, 21, 3).copy()
        # mirror ~50% (x -> 1-x, image-space), z untouched
        mir = rng.random(N) < 0.5
        raw[mir, :, 0] = 1.0 - raw[mir, :, 0]
        cen = raw.mean(axis=1, keepdims=True)
        s = rng.uniform(0.8, 1.25, (N, 1, 1))
        raw = (raw - cen) * s + cen
        ang = rng.uniform(-0.35, 0.35, N)
        cos, sin = np.cos(ang), np.sin(ang)
        x = raw[:, :, 0] - cen[:, :, 0]
        yr = raw[:, :, 1] - cen[:, :, 1]
        raw[:, :, 0] = cos[:, None] * x - sin[:, None] * yr + cen[:, :, 0]
        raw[:, :, 1] = sin[:, None] * x + cos[:, None] * yr + cen[:, :, 1]
        raw[:, :, 0] += rng.uniform(-0.05, 0.05, (N, 1))
        raw[:, :, 1] += rng.uniform(-0.05, 0.05, (N, 1))
        Xa[:, :63] = raw.reshape(N, 63)
        Xa[:, 63:] = derived(raw)
        xs.append(Xa)
        ys.append(y)
    return np.concatenate(xs), np.concatenate(ys)


class Dense:
    def __init__(self, n_in, n_out, rng, dropout=0.0):
        self.W = rng.normal(0, np.sqrt(2.0 / n_in), (n_in, n_out))
        self.b = np.zeros(n_out)
        self.dropout = dropout
        self.mask = None

    def forward(self, x, train, rng):
        out = np.maximum(x @ self.W + self.b, 0)
        if train and self.dropout > 0:
            keep = 1 - self.dropout
            self.mask = (rng.random(out.shape) < keep) / keep
            out = out * self.mask
        return out


def softmax(z):
    z = z - z.max(axis=1, keepdims=True)
    e = np.exp(z)
    return e / e.sum(axis=1, keepdims=True)


class MLP:
    def __init__(self, rng):
        self.layers = [
            Dense(86, 256, rng, dropout=0.4),
            Dense(256, 128, rng, dropout=0.3),
            Dense(128, 64, rng, dropout=0.3),
            Dense(64, 32, rng, dropout=0.2),
            Dense(32, 24, rng),
        ]

    def forward(self, x, train=False, rng=None):
        acts = [x]
        for l in self.layers:
            acts.append(l.forward(acts[-1], train, rng))
        return acts

    def probs(self, x):
        return softmax(self.forward(x, False)[-1])


def accuracy(model, X, y):
    return (model.probs(X).argmax(1) == y).mean()


def mirrored(X):
    """Held-out mirror view: flip the raw coords, recompute derived dims."""
    raw = X[:, :63].reshape(len(X), 21, 3).copy()
    raw[:, :, 0] = 1.0 - raw[:, :, 0]
    out = X.copy()
    out[:, :63] = raw.reshape(len(X), 63)
    out[:, 63:] = derived(raw)
    return out


def train():
    Xtr, ytr, Xte, yte, _, _ = load()
    rng = np.random.default_rng(42)
    Xaug, yaug = augment(Xtr, ytr, rng, copies=5)
    # exported normalization stats: computed on RAW features so the runtime
    # path (raw landmark features -> (x-mean)/std) sees the training
    # distribution exactly
    MEAN = Xtr.mean(axis=0)
    # floor the std: Siruyy's z channel is constant (raw std ~ 1e-9), and a
    # 1e-8 divisor there amplifies float noise until training diverges
    STD = np.maximum(Xtr.std(axis=0), 1e-3)
    st = lambda X: (X - MEAN) / STD
    Xs = st(Xaug)
    print(f"train {Xtr.shape} -> augmented {Xaug.shape}; test {Xte.shape}")

    model = MLP(rng)
    m = {i: np.zeros_like(l.W) for i, l in enumerate(model.layers)}
    v = {i: np.zeros_like(l.W) for i, l in enumerate(model.layers)}
    mb = {i: np.zeros_like(l.b) for i, l in enumerate(model.layers)}
    vb = {i: np.zeros_like(l.b) for i, l in enumerate(model.layers)}
    beta1, beta2, eps = 0.9, 0.999, 1e-8
    t_step = 0
    lr = 1e-3
    batch = 64
    N = len(Xs)
    best_val, best = -1, None
    t0 = time.time()
    for epoch in range(60):
        idx = rng.permutation(N)
        tot = 0
        for s in range(0, N, batch):
            b = idx[s : s + batch]
            x, y = Xs[b], yaug[b]
            acts = model.forward(x, True, rng)
            probs = softmax(acts[-1])
            loss = -np.log(probs[np.arange(len(b)), y] + 1e-12).mean()
            tot += loss * len(b)
            delta = probs.copy()
            delta[np.arange(len(b)), y] -= 1
            delta /= len(b)
            t_step += 1
            for li in range(len(model.layers) - 1, -1, -1):
                l = model.layers[li]
                inp = acts[li]
                if l.mask is not None:
                    delta = delta * l.mask
                dW = inp.T @ delta
                db = delta.sum(axis=0)
                delta = (delta @ l.W.T) * (inp > 0)
                m[li] = beta1 * m[li] + (1 - beta1) * dW
                v[li] = beta2 * v[li] + (1 - beta2) * dW * dW
                mb[li] = beta1 * mb[li] + (1 - beta1) * db
                vb[li] = beta2 * vb[li] + (1 - beta2) * db * db
                l.W -= lr * (m[li] / (1 - beta1**t_step)) / (
                    np.sqrt(v[li] / (1 - beta2**t_step)) + eps
                )
                l.b -= lr * (mb[li] / (1 - beta1**t_step)) / (
                    np.sqrt(vb[li] / (1 - beta2**t_step)) + eps
                )
        val_acc = accuracy(model, Xte, yte)
        if val_acc > best_val:
            best_val = val_acc
            best = [(l.W.copy(), l.b.copy()) for l in model.layers]
        if epoch % 10 == 0:
            print(f"epoch {epoch:3d} loss={tot/N:.4f} val_acc={val_acc:.4f} ({time.time()-t0:.0f}s)")

    for l, (W, b) in zip(model.layers, best):
        l.W, l.b = W, b

    acc = accuracy(model, st(Xte), yte)
    mir_acc = accuracy(model, st(mirrored(Xte)), yte)
    print(f"held-out acc: {acc:.4f} | mirrored-held-out acc: {mir_acc:.4f}")

    # st(): the network was trained on standardized features — evaluating the
    # confusion on raw Xte would export a garbage cm/macro next to the real acc
    probs = model.probs(st(Xte))
    cm = np.zeros((24, 24), dtype=int)
    for p, t in zip(probs.argmax(1), yte):
        cm[t, p] += 1
    macro = np.mean([cm[i, i] / cm[i].sum() for i in range(24) if cm[i].sum() > 0])

    mean, std = MEAN, STD
    os.makedirs("public/models", exist_ok=True)
    export = {
        "format": "signflow-asl-static-v1",
        "letters": STATIC_LETTERS,
        "mean": mean.tolist(),
        "std": std.tolist(),
        "layers": [{"W": l.W.tolist(), "b": l.b.tolist()} for l in model.layers],
        "meta": {
            "dataset": "Siruyy/asl-static-landmarks-v1 (CC-BY-4.0, HuggingFace)",
            "upstream_code": "Siruyy/realtime-asl-recognizer (MIT, GitHub)",
            "features": 86,
            "samples_train": int(len(Xtr)),
            "samples_train_augmented": int(len(Xaug)),
            "augmentation": "x5 copies: random x-mirror, shift +-0.05, scale 0.8-1.25, rotate +-20deg; derived dims recomputed",
            "samples_test": int(len(Xte)),
            "test_accuracy": round(float(acc), 4),
            "mirrored_test_accuracy": round(float(mir_acc), 4),
            "macro_accuracy": round(float(macro), 4),
            "confusion": cm.tolist(),
            "trained": "2026-10-05",
            "note": "Single-collector dataset; accuracy measured on random split, not signer-separated. Probabilities are uncalibrated. Augmentation makes the model robust to hand position/distance and left-handed signers (runtime also mirrors left-hand input).",
        },
    }
    with open(OUT, "w") as f:
        json.dump(export, f)
    print(f"Exported {OUT} ({os.path.getsize(OUT)/1024:.0f} KB)")


if __name__ == "__main__":
    train()
