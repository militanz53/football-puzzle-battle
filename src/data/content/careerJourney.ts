import type { CareerJourneyPuzzle } from "@/game/types";
import { shared } from "./shared";

// Senior club careers from the Wikipedia infobox "Senior career" tables.
// Reserve/B teams are left out. Loans are noted per puzzle.
// §9.4 tiers: easy = "Club (years)", medium = club names, hard = home city or country only.

function career(
  id: string,
  difficulty: CareerJourneyPuzzle["difficulty"],
  correct_answer: string,
  answer_aliases: string[],
  tags: string[],
  clubs: string[],
): CareerJourneyPuzzle {
  return {
    ...shared,
    id,
    type: "career_journey",
    difficulty,
    question: "Who is the player?",
    correct_answer,
    answer_aliases,
    tags,
    reveal_data: { clubs },
  };
}

export const careerJourneyPuzzles: CareerJourneyPuzzle[] = [
  career("career_001", "medium", "Zlatan Ibrahimović", ["Ibrahimovic", "Zlatan", "Ibra"], ["striker", "sweden"], [
    "Ajax", "Juventus", "Inter", "Barcelona", "AC Milan", "PSG",
  ]),

  // --- Easy: club + years ---------------------------------------------------
  career("career_002", "easy", "Cristiano Ronaldo", ["Ronaldo", "CR7", "Cristiano"], ["forward", "portugal"], [
    "Sporting CP (2002–03)",
    "Manchester United (2003–09)",
    "Real Madrid (2009–18)",
    "Juventus (2018–21)",
    "Manchester United (2021–22)",
    "Al-Nassr (2023–)",
  ]),
  // Arsenal loan in 2012 (during the New York spell) left out.
  career("career_003", "easy", "Thierry Henry", ["Henry", "Titi"], ["forward", "france"], [
    "Monaco (1994–99)",
    "Juventus (1999)",
    "Arsenal (1999–2007)",
    "Barcelona (2007–10)",
    "New York Red Bulls (2010–14)",
  ]),
  career("career_004", "easy", "Ronaldo Nazário", ["Ronaldo", "R9", "Ronaldo Nazario", "O Fenômeno", "Il Fenomeno"], ["forward", "brazil"], [
    "Cruzeiro (1993–94)",
    "PSV (1994–96)",
    "Barcelona (1996–97)",
    "Inter (1997–2002)",
    "Real Madrid (2002–07)",
    "AC Milan (2007–08)",
    "Corinthians (2009–11)",
  ]),

  // --- Medium: club names ---------------------------------------------------
  career("career_005", "medium", "Luis Suárez", ["Suárez", "Suarez", "El Pistolero"], ["forward", "uruguay"], [
    "Nacional", "Groningen", "Ajax", "Liverpool", "Barcelona", "Atlético Madrid", "Nacional", "Grêmio", "Inter Miami",
  ]),
  // AC Milan and the second Atlético spell both began as loans before becoming permanent.
  career("career_006", "medium", "Fernando Torres", ["Torres", "El Niño", "Nando"], ["forward", "spain"], [
    "Atlético Madrid", "Liverpool", "Chelsea", "AC Milan", "Atlético Madrid", "Sagan Tosu",
  ]),
  career("career_007", "medium", "Arjen Robben", ["Robben"], ["winger", "netherlands"], [
    "Groningen", "PSV", "Chelsea", "Real Madrid", "Bayern Munich", "Groningen",
  ]),

  // --- Hard: cities or countries only ---------------------------------------
  // Home cities. Real Madrid → Mallorca → Barcelona → Inter → Anzhi → Chelsea → Everton →
  // Sampdoria → Antalyaspor → Konyaspor → Qatar SC. Early loans to Leganés and Espanyol left out.
  career("career_008", "hard", "Samuel Eto'o", ["Eto'o", "Etoo", "Samuel Etoo"], ["forward", "cameroon"], [
    "Madrid", "Palma", "Barcelona", "Milan", "Makhachkala", "London", "Liverpool", "Genoa", "Antalya", "Konya", "Doha",
  ]),
  // Home cities, loans included: PSG → Arsenal → Real Madrid → PSG → Liverpool (loan) → Man City →
  // Fenerbahçe → Bolton → Chelsea → Shanghai Shenhua → Juventus (loan) → West Brom → Mumbai City.
  career("career_009", "hard", "Nicolas Anelka", ["Anelka"], ["forward", "france"], [
    "Paris", "London", "Madrid", "Paris", "Liverpool", "Manchester", "Istanbul", "Bolton", "London", "Shanghai",
    "Turin", "West Bromwich", "Mumbai",
  ]),
  // Countries, loans included: Lanceros Boyacá → River Plate → Porto → Atlético Madrid → Monaco →
  // Man United (loan) → Chelsea (loan) → Galatasaray → Rayo Vallecano → Millonarios.
  // Monaco's return after the loans is not repeated.
  career("career_010", "hard", "Radamel Falcao", ["Falcao", "El Tigre", "Falcao García"], ["striker", "colombia"], [
    "Colombia", "Argentina", "Portugal", "Spain", "France", "England", "England", "Turkey", "Spain", "Colombia",
  ]),
];
