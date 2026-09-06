"""Train ASL static-letter classifier on Siruyy/asl-static-landmarks-v1 (CC-BY-4.0).

Pipeline matches Siruyy/realtime-asl-recognizer (MIT):
- Input: 86 engineered features from 21 MediaPipe hand landmarks
- Features 0-62: raw landmark x,y,z (normalized coords)
- Features 63+: finger distances/spreads/curls, palm vector, angles, span
- mean/std normalization, labels sorted A..Z (idx = ord(letter)-65)
- Scope: 24 static letters (J, Z excluded - motion-based)

Model: pure-numpy MLP 86-256-128-64-32-24 (relu, softmax), Adam.
Exported to JSON for a hand-written TypeScript forward pass (no TF.js needed).
"""
import numpy as np
import json
import time

DATA = "/tmp/signflow-data"
OUT = "public/models/asl-static-v1.json"

LETTERS = [chr(65 + i) for i in range(26)]
STATIC_LETTERS = [c for c in LETTERS if c not in ("J", "Z")]
# map class idx (0..25) -> static idx (0..23)
STATIC_IDX = {ord(c) - 65: i for i, c in enumerate(STATIC_LETTERS)}


def load():
    Xtr = np.load(f"{DATA}/X_train.npy")
    Xte = np.load(f"{DATA}/X_test.npy")
    ytr = np.load(f"{DATA}/y_train.npy")
    yte = np.load(f"{DATA}/y_test.npy")
    mean = np.load(f"{DATA}/mean.npy")
    std = np.load(f"{DATA}/std.npy")

    def to_static(X, y):
        mask = np.array([int(v) in STATIC_IDX for v in y])
        Xs, ys = X[mask], y[mask]
        ys = np.array([STATIC_IDX[int(v)] for v in ys])
        return Xs, ys

    return (*to_static(Xtr, ytr), *to_static(Xte, yte), mean, std)


class Dense:
    def __init__(self, n_in, n_out, rng, dropout=0.0):
        # He init
        self.W = rng.normal(0, np.sqrt(2.0 / n_in), (n_in, n_out))
        self.b = np.zeros(n_out)
        self.dropout = dropout
        self.mask = None

    def forward(self, x, train, rng):
        out = x @ self.W + self.b
        out = np.maximum(out, 0)
        if train and self.dropout > 0:
            keep = 1 - self.dropout
            self.mask = (rng.random(out.shape) < keep) / keep
            out = out * self.mask
        return out


def softmax(z):
    z = z - z.max(axis=1, keepdims=True)
    e = np.exp(z)
    return e / e.sum(axis=1, keepdims=True)


# Manual backprop for fixed arch (relu + softmax cross-entropy, BN omitted -
# instead we fold normalization into exported weights? No: keep separate layers
# and simple arch: 86->256->128->64->32->24 with dropout on train only).
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
            acts.append(l.forward(acts[-1], train, rng if rng is not None else np.random.default_rng()))
        return acts

    def probs(self, x):
        z = self.forward(x, False)[-1]
        return softmax(z)

    def params(self):
        for l in self.layers:
            yield l


