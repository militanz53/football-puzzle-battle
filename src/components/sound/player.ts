import { type SoundName, SOUNDS, type Tone } from "./sounds";

// Plays the §23 sounds through one shared AudioContext and keeps the mute
// preference in localStorage. Browser-only at call time; importing is safe anywhere.

export const STORAGE_KEY = "fpb:sound";
const MASTER_GAIN = 0.6;
/** React StrictMode runs mount effects twice in development; drop exact repeats. */
const REPEAT_WINDOW_MS = 30;

// ---------------------------------------------------------------------------
// Mute preference (a tiny external store for useSyncExternalStore)
// ---------------------------------------------------------------------------

let muted: boolean | null = null;
const listeners = new Set<() => void>();

/** "off" means muted; anything else, a missing key or blocked storage means sound on. */
export function readMuted(storage: Pick<Storage, "getItem"> | undefined): boolean {
  try {
    return storage?.getItem(STORAGE_KEY) === "off";
  } catch {
    return false;
  }
}

function localStore(): Storage | undefined {
  try {
    return typeof window === "undefined" ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}

export function isMuted(): boolean {
  if (muted === null) muted = readMuted(localStore());
  return muted;
}

/** Sound is on until the player turns it off, and on the server render. */
export const isMutedOnServer = () => false;

export function setMuted(value: boolean): void {
  muted = value;
  try {
    localStore()?.setItem(STORAGE_KEY, value ? "off" : "on");
  } catch {
    // Private mode or blocked storage: the choice still holds for this page.
  }
  listeners.forEach((l) => l());
}

export function subscribeMuted(listener: () => void): () => void {
  listeners.add(listener);
  // Another tab changed the setting.
  const onStorage = (e: StorageEvent) => {
    if (e.key !== STORAGE_KEY) return;
    muted = null;
    listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

// ---------------------------------------------------------------------------
// Playback
// ---------------------------------------------------------------------------

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
const lastPlayed = new Map<SoundName, number>();

function audio(): { ctx: AudioContext; out: GainNode } | null {
  if (typeof window === "undefined") return null;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!ctx || !master) {
    ctx = new Ctor();
    master = ctx.createGain();
    master.gain.value = MASTER_GAIN;
    master.connect(ctx.destination);
  }
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  return { ctx, out: master };
}

/**
 * Plays a sound unless muted. `rate` scales every frequency (the score counter
 * uses it to climb in pitch). Before the first tap the browser keeps audio
 * suspended; sounds are skipped then rather than queued up and fired late.
 */
export function play(name: SoundName, { rate = 1 }: { rate?: number } = {}): void {
  if (isMuted()) return;
  const now = performance.now();
  if (now - (lastPlayed.get(name) ?? -Infinity) < REPEAT_WINDOW_MS) return;
  lastPlayed.set(name, now);

  const a = audio();
  if (!a || a.ctx.state !== "running") return;
  scheduleTones(a.ctx, a.out, SOUNDS[name], a.ctx.currentTime, rate);
}

/** One oscillator + gain envelope per tone, so every sound stays click-free. */
export function scheduleTones(
  c: BaseAudioContext,
  out: AudioNode,
  tones: Tone[],
  t0: number,
  rate = 1,
): void {
  for (const tone of tones) {
    const start = t0 + tone.at;
    const end = start + tone.dur;
    const attack = Math.min(0.01, tone.dur / 4);

    const osc = c.createOscillator();
    osc.type = tone.wave;
    osc.frequency.setValueAtTime(tone.freq * rate, start);
    if (tone.to) osc.frequency.exponentialRampToValueAtTime(tone.to * rate, end);

    const env = c.createGain();
    env.gain.setValueAtTime(0.0001, start);
    env.gain.exponentialRampToValueAtTime(tone.gain, start + attack);
    env.gain.exponentialRampToValueAtTime(0.0001, end);

    osc.connect(env).connect(out);
    osc.start(start);
    osc.stop(end + 0.02);
  }
}
