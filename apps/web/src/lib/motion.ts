/**
 * Framer Motion utilities and animation presets for Calley.
 *
 * All animations respect `prefers-reduced-motion` via the
 * `useReducedMotion()` hook and the `reducedMotionVariants` helper.
 */

import type { Variants } from 'framer-motion';

/** Standard easing used throughout the app */
export const EASE_OUT = [0.16, 1, 0.3, 1] as const;

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
    x: direction * 40,
  }),
  animate: {
    opacity: 1,
    x: 0,
    transition: { duration: 0.2, ease: [0.16, 1, 0.3, 1] },
  },
  exit: (direction: number) => ({
    opacity: 0,
    x: direction * -40,
    transition: { duration: 0.15 },
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
    transition: { duration: 0.15, ease: [0.16, 1, 0.3, 1] },
  },
  exit: {
    opacity: 0,
    scale: 0.97,
    transition: { duration: 0.1 },
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
    transition: { duration: 0.2, ease: [0.16, 1, 0.3, 1] },
  },
};

/**
 * Fade-in variant for simple opacity transitions.
 */
export const fadeIn: Variants = {
  initial: { opacity: 0 },
  animate: {
    opacity: 1,
    transition: { duration: 0.2 },
  },
  exit: {
    opacity: 0,
    transition: { duration: 0.15 },
  },
};

/**
 * Slide-up + fade variant for list items being removed (e.g. task check-off).
 */
export const taskCheckOffVariants: Variants = {
  initial: { opacity: 1, height: 'auto', y: 0 },
  animate: {
    opacity: 1,
    height: 'auto',
    y: 0,
    transition: { duration: 0.2 },
  },
  exit: {
    opacity: 0,
    height: 0,
    y: -8,
    transition: { duration: 0.3, ease: [0.16, 1, 0.3, 1] },
  },
};