def train():
    Xtr, ytr, Xte, yte, mean, std = load()
    print(f"train={Xtr.shape} test={Xte.shape} static letters={len(STATIC_LETTERS)}")
    n_classes = 24
    N = len(Xtr)
    rng = np.random.default_rng(42)
    model = MLP(rng)

    # Adam state
    m = {i: np.zeros_like(l.W) for i, l in enumerate(model.layers)}
    v = {i: np.zeros_like(l.W) for i, l in enumerate(model.layers)}
    mb = {i: np.zeros_like(l.b) for i, l in enumerate(model.layers)}
    vb = {i: np.zeros_like(l.b) for i, l in enumerate(model.layers)}
    beta1, beta2, eps = 0.9, 0.999, 1e-8
    t_step = 0

    lr = 1e-3
    batch = 32
    best_val = -1
    best = None
    t0 = time.time()
    for epoch in range(300):
        idx = rng.permutation(N)
        tot_loss = 0
        for s in range(0, N, batch):
            b = idx[s : s + batch]
            x, y = Xtr[b], ytr[b]
            acts = model.forward(x, True, rng)
            probs = softmax(acts[-1])
            loss = -np.log(probs[np.arange(len(b)), y] + 1e-12).mean()
            tot_loss += loss * len(b)
            # backprop
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
                # Adam update
                m[li] = beta1 * m[li] + (1 - beta1) * dW
                v[li] = beta2 * v[li] + (1 - beta2) * dW * dW
                mb[li] = beta1 * mb[li] + (1 - beta1) * db
                vb[li] = beta2 * vb[li] + (1 - beta2) * db * db
                mh = m[li] / (1 - beta1 ** t_step)
                vh = v[li] / (1 - beta2 ** t_step)
                l.W -= lr * mh / (np.sqrt(vh) + eps)
                mhb = mb[li] / (1 - beta1 ** t_step)
                vhb = vb[li] / (1 - beta2 ** t_step)
                l.b -= lr * mhb / (np.sqrt(vhb) + eps)
        val_probs = model.probs(Xte)
        val_acc = (val_probs.argmax(1) == yte).mean()
        val_loss = -np.log(val_probs[np.arange(len(yte)), yte] + 1e-12).mean()
        if val_acc > best_val:
            best_val = val_acc
            best = [(l.W.copy(), l.b.copy()) for l in model.layers]
        if epoch % 10 == 0:
            print(
                f"epoch {epoch:3d} loss={tot_loss/N:.4f} val_loss={val_loss:.4f} val_acc={val_acc:.4f}"
            )

    # restore best
    for l, (W, b) in zip(model.layers, best):
        l.W, l.b = W, b
    print(f"\nBest val acc: {best_val:.4f}  ({time.time()-t0:.0f}s)")

    # Full evaluation + confusion matrix
    probs = model.probs(Xte)
    pred = probs.argmax(1)
    acc = (pred == yte).mean()
    print(f"Test accuracy: {acc:.4f}")
    cm = np.zeros((24, 24), dtype=int)
    for p, t in zip(pred, yte):
        cm[t, p] += 1
    print("\nPer-letter accuracy / top confusions:")
    for i, c in enumerate(STATIC_LETTERS):
        n = cm[i].sum()
        a = cm[i, i] / n if n else 0
        conf = ", ".join(
            f"{STATIC_LETTERS[j]}:{cm[i, j]}" for j in np.argsort(-cm[i])[:3] if j != i and cm[i, j] > 0
        )
        print(f"  {c}: {a:.2%} ({n})  {conf}")
    macro = np.mean([cm[i, i] / cm[i].sum() for i in range(24) if cm[i].sum() > 0])
    print(f"Macro (per-letter avg): {macro:.4f}")

    import os
    os.makedirs("public/models", exist_ok=True)
    export = {
        "format": "signflow-asl-static-v1",
        "letters": STATIC_LETTERS,
        "mean": mean.tolist(),
        "std": std.tolist(),
        "layers": [
            {"W": l.W.tolist(), "b": l.b.tolist()} for l in model.layers
        ],
        "meta": {
            "dataset": "Siruyy/asl-static-landmarks-v1 (CC-BY-4.0, HuggingFace)",
            "upstream_code": "Siruyy/realtime-asl-recognizer (MIT, GitHub)",
            "features": 86,
            "samples_train": int(len(Xtr)),
            "samples_test": int(len(Xte)),
            "test_accuracy": round(float(acc), 4),
            "macro_accuracy": round(float(macro), 4),
            "confusion": cm.tolist(),
            "trained": "2026-09-05",
            "note": "Single-collector dataset; accuracy measured on random split, not signer-separated. Probabilities are uncalibrated.",
        },
    }
    with open(OUT, "w") as f:
        json.dump(export, f)
    print(f"\nExported {OUT} ({os.path.getsize(OUT)/1024:.0f} KB)")

    # also dump y arrays for split sanity
    np.save("/tmp/signflow-data/eval_pred.npy", pred)
    np.save("/tmp/signflow-data/eval_yte.npy", yte)


if __name__ == "__main__":
    train()
