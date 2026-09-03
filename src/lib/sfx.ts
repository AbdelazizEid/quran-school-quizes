// Synthesized stingers — no audio assets, created lazily after the first
// user gesture (browsers block earlier anyway, sfx.join may stay silent).
let ctx: AudioContext | null = null;

function ac(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const C = window.AudioContext ?? (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!C) return null;
    ctx = new C();
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

function note(freq: number, at: number, dur = 0.12, gain = 0.055, type: OscillatorType = "sine") {
  const c = ac();
  if (!c) return;
  const t = c.currentTime + at;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(c.destination);
  osc.start(t);
  osc.stop(t + dur + 0.05);
}

export const sfx = {
  correct() {
    note(659.25, 0);
    note(987.77, 0.09, 0.18);
  },
  wrong() {
    note(196, 0, 0.22, 0.045, "triangle");
  },
  join() {
    note(523.25, 0, 0.09, 0.045);
  },
  fanfare() {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => note(f, i * 0.12, 0.25));
  },
};
