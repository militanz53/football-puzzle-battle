import type { Puzzle, PuzzleType } from "@/game/types";
import { CareerJourneyBoard } from "./CareerJourneyBoard";
import { GoalMapBoard } from "./GoalMapBoard";
import { MissingXIBoard } from "./MissingXIBoard";
import { Illustration, PhotoRevealBoard } from "./PhotoRevealBoard";
import { TeammateWebBoard } from "./TeammateWebBoard";

export const PUZZLE_LABEL: Record<PuzzleType, string> = {
  goal_map: "Goal Map",
  photo_reveal: "Photo Reveal",
  missing_xi: "Missing XI",
  career_journey: "Career Journey",
  teammate_web: "Teammate Web",
};

/** The visual layer for any puzzle type at a given reveal stage (1-5). */
export function PuzzleBoard({ puzzle, revealed }: { puzzle: Puzzle; revealed: number }) {
  switch (puzzle.type) {
    case "goal_map":
      return <GoalMapBoard puzzle={puzzle} revealed={revealed} />;
    case "photo_reveal":
      return <PhotoRevealBoard puzzle={puzzle} revealed={revealed} />;
    case "missing_xi":
      return <MissingXIBoard puzzle={puzzle} revealed={revealed} />;
    case "career_journey":
      return <CareerJourneyBoard clubs={puzzle.reveal_data.clubs} revealed={revealed} />;
    case "teammate_web":
      return <TeammateWebBoard puzzle={puzzle} revealed={revealed} />;
  }
}

const Arrowed = ({ items }: { items: string[] }) => (
  <p className="flex flex-wrap gap-x-2 gap-y-1 text-[15px] font-semibold leading-relaxed text-text-primary">
    {items.map((item, i) => (
      <span key={i} className="whitespace-nowrap">
        {i > 0 && <span className="mr-2 text-text-muted">→</span>}
        {item}
      </span>
    ))}
  </p>
);

const Dotted = ({ items }: { items: string[] }) => (
  <p className="text-[15px] font-semibold leading-relaxed text-text-primary">{items.join(" · ")}</p>
);

/** Everything the puzzle had to show, for the round result screen (§11). */
export function PuzzleRecap({ puzzle }: { puzzle: Puzzle }) {
  let title: string;
  let body: React.ReactNode;
  switch (puzzle.type) {
    case "goal_map":
      title = "The goal";
      body = <Dotted items={puzzle.reveal_data.clues.map((c) => c.value)} />;
      break;
    case "photo_reveal":
      title = "Full illustration";
      body = (
        <div className="flex items-center gap-3">
          <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-bg-primary">
            <Illustration params={puzzle.reveal_data.illustration} stage={5} />
          </div>
          <p className="text-sm text-text-secondary">Placeholder art until the final illustration is made.</p>
        </div>
      );
      break;
    case "missing_xi":
      title = `${puzzle.reveal_data.team} line-up`;
      body = <Dotted items={puzzle.reveal_data.clues.map((c) => c.value)} />;
      break;
    case "career_journey":
      title = "Full career";
      body = <Arrowed items={puzzle.reveal_data.clubs} />;
      break;
    case "teammate_web":
      title = "Teammates";
      body = <Dotted items={puzzle.reveal_data.players} />;
      break;
  }
  return (
    <>
      <p className="font-display text-xs font-semibold uppercase tracking-widest text-text-muted">{title}</p>
      <div className="mt-2">{body}</div>
    </>
  );
}
