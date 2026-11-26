"use client";

import { useCallback, useEffect, useState } from "react";
import Handshape, { ASL_ALPHABET } from "@/components/Handshape";
import FingerspellingPlayer from "@/components/FingerspellingPlayer";
import SignAvatar, { type Pose } from "@/components/SignAvatar";
import { recordedMotions } from "@/lib/signs/custom-signs";

export default function AvatarPage() {
  const [text, setText] = useState("");
  const [selected, setSelected] = useState("A");
  const [playback, setPlayback] = useState<{ text: string; frames?: Pose[][]; run: number } | null>(null);
  const [finished, setFinished] = useState(false);
  const [paused, setPaused] = useState(false);
  const [loop, setLoop] = useState(false);
  const [speed, setSpeed] = useState(1);

  const play = useCallback((input: string) => {
    const raw = input.toUpperCase().trim().slice(0, 60);
    const frames = recordedMotions()[raw];
    const letters = raw.replace(/[^A-Z ]+/g, "").replace(/ +/g, " ").trim();
    if (!frames && !letters) return;
    setPaused(false);
    setFinished(false);
    setPlayback((current) => ({ text: frames ? raw : letters, frames, run: (current?.run ?? 0) + 1 }));
  }, []);

  useEffect(() => {
    const input = new URLSearchParams(window.location.search).get("text");
    if (!input) return;
    const timer = setTimeout(() => {
      setText(input.slice(0, 60));
      play(input);
    }, 0);
    return () => clearTimeout(timer);
  }, [play]);

  const finish = useCallback(() => setFinished(true), []);
  const recorded = playback?.frames;
  const finishRecording = useCallback((index: number) => {
    if (!loop && recorded && index >= recorded.length - 1) finish();
  }, [finish, loop, recorded]);

  return (
    <>
      <section className="card">
        <h1>ASL fingerspelling</h1>
        <p>Type a word to watch its letter sequence, or select a letter from the alphabet.</p>
        <form className="btn-row" onSubmit={(event) => { event.preventDefault(); play(text); }}>
          <input aria-label="Text to fingerspell" maxLength={60} value={text} onChange={(event) => setText(event.target.value)} />
          <button className="btn primary" disabled={!text.trim()}>Play word</button>
        </form>
      </section>
      <div className="live-layout">
        <section className="card" aria-label="Fingerspelling player">
          {playback ? (
            <>
              <h2>{playback.text}</h2>
              {recorded ? (
                <div className="stage">
                  <SignAvatar currentPose={null} key={playback.run} motion={recorded} paused={paused || finished} onFrameIndex={finishRecording} />
                </div>
              ) : (
                <FingerspellingPlayer key={playback.run} text={playback.text} paused={paused || finished} loop={loop} speed={speed} onComplete={finish} />
              )}
              <div className="transport">
                {!finished && <button className="btn" onClick={() => setPaused(!paused)}>{paused ? "Resume" : "Pause"}</button>}
                <button className="btn" onClick={() => play(playback.text)}>Replay</button>
                <button className="btn" onClick={() => setPlayback(null)}>Stop</button>
                <label><input type="checkbox" checked={loop} onChange={(event) => setLoop(event.target.checked)} /> Loop</label>
                {!recorded && <label>Speed <input aria-label="Playback speed" type="range" min={0.5} max={1.5} step={0.1} value={speed} onChange={(event) => setSpeed(+event.target.value)} /></label>}
              </div>
              {!recorded && (
                <div className="letter-strip" aria-label="Inspect a letter">
                  {playback.text.split("").map((letter, index) => letter === " " ? null : (
                    <button key={index} className="letter-chip" onClick={() => { setSelected(letter); setPlayback(null); }}>{letter}</button>
                  ))}
                </div>
              )}
            </>
          ) : (
            <>
              <h2>Letter {selected}</h2>
              <Handshape letter={selected} />
            </>
          )}
        </section>
        <section className="card">
          <h2>Alphabet reference</h2>
          <div className="alphabet-grid">
            {[...ASL_ALPHABET].map((letter) => (
              <button key={letter} type="button" aria-label={`Show ${letter}`} aria-pressed={!playback && selected === letter} onClick={() => { setSelected(letter); setPlayback(null); }}>
                <Handshape letter={letter} reveal={false} />
                <span>{letter}</span>
              </button>
            ))}
          </div>
          <p className="small muted">Illustrations from WPClipart, via <a href="https://commons.wikimedia.org/wiki/Category:ASL_letters">Wikimedia Commons</a>. See <a href="https://www.lifeprint.com/asl101/pages-layout/fingerspelling.htm">ASL University</a> for fingerspelling demonstrations.</p>
        </section>
      </div>
    </>
  );
}
