export const REVIEW_MS = 6000;
export const SCOREBOARD_MS = 5000;

/** ?slow on the URL stretches phase timers (demos, screenshots) */
export function phaseMs(ms: number) {
  if (typeof window === "undefined") return ms;
  return new URLSearchParams(window.location.search).has("slow") ? ms * 10 : ms;
}
