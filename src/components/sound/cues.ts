import type { RoundState, SideState } from "@/game/round";
import { displayStage } from "@/components/match/display";
import type { SoundName } from "./sounds";

// Which §23 sounds a change in round state should trigger. Pure, so the mapping is
// unit-tested against the real engine; the UI only calls play() with the result.

const began = (prev: SideState, next: SideState, kind: SideState["kind"]) => prev.kind !== kind && next.kind === kind;

/** The parts of a round the cues read: the engine state, or the browser's drawing of it. */
type CueRound = Pick<RoundState, "clockMs" | "intervalMs" | "player" | "bot">;

export function roundCues(prev: CueRound, next: CueRound): SoundName[] {
  if (prev === next) return [];
  const cues: SoundName[] = [];
  if (displayStage(next) > displayStage(prev)) cues.push("reveal");
  // Either side's buzz: hearing the bot buzz is how the player notices it.
  if (began(prev.player, next.player, "answering") || began(prev.bot, next.bot, "answering")) cues.push("buzz");
  // Only the player's own outcome; the bot's shows on the scoreboard.
  if (began(prev.player, next.player, "correct")) cues.push("correct");
  if (began(prev.player, next.player, "wrong")) cues.push("wrong");
  return cues;
}
