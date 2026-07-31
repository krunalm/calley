/**
 * Framer Motion utilities and animation presets for Calley.
 *
 * All animations respect `prefers-reduced-motion` via the
 * `useReducedMotion()` hook and the `reducedMotionVariants` helper.
 *
 * Durations mirror the `--duration-*` tokens in `styles/globals.css`
 * (framer-motion counts in seconds, CSS in milliseconds). The budget is
 * 120-200ms, ease-out, colour and transform only.
 */

import type { Variants } from 'framer-motion';

/** Standard easing used throughout the app — mirrors `--ease-out` */
export const EASE_OUT = [0.16, 1, 0.3, 1] as const;

/** Mirrors `--duration-fast` (120ms) */
export const DURATION_FAST = 0.12;

/** Mirrors `--duration-base` (180ms) */
export const DURATION_BASE = 0.18;

/**
 * View-switch animation variants.
 *
 * Usage: wrap each calendar view in `<motion.div>` inside an
 * `<AnimatePresence mode="wait">`. The `custom` prop should be
 * `1` for forward navigation and `-1` for backward.
 */
export const viewSwitchVariants: Variants = {
  initial: (direction: number) => ({
    opacity: 0,
    x: direction * 24,
  }),
  animate: {
    opacity: 1,
    x: 0,
    transition: { duration: DURATION_BASE, ease: EASE_OUT },
  },
  exit: (direction: number) => ({
    opacity: 0,
    x: direction * -24,
    transition: { duration: DURATION_FAST },
  }),
};

/**
 * Modal / dialog scale-in animation variants.
 */
export const modalVariants: Variants = {
  initial: {
    opacity: 0,
    scale: 0.95,
  },
  animate: {
    opacity: 1,
    scale: 1,
    transition: { duration: DURATION_FAST, ease: EASE_OUT },
  },
  exit: {
    opacity: 0,
    scale: 0.97,
    transition: { duration: DURATION_FAST },
  },
};

/**
 * Staggered children container + item variants.
 * Parent uses `staggerContainer`, children use `staggerItem`.
 */
export const staggerContainer: Variants = {
  initial: {},
  animate: {
    transition: {
      staggerChildren: 0.05,
    },
  },
};

export const staggerItem: Variants = {
  initial: { opacity: 0, y: 8 },
  animate: {
    opacity: 1,
    y: 0,
    transition: { duration: DURATION_BASE, ease: EASE_OUT },
  },
};

/**
 * Fade-in variant for simple opacity transitions.
 */
export const fadeIn: Variants = {
  initial: { opacity: 0 },
  animate: {
    opacity: 1,
    transition: { duration: DURATION_BASE },
  },
  exit: {
    opacity: 0,
    transition: { duration: DURATION_FAST },
  },
};

/**
 * Slide-up + fade variant for list items being removed (e.g. task check-off).
 *
 * The exit collapses height, which is the one place a layout-shifting
 * animation earns its keep: the row is leaving, and snapping the list shut
 * severs the link between the item you checked and the gap it left.
 */
export const taskCheckOffVariants: Variants = {
  initial: { opacity: 1, height: 'auto', y: 0 },
  animate: {
    opacity: 1,
    height: 'auto',
    y: 0,
    transition: { duration: DURATION_BASE },
  },
  exit: {
    opacity: 0,
    height: 0,
    y: -8,
    transition: { duration: DURATION_BASE, ease: EASE_OUT },
  },
};
