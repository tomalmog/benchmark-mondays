import { Card, cardRank, cardSuit, cardValue, Rank, Suit } from "./cards.js";

/**
 * Hand rankings (higher = better):
 * 9 = Royal Flush
 * 8 = Straight Flush
 * 7 = Four of a Kind
 * 6 = Full House
 * 5 = Flush
 * 4 = Straight
 * 3 = Three of a Kind
 * 2 = Two Pair
 * 1 = One Pair
 * 0 = High Card
 */

export interface HandResult {
  rank: number;       // 0-9
  name: string;       // "Full House", etc.
  score: number;      // comparable score (higher = better)
  bestCards: Card[];   // the 5 best cards
}

/** Evaluate the best 5-card hand from 5-7 cards */
export function evaluateHand(cards: Card[]): HandResult {
  if (cards.length < 5) throw new Error("Need at least 5 cards");

  // Generate all 5-card combinations
  const combos = combinations(cards, 5);
  let best: HandResult | null = null;

  for (const combo of combos) {
    const result = evaluate5(combo);
    if (!best || result.score > best.score) {
      best = result;
    }
  }

  return best!;
}

function combinations<T>(arr: T[], k: number): T[][] {
  if (k === 0) return [[]];
  if (arr.length < k) return [];
  const [first, ...rest] = arr;
  const withFirst = combinations(rest, k - 1).map((c) => [first, ...c]);
  const withoutFirst = combinations(rest, k);
  return [...withFirst, ...withoutFirst];
}

function evaluate5(cards: Card[]): HandResult {
  const sorted = [...cards].sort((a, b) => cardValue(b) - cardValue(a));
  const values = sorted.map(cardValue);
  const suits = sorted.map(cardSuit);

  const isFlush = suits.every((s) => s === suits[0]);
  const isStraight = checkStraight(values);
  const isLowStraight = checkLowStraight(values);

  // Count ranks
  const counts: Record<number, number> = {};
  for (const v of values) counts[v] = (counts[v] || 0) + 1;
  const groups = Object.entries(counts)
    .map(([v, c]) => ({ value: Number(v), count: c }))
    .sort((a, b) => b.count - a.count || b.value - a.value);

  if (isFlush && isStraight) {
    if (values[0] === 14) return { rank: 9, name: "Royal Flush", score: 9e10, bestCards: sorted };
    return { rank: 8, name: "Straight Flush", score: 8e10 + values[0], bestCards: sorted };
  }
  if (isFlush && isLowStraight) {
    return { rank: 8, name: "Straight Flush", score: 8e10 + 5, bestCards: sorted };
  }

  if (groups[0].count === 4) {
    return { rank: 7, name: "Four of a Kind", score: 7e10 + groups[0].value * 100 + groups[1].value, bestCards: sorted };
  }

  if (groups[0].count === 3 && groups[1].count === 2) {
    return { rank: 6, name: "Full House", score: 6e10 + groups[0].value * 100 + groups[1].value, bestCards: sorted };
  }

  if (isFlush) {
    return { rank: 5, name: "Flush", score: 5e10 + scoreKickers(values), bestCards: sorted };
  }

  if (isStraight) {
    return { rank: 4, name: "Straight", score: 4e10 + values[0], bestCards: sorted };
  }
  if (isLowStraight) {
    return { rank: 4, name: "Straight", score: 4e10 + 5, bestCards: sorted };
  }

  if (groups[0].count === 3) {
    return { rank: 3, name: "Three of a Kind", score: 3e10 + groups[0].value * 10000 + scoreKickers(values.filter(v => v !== groups[0].value)), bestCards: sorted };
  }

  if (groups[0].count === 2 && groups[1].count === 2) {
    const high = Math.max(groups[0].value, groups[1].value);
    const low = Math.min(groups[0].value, groups[1].value);
    const kicker = groups[2].value;
    return { rank: 2, name: "Two Pair", score: 2e10 + high * 10000 + low * 100 + kicker, bestCards: sorted };
  }

  if (groups[0].count === 2) {
    return { rank: 1, name: "One Pair", score: 1e10 + groups[0].value * 1000000 + scoreKickers(values.filter(v => v !== groups[0].value)), bestCards: sorted };
  }

  return { rank: 0, name: "High Card", score: scoreKickers(values), bestCards: sorted };
}

function checkStraight(values: number[]): boolean {
  for (let i = 0; i < values.length - 1; i++) {
    if (values[i] - values[i + 1] !== 1) return false;
  }
  return true;
}

/** Check for A-2-3-4-5 straight (wheel) */
function checkLowStraight(values: number[]): boolean {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[0] === 2 && sorted[1] === 3 && sorted[2] === 4 && sorted[3] === 5 && sorted[4] === 14;
}

function scoreKickers(values: number[]): number {
  let score = 0;
  for (let i = 0; i < values.length && i < 5; i++) {
    score += values[i] * Math.pow(15, 4 - i);
  }
  return score;
}

/** Compare two hands. Returns positive if hand1 wins, negative if hand2 wins, 0 if tie */
export function compareHands(cards1: Card[], cards2: Card[], community: Card[]): number {
  const result1 = evaluateHand([...cards1, ...community]);
  const result2 = evaluateHand([...cards2, ...community]);
  return result1.score - result2.score;
}
