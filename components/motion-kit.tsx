"use client";

// Shared Motion primitives for SignFlow's house animation style: spring
// entrance staggers, hover lift, tap press. Every animated page wraps its
// subtree in <MotionConfig reducedMotion="user"> (re-exported here), so
// users with prefers-reduced-motion get instant, non-animated states.
// Only transform/opacity are ever animated — never layout, camera video,
// or detection overlays.

import { AnimatePresence, MotionConfig, motion, type Variants } from "motion/react";

export { AnimatePresence, MotionConfig, motion };

/** House spring: a gentle settle, a touch of bounce, never showy. */
export const springSoft = { type: "spring", bounce: 0.3, duration: 0.6 } as const;

/** Container variant: orchestrates a staggered entrance of its children. */
export const staggerContainer: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07, delayChildren: 0.02 } },
};

/** Item variant: fade + rise, settled by the house spring. */
export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0, transition: springSoft },
};

/**
 * Item variant for long lists: same fade + rise, but each row supplies a
 * `custom={index}` and the delay is capped so a 24-row list doesn't take
 * forever to cascade in.
 */
export const fadeUpCapped: Variants = {
  hidden: { opacity: 0, y: 14 },
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { ...springSoft, delay: Math.min(i * 0.04, 0.48) },
  }),
};

/**
 * Opacity-only variant for camera-bearing containers: the camera view is
 * latency-critical, so its wrapper gets a single fade — never a transform.
 */
export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: 0.4, ease: "easeOut" } },
};

/** whileHover lift for cards/cells. */
export const hoverLift = { y: -2 } as const;

/** whileTap press for buttons/cells. */
export const tapPress = { scale: 0.96 } as const;

/**
 * Height-animated reveal for conditional blocks (AnimatePresence). Wrap the
 * conditional content in <AnimatePresence initial={false}> and render this
 * as the motion.div inside the conditional: <motion.div {...collapse}>.
 */
export const collapse = {
  initial: { height: 0, opacity: 0 },
  animate: { height: "auto" as const, opacity: 1 },
  exit: { height: 0, opacity: 0 },
  transition: {
    height: { type: "spring" as const, bounce: 0.15, duration: 0.5 },
    opacity: { duration: 0.25 },
  },
  style: { overflow: "hidden" as const },
};
