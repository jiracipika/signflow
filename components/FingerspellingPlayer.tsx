"use client";

import { useEffect, useMemo, useState } from "react";
import Handshape from "./Handshape";

export default function FingerspellingPlayer({ text, paused = false, loop = false, speed = 1, reveal = true, onComplete }: {
  text: string;
  paused?: boolean;
  loop?: boolean;
  speed?: number;
  reveal?: boolean;
  onComplete?: () => void;
}) {
  const [index, setIndex] = useState(0);
  // A brief blank between identical letters makes their count visible.
  const slides = useMemo(() => [...text].flatMap((letter, i) =>
    i > 0 && letter === text[i - 1] && letter !== " " ? [" ", letter] : [letter]
  ), [text]);
  const letter = slides[index] ?? "";
  useEffect(() => {
    if (paused || !letter) return;
    const dwell = letter === " " ? 320 : letter === "J" || letter === "Z" ? 1100 : 660;
    const timer = setTimeout(() => {
      if (index + 1 < slides.length) setIndex(index + 1);
      else if (loop) setIndex(0);
      else onComplete?.();
    }, dwell / speed);
    return () => clearTimeout(timer);
  }, [index, letter, loop, onComplete, paused, speed, slides.length]);

  return (
    <>
      <div className="handshape-stage">
        {letter !== " " && <Handshape letter={letter} reveal={reveal} />}
      </div>
      {reveal && <progress aria-label="Fingerspelling progress" value={index + 1} max={slides.length} />}
    </>
  );
}
