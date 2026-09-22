import type { TeammateWebPuzzle } from "@/game/types";
import { shared } from "./shared";

// Club teammates only (no national teams). Players are listed hardest first: reveal 1
// shows the first two, each later reveal adds the next. Sets span several of the
// connector's clubs so that nobody else fits all six.

function web(
  id: string,
  difficulty: TeammateWebPuzzle["difficulty"],
  correct_answer: string,
  answer_aliases: string[],
  tags: string[],
  players: string[],
): TeammateWebPuzzle {
  return {
    ...shared,
    id,
    type: "teammate_web",
    difficulty,
    question: "Which player connects them?",
    correct_answer,
    answer_aliases,
    tags,
    reveal_data: { players },
  };
}

export const teammateWebPuzzles: TeammateWebPuzzle[] = [
  // Barcelona, Juventus and PSG.
  web("teammate_001", "medium", "Dani Alves", ["Alves", "Daniel Alves"], ["defender", "brazil"], [
    "Buffon", "Mbappé", "Iniesta", "Suárez", "Neymar", "Messi",
  ]),

  // --- Easy -----------------------------------------------------------------
  // Al-Nassr, Sporting CP, Juventus, Real Madrid, Manchester United.
  web("teammate_002", "easy", "Cristiano Ronaldo", ["Ronaldo", "CR7", "Cristiano"], ["forward", "portugal"], [
    "Sadio Mané", "Quaresma", "Buffon", "Benzema", "Rooney", "Modrić",
  ]),
  // Ajax, Juventus, Inter, AC Milan, Manchester United, Barcelona.
  web("teammate_003", "easy", "Zlatan Ibrahimović", ["Ibrahimovic", "Zlatan", "Ibra"], ["striker", "sweden"], [
    "Van der Vaart", "Del Piero", "Figo", "Thiago Silva", "Pogba", "Messi",
  ]),
  // Santos, Al-Hilal, PSG, Barcelona.
  web("teammate_004", "easy", "Neymar", ["Neymar Jr", "Neymar Júnior"], ["forward", "brazil"], [
    "Ganso", "Mitrović", "Sergio Ramos", "Suárez", "Mbappé", "Messi",
  ]),

  // --- Medium ---------------------------------------------------------------
  // LA Galaxy, PSG (2013), AC Milan (2009 loan), Real Madrid, Manchester United.
  web("teammate_005", "medium", "David Beckham", ["Beckham", "Becks"], ["midfielder", "england"], [
    "Landon Donovan", "Ibrahimović", "Ronaldinho", "Zidane", "Scholes", "Giggs",
  ]),
  // PSG 2008-11 (Giuly), Real Madrid 2000-03, Chelsea 2003-08.
  web("teammate_006", "medium", "Claude Makélélé", ["Makélélé", "Makelele", "Claude Makelele"], ["midfielder", "france"], [
    "Giuly", "Figo", "Zidane", "Drogba", "Terry", "Lampard",
  ]),
  // Bayern 2014-17, Liverpool 2004-09, Real Madrid 2009-14.
  web("teammate_007", "medium", "Xabi Alonso", ["Alonso", "Xabi"], ["midfielder", "spain"], [
    "Lewandowski", "Torres", "Casillas", "Müller", "Gerrard", "Cristiano Ronaldo",
  ]),

  // --- Hard -----------------------------------------------------------------
  // Sampdoria 1995-96, Ajax, Inter, Real Madrid, AC Milan.
  web("teammate_008", "hard", "Clarence Seedorf", ["Seedorf"], ["midfielder", "netherlands"], [
    "Mancini", "Kluivert", "Zanetti", "Raúl", "Pirlo", "Maldini",
  ]),
  // Lazio, Inter 2002-03, Parma, AC Milan (2004-05 loan), Chelsea, Inter (2006-08 loan).
  web("teammate_009", "hard", "Hernán Crespo", ["Crespo", "Hernan Crespo", "Valdanito"], ["striker", "argentina"], [
    "Nesta", "Vieri", "Buffon", "Kaká", "Lampard", "Ibrahimović",
  ]),
  // Leverkusen, Monaco (from January 2014), Tottenham, Manchester United.
  web("teammate_010", "hard", "Dimitar Berbatov", ["Berbatov", "Berba"], ["striker", "bulgaria"], [
    "Lúcio", "James Rodríguez", "Robbie Keane", "Ballack", "Tevez", "Rooney",
  ]),
];
