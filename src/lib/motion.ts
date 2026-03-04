// Merken Motion Language
// All animations use spring physics for natural, organic feel.
// This file defines the motion constants used across the entire app.

import type { Transition, Variants } from 'framer-motion';

// ============ Spring Presets ============
// Never use linear or ease — springs feel alive.

export const springs = {
  /** Gentle, relaxed motion — page transitions, large elements */
  gentle: { type: 'spring', stiffness: 200, damping: 26 } as Transition,
  /** Snappy, responsive — card flips, toggles */
  snappy: { type: 'spring', stiffness: 400, damping: 30 } as Transition,
  /** Bouncy, playful — favorites, celebrations */
  bouncy: { type: 'spring', stiffness: 300, damping: 20 } as Transition,
  /** Quick tap feedback — buttons, icons */
  tap: { type: 'spring', stiffness: 500, damping: 30, mass: 0.5 } as Transition,
} as const;

// ============ Common Variants ============

export const fadeIn: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
};

export const scaleIn: Variants = {
  initial: { scale: 0.92, opacity: 0 },
  animate: { scale: 1, opacity: 1 },
  exit: { scale: 0.92, opacity: 0 },
};

export const slideUp: Variants = {
  initial: { y: 20, opacity: 0 },
  animate: { y: 0, opacity: 1 },
  exit: { y: -10, opacity: 0 },
};

export const slideDown: Variants = {
  initial: { y: -20, opacity: 0 },
  animate: { y: 0, opacity: 1 },
  exit: { y: 20, opacity: 0 },
};

// ============ Stagger Containers ============

export const staggerContainer: Variants = {
  initial: {},
  animate: {
    transition: {
      staggerChildren: 0.06,
      delayChildren: 0.1,
    },
  },
};

export const staggerItem: Variants = {
  initial: { y: 12, opacity: 0 },
  animate: {
    y: 0,
    opacity: 1,
    transition: springs.gentle,
  },
};

// ============ Interactive Variants ============

export const tapScale = {
  whileTap: { scale: 0.93 },
  transition: springs.tap,
};

export const hoverScale = {
  whileHover: { scale: 1.03 },
  transition: springs.gentle,
};

export const favoritePop: Variants = {
  initial: { scale: 1 },
  animate: {
    scale: [1, 1.35, 1],
    transition: {
      duration: 0.4,
      times: [0, 0.4, 1],
      type: 'spring',
      stiffness: 300,
      damping: 15,
    },
  },
};

// ============ Card Swipe ============

export const cardSwipeVariants: Variants = {
  enter: (direction: number) => ({
    x: direction > 0 ? 300 : -300,
    opacity: 0,
    scale: 0.9,
    rotateY: direction > 0 ? 15 : -15,
  }),
  center: {
    x: 0,
    opacity: 1,
    scale: 1,
    rotateY: 0,
  },
  exit: (direction: number) => ({
    x: direction > 0 ? -300 : 300,
    opacity: 0,
    scale: 0.9,
    rotateY: direction > 0 ? -15 : 15,
  }),
};

export const swipeTransition: Transition = {
  x: springs.snappy,
  opacity: { duration: 0.15 },
  scale: springs.gentle,
  rotateY: springs.gentle,
};

// ============ Flip Animation ============

export const FLIP_DURATION = 0.5;

export const flipTransition: Transition = {
  type: 'spring',
  stiffness: 250,
  damping: 25,
  mass: 0.8,
};
