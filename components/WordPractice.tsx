"use client";

// Word practice: the avatar signs a word (taught/built-in motion if one
// exists, otherwise fingerspelled), you type what you saw. Scored
// letter-by-letter; each letter feeds the shared practice stats.

import { useCallback, useEffect, useRef, useState } from "react";
import SignAvatar, { type Pose } from "@/components/SignAvatar";
import { spellSequence, FRAME_MS, type SignSequence } from "@/lib/signs/avatar-engine";
import { loadSigns } from "@/lib/signs/custom-signs";
import { sampleWord, sampleDrillWord, scoreTypedWord, type WordScore } from "@/lib/practice-words";
import { loadStats, recordRound, weakestLetters, type PracticeStats } from "@/lib/practice-stats";

type PosesFile = { poses: Record<string, { lm: number[] }> };

export default function WordPractice({
  onStats,
}: {
  onStats: (s: PracticeStats) => void;
}) {
  const [poses, setPoses] = useState<Record<string, Pose[]> | null>(null);
  const [motionSigns, setMotionSigns] = useState<Record<string, Pose[][]>>({});
  const [word, setWord] = useState<string>("");
  const [seq, setSeq] = useState<SignSequence | null>(null);
  const [playing, setPlaying] = useState(false);
  const [answer, setAnswer] = useState("");
  const [result, setResult] = useState<WordScore | null>(null);
  const [rounds, setRounds] = useState({ right: 0, total: 0 });

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/models/asl-poses-v1.json")
      .then((r) => {
        if (!r.ok) throw new Error(`poses fetch ${r.status}`);
        return r.json() as Promise<PosesFile>;
      })
      .then((d) => {
        if (cancelled) return;
        const out: Record<string, Pose[]> = {};
        for (const [k, v] of Object.entries(d.poses)) {
          out[k] = [];
          for (let i = 0; i < 21; i++)
            out[k].push({ x: v.lm[i * 3], y: v.lm[i * 3 + 1], z: v.lm[i * 3 + 2] });
        }
        setPoses(out);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const id = setTimeout(() => {
      const out: Record<string, Pose[][]> = {};
      for (const s of loadSigns()) {
        if (s.kind !== "dynamic") continue;
        const proto = s.prototypes[0];
        out[s.label.toUpperCase()] = proto.map((f) =>
          Array.from({ length: 21 }, (_, i) => ({
            x: f[i * 3] ?? 0,
            y: f[i * 3 + 1] ?? 0,
            z: f[i * 3 + 2] ?? 0,
          }))
        );
      }
      setMotionSigns(out);
    }, 0);
    return () => clearTimeout(id);
  }, []);

  const playWord = useCallback(
    (w: string) => {
      if (!poses) return;
      if (timerRef.current) clearTimeout(timerRef.current);
      const motion = motionSigns[w];
      if (motion) {
        setSeq({ frames: motion, caption: w, spans: [], words: [] });
        const ms = motion.length * FRAME_MS + 400;
        timerRef.current = setTimeout(() => setPlaying(false), ms);
      } else {
        const s = spellSequence(w, poses);
        setSeq(s);
        const ms = s.frames.length * FRAME_MS + 400;
        timerRef.current = setTimeout(() => setPlaying(false), ms);
      }
      setPlaying(true);
    },
    [poses, motionSigns]
  );

  const nextWord = useCallback(() => {
    setAnswer("");
    setResult(null);
    // Weak-letter drill: once there are 10+ letter attempts on record,
    // bias word selection toward the letters the user misses most.
    const stats = loadStats();
    const attempts = Object.values(stats.letters).reduce((s, l) => s + l.attempts, 0);
    const weak = attempts >= 10 ? weakestLetters(stats, 3) : [];
    const w = weak.length > 0
      ? sampleDrillWord({ exclude: word || undefined, weakLetters: weak })
      : sampleWord(undefined, undefined, word || undefined);
    setWord(w);
    // defer so state settles before playback
    setTimeout(() => playWord(w), 0);
  }, [word, playWord]);

  // first word once poses are ready
  const startedRef = useRef(false);
  useEffect(() => {
    if (!poses || startedRef.current) return;
    startedRef.current = true;
    nextWord();
  }, [poses, nextWord]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const submit = () => {
    if (!word || result) return;
    const r = scoreTypedWord(word, answer);
    setResult(r);
    let stats: PracticeStats | null = null;
    for (const { letter, hit } of r.perLetter) stats = recordRound(letter, hit);
    if (stats) onStats(stats);
    setRounds((s) => ({
      right: s.right + (r.correct === r.total ? 1 : 0),
      total: s.total + 1,
    }));
  };

  return (
    <div className="live-layout">
      <section>
        <div className="stage">
          <SignAvatar
            currentPose={playing ? null : (seq?.frames[seq.frames.length - 1] ?? null)}
            motion={playing ? seq?.frames ?? null : null}
          />
          {playing && seq && (
            <div className="stage-caption" aria-live="off">
              ●&nbsp;&nbsp;watch…
            </div>
          )}
        </div>
        <div className="transport">
          <button className="btn" onClick={() => word && playWord(word)} disabled={!word}>
            ↻ Watch again
          </button>
          <span className="spacer" />
          <span className="small muted">
            {rounds.total === 0
              ? "Type what you see spelled out."
              : `${rounds.right}/${rounds.total} words fully correct`}
          </span>
        </div>
      </section>

      <section className="card" aria-live="polite">
        <h2>What word did the avatar sign?</h2>
        {!poses && <p className="muted">Loading pose data…</p>}
        {poses && !result && (
          <>
            <p className="small muted">
              The avatar signs a common word — watch the letter shapes, then type
              the word. Hint: it&apos;s short.
            </p>
            <div className="btn-row" style={{ flexWrap: "nowrap" }}>
              <input
                type="text"
                value={answer}
                maxLength={20}
                placeholder="Type the word…"
                onChange={(e) => setAnswer(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submit()}
                style={{ flex: 1, minWidth: 0 }}
                aria-label="Your answer"
              />
              <button className="btn primary" onClick={submit} disabled={!answer.trim()}>
                Check
              </button>
            </div>
            <button className="btn ghost small" onClick={nextWord} style={{ marginTop: 8 }}>
              Skip word
            </button>
          </>
        )}
        {result && (
          <>
            <p style={{ color: result.correct === result.total ? "var(--ok)" : "var(--warn)", fontWeight: 700, fontSize: 20 }}>
              {result.correct === result.total ? "✓ Perfect" : `${result.correct}/${result.total} letters`} — it was{" "}
              <strong>{word}</strong>
            </p>
            <div className="letter-strip">
              {result.perLetter.map((p, i) => (
                <span
                  key={i}
                  className="letter-chip"
                  data-active={p.hit}
                  style={p.hit ? undefined : { textDecoration: "line-through", opacity: 0.7 }}
                >
                  {p.letter}
                </span>
              ))}
            </div>
            <p className="small muted">
              Per-letter results feed your practice stats and weak-letter drills.
            </p>
            <div className="btn-row">
              <button className="btn primary" onClick={nextWord}>
                Next word →
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
