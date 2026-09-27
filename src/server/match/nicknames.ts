import type { Rng } from "@/game/bot";

// Display names for the Quick Match opponent when no real player turns up and the
// bot takes the match (GDD §13.1, §29.1). They should read like names people pick
// for themselves: first names with numbers, birth years, fan handles. Nothing here
// may ever say "bot" (tested).

const FIRST_NAMES = [
  "Emre", "Can", "Mert", "Burak", "Kaan", "Efe", "Arda", "Deniz", "Yusuf", "Ali", "Oğuz", "Serkan", "Onur",
  "Tolga", "Barış", "Cem", "Eren", "Kerem", "Hakan", "Murat", "Selin", "Elif", "Zeynep", "Ece", "Melis",
  "Berk", "Ozan", "Umut", "Alper", "Sinan", "Batu", "Ege", "Doruk", "Tuna", "Aras", "İlker", "Gökhan",
  "Lucas", "Mateo", "Leo", "Jonas", "Luca", "Nico", "Sami", "Theo", "Marco", "Diego", "Omar", "Karim",
];

/** Short fan handles, used as they are or with a number. */
const HANDLES = [
  "FutbolKralı", "GolMakinesi", "TribünSesi", "KaleciUsta", "OrtaSahaBeyni", "SonDakikaGolü", "TikiTakaTR",
  "OfsaytYok", "PenaltıUstası", "FrikikUstası", "KontraAtak", "Libero", "Forvet", "SolBek", "SağKanat",
  "Maestro", "TopSever", "FutbolAşığı", "Taraftar", "GolcüRuhu", "Kanat", "Stoper", "OnNumara", "Kaptan",
  "PasUstası", "RövaşataTR", "KornerGol", "Tribün", "UzatmaGolü", "DerbiAşkı",
];

/** Players people name themselves after, with their shirt numbers. */
const IDOLS: [string, number][] = [
  ["Messi", 10], ["Ronaldo", 7], ["Zidane", 5], ["Hagi", 10], ["Alex", 10], ["Neymar", 11], ["Mbappe", 7],
  ["Haaland", 9], ["Arda", 10], ["Icardi", 9], ["Modric", 10], ["Pirlo", 21], ["Totti", 10], ["Iniesta", 8],
];

const pick = <T>(items: readonly T[], rng: Rng): T => items[Math.floor(rng() * items.length)];
const int = (min: number, max: number, rng: Rng) => min + Math.floor(rng() * (max - min + 1));
const pad2 = (n: number) => String(n).padStart(2, "0");

const PATTERNS: ((rng: Rng) => string)[] = [
  (rng) => `${pick(FIRST_NAMES, rng)}_${pad2(int(1, 81, rng))}`, // Emre_34 (plate codes)
  (rng) => `${pick(FIRST_NAMES, rng)}${int(1988, 2011, rng)}`, // Can2004
  // Turkish-aware lower case: "İlker" must become "ilker", not "i̇lker".
  (rng) => `${pick(FIRST_NAMES, rng).toLocaleLowerCase("tr")}${pick(FIRST_NAMES, rng)[0].toLocaleLowerCase("tr")}${int(1, 99, rng)}`, // burakk23
  (rng) => {
    const [name, shirt] = pick(IDOLS, rng);
    return rng() < 0.5 ? `${name}${shirt}Fan` : `${name}_${shirt}`; // Messi10Fan, Hagi_10
  },
  (rng) => pick(HANDLES, rng), // FutbolKralı
  (rng) => `${pick(HANDLES, rng)}${int(1, 99, rng)}`, // Libero77
];

export const MAX_NICKNAME_LENGTH = 16;

/** A believable player name, 3-16 characters. */
export function randomNickname(rng: Rng): string {
  for (let attempt = 0; attempt < 20; attempt++) {
    const name = pick(PATTERNS, rng)(rng);
    if (name.length >= 3 && name.length <= MAX_NICKNAME_LENGTH && !/bot/i.test(name)) return name;
  }
  return `${pick(FIRST_NAMES, rng)}_${pad2(int(1, 81, rng))}`;
}
