// The motion tokens (styles/globals.css: --duration-*, --ease-standard) for
// motion/react, which takes numbers, not CSS variables. Keep them in step
import type { Transition } from "motion/react";

/** Seconds, as motion/react wants them */
export const durations = { instant: 0.1, fast: 0.15, normal: 0.22 } as const;

/** --ease-standard: decelerates into place */
export const easeStandard = [0.4, 0, 0.2, 1] as const;
/** Accelerates away: for exits */
export const easeExit = [0.4, 0, 1, 1] as const;

const enter: Transition = { duration: durations.normal, ease: easeStandard };
const leave: Transition = { duration: durations.fast, ease: easeExit };

/**
 * A section opening in place (height 0 → its own, fading in) so what's below
 * slides down instead of jumping; closing runs faster than opening. Spread
 * on an m.div inside AnimatePresence
 */
export const collapse = {
  initial: { height: 0, opacity: 0 },
  animate: { height: "auto", opacity: 1, transition: enter },
  exit: { height: 0, opacity: 0, transition: leave },
} as const;
