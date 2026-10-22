// The page scripts' tokens. They draw on other sites, where the extension's
// CSS variables (styles/globals.css) don't exist: the same values, by hand.
// Keep them in step with --highlight and the neutral primitives

/** --highlight: lucasbittencourt.dev's blue (#2563eb) */
export const highlight = "rgb(37 99 235)";
export const highlightSoft = "rgb(37 99 235 / 0.12)";
export const highlightTyping = "rgb(37 99 235 / 0.45)";

/** The labels drawn over the page: dark in both themes, like a tooltip */
export const labelBackground = "#0a0a0a";
export const labelForeground = "#ededed";
export const labelMuted = "#a3a3a3";
export const overlayShadow = "0 4px 16px rgb(0 0 0 / 0.25)";

/** --duration-* (ms), for the page scripts' own transitions */
export const durations = { follow: 60, flash: 1400 } as const;
