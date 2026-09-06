// Avatar playback engine: sequences poses for letters/words with pacing,
// including hand-up (neutral) transitions between letters and J/Z tracing
// approximations (straight-then-hook strokes around the mean pose).

import type { Pose } from "@/components/SignAvatar";

export type AvatarFrames = { frames: Pose[][]; caption: string };

const HANDS = 24; // ms per interpolation tick baseline

function neutralPose(poses: Record<string, Pose[]>): Pose[] {
  // relaxed fist-ish average of C and E shapes as rest position
  const a = poses["C"] ?? Object.values(poses)[0];
  const b = poses["E"] ?? a;
  return a.map((p, i) => ({ x: (p.x + b[i].x) / 2, y: (p.y + b[i].y) / 2, z: (p.z + b[i].z) / 2 }));
}

/** Build a frame sequence spelling `text` letter by letter. */
export function spellSequence(
  text: string,
  poses: Record<string, Pose[]>,
  opts?: { holdMs?: number; gapMs?: number }
): AvatarFrames {
  const hold = opts?.holdMs ?? 700;
  const gap = opts?.gapMs ?? 240;
  const rest = neutralPose(poses);
  const frames: Pose[][] = [];
  const letters = text.toUpperCase().replace(/[^A-Z ]/g, "");
  const caption = letters;

  for (const ch of letters) {
    if (ch === " ") {
      // pause on rest
      for (let i = 0; i < Math.round(gap * 2 / HANDS); i++) frames.push(rest);
      continue;
    }
    const target = poses[ch];
    if (!target) continue;
    // transition (rest -> letter)
    for (let i = 0; i <= 6; i++) {
      const t = i / 6;
      frames.push(rest.map((p, j) => ({
        x: p.x + (target[j].x - p.x) * t,
        y: p.y + (target[j].y - p.y) * t,
        z: p.z + (target[j].z - p.z) * t,
      })));
    }
    if (ch === "J" || ch === "Z") {
      // tracing approximation: wiggle along the letter's stroke while holding shape
      const reps = Math.round(hold / HANDS);
      for (let i = 0; i < reps; i++) {
        const phase = (i / reps) * Math.PI * 2;
        frames.push(target.map((p) => ({
          x: p.x + Math.sin(phase) * 0.06,
          y: p.y + Math.cos(phase * (ch === "Z" ? 1 : 2)) * 0.05,
          z: p.z,
        })));
      }
    } else {
      for (let i = 0; i < Math.round(hold / HANDS); i++) frames.push(target);
    }
    // transition back (letter -> rest)
    for (let i = 0; i <= 4; i++) {
      const t = i / 4;
      frames.push(target.map((p, j) => ({
        x: p.x + (rest[j].x - p.x) * t,
        y: p.y + (rest[j].y - p.y) * t,
        z: p.z + (rest[j].z - p.z) * t,
      })));
    }
  }
  return { frames, caption };
}
