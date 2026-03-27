import type { MarketState } from "@weekly-benchmark/shared";
import { STOCKS } from "./stocks.js";

/**
 * Simple seeded PRNG (mulberry32).
 * Produces deterministic floats in [0, 1) from a 32-bit seed.
 */
function createRng(seed: number): () => number {
  let state = seed | 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Convert a string seed to a numeric seed via simple hash */
function hashSeed(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (Math.imul(31, hash) + seed.charCodeAt(i)) | 0;
  }
  return hash;
}

/** Box-Muller transform: convert uniform random to normal distribution */
function normalRandom(rng: () => number): number {
  const u1 = rng();
  const u2 = rng();
  return Math.sqrt(-2 * Math.log(Math.max(u1, 1e-10))) * Math.cos(2 * Math.PI * u2);
}

// Constants
const MOMENTUM_FACTOR = 0.3;
const NEWS_PROBABILITY = 0.02;
const NEWS_MIN_MAGNITUDE = 0.03;
const NEWS_MAX_MAGNITUDE = 0.08;

/** Simulate one round of price changes for all stocks (mutates prices array) */
function simulateRound(
  rng: () => number,
  prices: number[]
): void {
  for (let i = 0; i < STOCKS.length; i++) {
    const stock = STOCKS[i];
    const price = prices[i];

    // 1. GBM random component
    const randomReturn = normalRandom(rng) * stock.volatility;

    // 2. Momentum: mean-reversion toward starting price
    const priceRatio = price / stock.startPrice;
    const momentumReturn =
      -MOMENTUM_FACTOR * Math.log(priceRatio) * stock.volatility;

    // 3. News event check
    let newsReturn = 0;
    if (rng() < NEWS_PROBABILITY) {
      const magnitude =
        NEWS_MIN_MAGNITUDE + rng() * (NEWS_MAX_MAGNITUDE - NEWS_MIN_MAGNITUDE);
      newsReturn = rng() < 0.5 ? -magnitude : magnitude;
    }

    // Apply returns multiplicatively (floor at $0.01)
    const totalReturn = randomReturn + momentumReturn + newsReturn;
    prices[i] = Math.max(0.01, price * (1 + totalReturn));
  }
}

/**
 * Generate market prices for a specific round using GBM with deterministic seed.
 *
 * Price evolution per stock per round:
 *   1. GBM random component: N(0, volatility)
 *   2. Momentum: 30% mean-reversion toward starting price
 *   3. News events: 2% chance of ±3-8% jump
 *
 * Deterministic: same seed + same round = same prices always.
 */
export function generatePrices(seed: string, round: number): MarketState {
  const market: MarketState = {};
  const baseSeed = hashSeed(seed);

  if (round === 0) {
    for (const stock of STOCKS) {
      market[stock.ticker] = { price: stock.startPrice, change_pct: 0 };
    }
    return market;
  }

  // Simulate all rounds from 1 to N, tracking previous prices for change_pct
  const prices: number[] = STOCKS.map((s) => s.startPrice);
  const prevPrices: number[] = STOCKS.map((s) => s.startPrice);

  for (let r = 1; r <= round; r++) {
    // Save previous prices before mutating
    if (r === round) {
      for (let i = 0; i < prices.length; i++) {
        prevPrices[i] = prices[i];
      }
    }
    const rng = createRng(baseSeed + r * 7919);
    simulateRound(rng, prices);
  }

  // Build market state
  for (let i = 0; i < STOCKS.length; i++) {
    const ticker = STOCKS[i].ticker;
    const currentPrice = Math.round(prices[i] * 100) / 100;
    const prev = prevPrices[i];
    const changePct = Math.round(((prices[i] - prev) / prev) * 10000) / 100;

    market[ticker] = { price: currentPrice, change_pct: changePct };
  }

  return market;
}

// Export internals for testing
export { createRng, hashSeed, normalRandom, simulateRound };
