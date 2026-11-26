"use client";

// Word practice: the avatar signs a word (taught/built-in motion if one
// exists, otherwise fingerspelled), you type what you saw. Scored
// letter-by-letter; each letter feeds the shared practice stats.

import { useCallback, useEffect, useRef, useState } from "react";
import FingerspellingPlayer from "@/components/FingerspellingPlayer";
import SignAvatar, { type Pose } from "@/components/SignAvatar";
import {
  MotionConfig,
  motion,
  staggerContainer,
  fadeUp,
  fadeIn,
} from "@/components/motion-kit";
import { FRAME_MS } from "@/lib/signs/avatar-engine";
import { recordedMotions } from "@/lib/signs/custom-signs";
import { sampleWord, sampleDrillWord, scoreTypedWord, type WordScore } from "@/lib/practice-words";
import { loadStats, recordRound, weakestLetters, type PracticeStats } from "@/lib/practice-stats";


export default function WordPractice({
  onStats,
}: {
  onStats: (s: PracticeStats) => void;
}) {
  const [motionSigns, setMotionSigns] = useState<Record<string, Pose[][]> | null>(null);
  const [word, setWord] = useState<string>("");
  const [run, setRun] = useState(0);
  const [playing, setPlaying] = useState(false);
  const finish = useCallback(() => setPlaying(false), []);
  const [answer, setAnswer] = useState("");
  const [result, setResult] = useState<WordScore | null>(null);
  const [rounds, setRounds] = useState({ right: 0, total: 0 });

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const id = setTimeout(() => setMotionSigns(recordedMotions()), 0);
    return () => clearTimeout(id);
  }, []);

  const playWord = useCallback(
    (w: string) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      const recording = motionSigns?.[w];
      if (recording) timerRef.current = setTimeout(finish, recording.length * FRAME_MS);
      setRun((current) => current + 1);
      setPlaying(true);
    },
    [finish, motionSigns]
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
    if (!motionSigns || startedRef.current) return;
    startedRef.current = true;
    nextWord();
  }, [motionSigns, nextWord]);

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
    <MotionConfig reducedMotion="user">
      <motion.div variants={staggerContainer} initial="hidden" animate="show" className="live-layout">
        <motion.section variants={fadeIn}>
        <div className="stage">
          {playing && (motionSigns?.[word] ? (
            <SignAvatar currentPose={null} key={run} motion={motionSigns[word]} />
          ) : (
            <FingerspellingPlayer key={run} text={word} reveal={false} onComplete={finish} />
          ))}
          {!playing && <div className="handshape-stage"><p>Replay to watch the word again.</p></div>}
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
      </motion.section>

      <motion.section variants={fadeUp} className="card" aria-live="polite">
        <h2>What word did the avatar sign?</h2>
        {!result && (
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
          <motion.div
            key={word}
            variants={staggerContainer}
            initial="hidden"
            animate="show"
          >
            <motion.p
              variants={fadeUp}
              style={{ color: result.correct === result.total ? "var(--ok)" : "var(--warn)", fontWeight: 700, fontSize: 20 }}
            >
              {result.correct === result.total ? "✓ Perfect" : `${result.correct}/${result.total} letters`} — it was{" "}
              <strong>{word}</strong>
            </motion.p>
            <motion.div variants={fadeIn} className="letter-strip">
              {result.perLetter.map((p, i) => (
                <motion.span
                  key={i}
                  variants={fadeUp}
                  className="letter-chip"
                  data-active={p.hit}
                  style={p.hit ? undefined : { textDecoration: "line-through", opacity: 0.7 }}
                >
                  {p.letter}
                </motion.span>
              ))}
            </motion.div>
            <motion.p variants={fadeUp} className="small muted">
              Per-letter results feed your practice stats and weak-letter drills.
            </motion.p>
            <motion.div variants={fadeUp} className="btn-row">
              <button className="btn primary" onClick={nextWord}>
                Next word →
              </button>
            </motion.div>
          </motion.div>
        )}
      </motion.section>
      </motion.div>
    </MotionConfig>
  );
}
