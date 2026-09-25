import { afterEach, describe, expect, it, vi } from "vitest";
import { careerPuzzle } from "@/game/__fixtures__/careerPuzzle";
import type { BotPlan } from "@/game/bot";
import { createRound, roundReducer, type RoundEvent, type RoundState } from "@/game/round";
import { roundCues } from "./cues";
import { readMuted, scheduleTones, STORAGE_KEY } from "./player";
import { type SoundName, SOUNDS, soundLength } from "./sounds";

const NAMES = Object.keys(SOUNDS) as SoundName[];

describe("§23 sound set", () => {
  it("has all eight sounds, and no stadium ambience", () => {
    expect(NAMES.sort()).toEqual(["buzz", "correct", "defeat", "reveal", "roundStart", "score", "victory", "wrong"]);
  });

  it.each(NAMES)("%s uses sane, audible tones", (name) => {
    expect(SOUNDS[name].length).toBeGreaterThan(0);
    for (const t of SOUNDS[name]) {
      expect(t.at).toBeGreaterThanOrEqual(0);
      expect(t.dur).toBeGreaterThan(0);
      for (const f of [t.freq, t.to ?? t.freq]) {
        expect(f).toBeGreaterThanOrEqual(80);
        expect(f).toBeLessThanOrEqual(4000);
      }
      expect(t.gain).toBeGreaterThan(0);
      expect(t.gain).toBeLessThanOrEqual(0.25); // stays gentle; the master gain scales it further
    }
  });

  it("keeps the in-round sounds short so they never overlap the next event", () => {
    expect(soundLength("reveal")).toBeLessThanOrEqual(0.1);
    expect(soundLength("score")).toBeLessThanOrEqual(0.055); // shorter than one counter step
    for (const name of ["buzz", "roundStart", "correct", "wrong"] as const) expect(soundLength(name)).toBeLessThanOrEqual(0.6);
  });

  it("gives the match end a longer sound, victory brighter than defeat", () => {
    expect(soundLength("victory")).toBeGreaterThan(soundLength("correct"));
    expect(soundLength("victory")).toBeLessThanOrEqual(1.5);
    expect(soundLength("defeat")).toBeLessThanOrEqual(1.5);
    const top = (n: SoundName) => Math.max(...SOUNDS[n].map((t) => t.freq));
    expect(top("defeat")).toBeLessThan(top("victory"));
  });

  it("rises for a correct answer and falls for a wrong one", () => {
    const pitches = (n: SoundName) => SOUNDS[n].map((t) => t.to ?? t.freq);
    const correct = pitches("correct");
    expect(correct).toEqual([...correct].sort((a, b) => a - b));
    const wrong = pitches("wrong");
    expect(wrong).toEqual([...wrong].sort((a, b) => b - a));
  });
});

describe("roundCues", () => {
  const plan = (p: Partial<BotPlan> = {}): BotPlan => ({ buzzReveal: 5, buzzAtMs: 99_000, answerDelayMs: 2000, correct: false, ...p });
  const tick = (dtMs: number): RoundEvent => ({ type: "tick", dtMs });
  /** Applies events one by one and collects every cue along the way. */
  function cuesFor(start: RoundState, events: RoundEvent[]): SoundName[] {
    let s = start;
    const out: SoundName[] = [];
    for (const e of events) {
      const next = roundReducer(s, e);
      out.push(...roundCues(s, next));
      s = next;
    }
    return out;
  }

  it("pops once for every new clue, not on ticks within a clue", () => {
    const ticks = Array.from({ length: 150 }, () => tick(100)); // the whole 15 s window
    expect(cuesFor(createRound(careerPuzzle, plan()), ticks)).toEqual(["reveal", "reveal", "reveal", "reveal"]);
  });

  it("buzzes, then sounds the player's correct answer", () => {
    const events: RoundEvent[] = [{ type: "buzz" }, { type: "submit", text: "Ibra" }];
    expect(cuesFor(createRound(careerPuzzle, plan()), events)).toEqual(["buzz", "correct"]);
  });

  it("sounds wrong for a wrong answer and for running out of answer time", () => {
    const s = createRound(careerPuzzle, plan());
    expect(cuesFor(s, [{ type: "buzz" }, { type: "submit", text: "Messi" }])).toEqual(["buzz", "wrong"]);
    expect(cuesFor(s, [{ type: "buzz" }, tick(8000)])).toEqual(["buzz", "wrong"]);
  });

  it("buzzes when the bot buzzes, but leaves the bot's result silent", () => {
    const s = createRound(careerPuzzle, plan({ buzzReveal: 1, buzzAtMs: 500, correct: true }));
    expect(cuesFor(s, [tick(600), tick(2000)])).toEqual(["buzz"]);
  });
});

describe("mute preference", () => {
  const storage = (value: string | null) => ({ getItem: (k: string) => (k === STORAGE_KEY ? value : null) });

  it("defaults to sound on", () => {
    expect(readMuted(storage(null))).toBe(false);
    expect(readMuted(undefined)).toBe(false);
  });

  it('remembers "off"', () => {
    expect(readMuted(storage("off"))).toBe(true);
    expect(readMuted(storage("on"))).toBe(false);
  });

  it("falls back to sound on when storage is blocked", () => {
    expect(readMuted({ getItem: () => { throw new Error("SecurityError"); } })).toBe(false);
  });
});

describe("scheduleTones", () => {
  afterEach(() => vi.restoreAllMocks());

  it("gives every tone its own oscillator and fade, at the right time and pitch", () => {
    const param = () => ({ setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() });
    const oscillators: { type: string; frequency: ReturnType<typeof param>; start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn> }[] = [];
    const node = () => ({ connect: vi.fn((n) => n) });
    const ctx = {
      createOscillator: () => {
        const o = { ...node(), type: "", frequency: param(), start: vi.fn(), stop: vi.fn() };
        oscillators.push(o);
        return o;
      },
      createGain: () => ({ ...node(), gain: param() }),
    };

    scheduleTones(ctx as unknown as BaseAudioContext, node() as unknown as AudioNode, SOUNDS.correct, 10, 1.5);

    expect(oscillators).toHaveLength(SOUNDS.correct.length);
    SOUNDS.correct.forEach((tone, i) => {
      const o = oscillators[i];
      expect(o.type).toBe(tone.wave);
      expect(o.frequency.setValueAtTime).toHaveBeenCalledWith(tone.freq * 1.5, 10 + tone.at);
      expect(o.start).toHaveBeenCalledWith(10 + tone.at);
      expect(o.stop.mock.calls[0][0]).toBeGreaterThan(10 + tone.at + tone.dur);
    });
  });
});
