// GDD §23 sound design, synthesised with the Web Audio API: no audio files, so no
// licensing and nothing to download. Each sound is a list of oscillator tones; this
// file is plain data so it can be unit-tested without a browser. Stadium ambience
// (optional in §23) needs a real recording and is out of MVP scope.

export type SoundName =
  | "buzz"
  | "correct"
  | "wrong"
  | "reveal"
  | "roundStart"
  | "score"
  | "victory"
  | "defeat";

export interface Tone {
  /** Start, in seconds after the sound is triggered. */
  at: number;
  /** Length in seconds, including the fade-out. */
  dur: number;
  /** Frequency in Hz at the start. */
  freq: number;
  /** Frequency at the end, for a glide; omitted means a steady pitch. */
  to?: number;
  wave: OscillatorType;
  /** Peak volume, 0-1, before the master gain. */
  gain: number;
}

// Equal-tempered note frequencies used below.
const NOTE = {
  C4: 261.63, D4: 293.66, E4: 329.63, G4: 392.0,
  C5: 523.25, E5: 659.25, G5: 783.99, A5: 880.0, C6: 1046.5,
};

/** One arpeggio note per entry, `step` seconds apart. */
const notes = (freqs: number[], step: number, dur: number, wave: OscillatorType, gain: number): Tone[] =>
  freqs.map((freq, i) => ({ at: i * step, dur, freq, wave, gain }));

export const SOUNDS: Record<SoundName, Tone[]> = {
  // Short game-show buzzer: two slightly detuned low square waves.
  buzz: [
    { at: 0, dur: 0.2, freq: 146, to: 138, wave: "square", gain: 0.16 },
    { at: 0, dur: 0.2, freq: 151, to: 142, wave: "square", gain: 0.12 },
  ],
  // Rising major arpeggio, last note held a little.
  correct: [
    ...notes([NOTE.C5, NOTE.E5, NOTE.G5], 0.08, 0.1, "triangle", 0.22),
    { at: 0.24, dur: 0.28, freq: NOTE.C6, wave: "triangle", gain: 0.22 },
  ],
  // Two falling tones.
  wrong: [
    { at: 0, dur: 0.16, freq: 330, to: 294, wave: "sawtooth", gain: 0.1 },
    { at: 0.15, dur: 0.26, freq: 262, to: 196, wave: "sawtooth", gain: 0.1 },
  ],
  // Soft pop for every new clue.
  reveal: [{ at: 0, dur: 0.06, freq: 1100, to: 700, wave: "sine", gain: 0.12 }],
  // Two quick ascending beeps: "ready, go".
  roundStart: notes([NOTE.E5, NOTE.A5], 0.11, 0.09, "triangle", 0.16),
  // One tick of the points counter; the caller raises the pitch as it counts.
  score: [{ at: 0, dur: 0.035, freq: 1300, wave: "sine", gain: 0.07 }],
  // Fanfare into a held major chord (~1.1 s).
  victory: [
    ...notes([NOTE.G4, NOTE.C5, NOTE.E5, NOTE.G5], 0.11, 0.13, "triangle", 0.2),
    ...[NOTE.C5, NOTE.E5, NOTE.G5, NOTE.C6].map((freq) => ({ at: 0.46, dur: 0.65, freq, wave: "triangle" as const, gain: 0.11 })),
  ],
  // Slow, low, falling line; neutral rather than harsh (~1 s).
  defeat: [
    ...notes([NOTE.E4, NOTE.D4], 0.22, 0.24, "sine", 0.18),
    { at: 0.44, dur: 0.55, freq: NOTE.C4, to: NOTE.C4 * 0.97, wave: "sine", gain: 0.18 },
  ],
};

/** Seconds from trigger until the last tone has faded. */
export function soundLength(name: SoundName): number {
  return Math.max(...SOUNDS[name].map((t) => t.at + t.dur));
}
