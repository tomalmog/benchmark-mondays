export const SUITS = ["h", "d", "c", "s"] as const; // hearts, diamonds, clubs, spades
export const RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "T", "J", "Q", "K", "A"] as const;

export type Suit = (typeof SUITS)[number];
export type Rank = (typeof RANKS)[number];
export type Card = `${Rank}${Suit}`; // e.g. "Ah", "Td", "2c"

export const RANK_VALUE: Record<Rank, number> = {
  "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "8": 8,
  "9": 9, "T": 10, "J": 11, "Q": 12, "K": 13, "A": 14,
};

export function cardRank(card: Card): Rank {
  return card[0] as Rank;
}

export function cardSuit(card: Card): Suit {
  return card[1] as Suit;
}

export function cardValue(card: Card): number {
  return RANK_VALUE[cardRank(card)];
}

export function formatCard(card: Card): string {
  const suitSymbols: Record<Suit, string> = { h: "♥", d: "♦", c: "♣", s: "♠" };
  return `${cardRank(card)}${suitSymbols[cardSuit(card)]}`;
}

export function formatCards(cards: Card[]): string {
  return cards.map(formatCard).join(" ");
}

/** Create a full 52-card deck */
export function createDeck(): Card[] {
  const deck: Card[] = [];
  for (const rank of RANKS) {
    for (const suit of SUITS) {
      deck.push(`${rank}${suit}` as Card);
    }
  }
  return deck;
}

/** Shuffle a deck using Fisher-Yates with a seeded RNG */
export function shuffleDeck(deck: Card[], rng: () => number): Card[] {
  const shuffled = [...deck];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}
