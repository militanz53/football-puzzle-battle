import type { PhotoRevealPuzzle } from "@/game/types";
import { shared } from "./shared";

// §9.2.1: illustrations only, never a photo. `illustration` parameters drive the
// placeholder SVG and double as a brief for the illustrator (look + kit of that era).

const STAGE_LABELS = [
  "Hair & kit detail",
  "Torso",
  "Team colours",
  "Part of the face",
  "Full illustration",
];

const KIT = {
  barcelona: { primary: "#A50044", secondary: "#004D98", pattern: "stripes" },
  colombia: { primary: "#FCD116", secondary: "#003893", pattern: "plain" },
  france: { primary: "#1D3F8F", secondary: "#FFFFFF", pattern: "plain" },
  juventus: { primary: "#F5F5F5", secondary: "#111111", pattern: "stripes" },
  realMadrid: { primary: "#F5F5F5", secondary: "#1B2A6B", pattern: "plain" },
  brazil: { primary: "#FFDC02", secondary: "#009C3B", pattern: "plain" },
  milan: { primary: "#C8102E", secondary: "#111111", pattern: "stripes" },
  manUnited: { primary: "#DA291C", secondary: "#FFFFFF", pattern: "plain" },
} as const;

type Look = PhotoRevealPuzzle["reveal_data"]["illustration"];

function photo(
  id: string,
  difficulty: PhotoRevealPuzzle["difficulty"],
  correct_answer: string,
  answer_aliases: string[],
  tags: string[],
  illustration: Look,
): PhotoRevealPuzzle {
  return {
    ...shared,
    id,
    type: "photo_reveal",
    difficulty,
    question: "Who is the player?",
    correct_answer,
    answer_aliases,
    tags,
    image_source: "illustration",
    reveal_data: { illustration, stage_labels: STAGE_LABELS },
  };
}

export const photoRevealPuzzles: PhotoRevealPuzzle[] = [
  photo("photo_001", "medium", "Carles Puyol", ["Puyol", "Carlos Puyol"], ["defender", "captain"], {
    hair: "curly-long", hairColor: "#3B2A1E", skin: "#D2A07C",
    kit: KIT.barcelona, captainArmband: true, beard: false,
  }),

  // --- Easy -----------------------------------------------------------------
  // Colombia captain; the big blond curls are the giveaway.
  photo("photo_002", "easy", "Carlos Valderrama", ["Valderrama", "El Pibe", "Pibe Valderrama"], ["colombia", "midfielder", "captain"], {
    hair: "curly-long", hairColor: "#D9B45A", skin: "#C68E62",
    kit: KIT.colombia, captainArmband: true, beard: false,
  }),
  photo("photo_003", "easy", "Ronaldinho", ["Ronaldinho Gaúcho", "Dinho"], ["barcelona", "brazil", "forward"], {
    hair: "curly-long", hairColor: "#1A1411", skin: "#8D5A3B",
    kit: KIT.barcelona, captainArmband: false, beard: false,
  }),
  photo("photo_004", "easy", "Zinedine Zidane", ["Zidane", "Zizou", "Zinedine"], ["france", "midfielder"], {
    hair: "bald", hairColor: "#4A3A2C", skin: "#D9A77E",
    kit: KIT.france, captainArmband: false, beard: false,
  }),

  // --- Medium ---------------------------------------------------------------
  photo("photo_005", "medium", "Andrea Pirlo", ["Pirlo"], ["juventus", "italy", "midfielder"], {
    hair: "curly-long", hairColor: "#3A2A1F", skin: "#E0B08A",
    kit: KIT.juventus, captainArmband: false, beard: true,
  }),
  // Real Madrid captain 2015-2021.
  photo("photo_006", "medium", "Sergio Ramos", ["Ramos"], ["real-madrid", "spain", "defender", "captain"], {
    hair: "short", hairColor: "#2B2018", skin: "#D6A07A",
    kit: KIT.realMadrid, captainArmband: true, beard: true,
  }),
  photo("photo_007", "medium", "Roberto Carlos", ["Roberto Carlos da Silva", "R. Carlos"], ["brazil", "defender"], {
    hair: "bald", hairColor: "#1A1411", skin: "#7A4A2E",
    kit: KIT.brazil, captainArmband: false, beard: false,
  }),

  // --- Hard -----------------------------------------------------------------
  // Dreadlocks approximated by the placeholder's long curls.
  photo("photo_008", "hard", "Ruud Gullit", ["Gullit"], ["ac-milan", "netherlands", "midfielder"], {
    hair: "curly-long", hairColor: "#1A1411", skin: "#6B4228",
    kit: KIT.milan, captainArmband: false, beard: false,
  }),
  photo("photo_009", "hard", "Jaap Stam", ["Stam"], ["manchester-united", "netherlands", "defender"], {
    hair: "bald", hairColor: "#5A4632", skin: "#EAC2A0",
    kit: KIT.manUnited, captainArmband: false, beard: false,
  }),
  photo("photo_010", "hard", "Gennaro Gattuso", ["Gattuso", "Rino Gattuso", "Rino"], ["ac-milan", "italy", "midfielder"], {
    hair: "short", hairColor: "#2B2018", skin: "#DDA982",
    kit: KIT.milan, captainArmband: false, beard: true,
  }),
];
