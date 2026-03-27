import { describe, it, expect } from "vitest";
import { score } from "../src/scoring.js";
import type { Portfolio, GameState } from "@weekly-benchmark/shared";

const mockGameState: GameState = {
  round: 1,
  market: {
    AAPL: { price: 200, change_pct: 1.0 },
    NVDA: { price: 100, change_pct: -0.5 },
    MSFT: { price: 400, change_pct: 0.2 },
  },
};

describe("scoring", () => {
  it("scores cash-only portfolio", () => {
    const portfolio: Portfolio = { cash: 100000, holdings: {} };
    expect(score(portfolio, mockGameState)).toBe(100000);
  });

  it("scores portfolio with holdings", () => {
    const portfolio: Portfolio = {
      cash: 50000,
      holdings: { AAPL: 100, NVDA: 50 },
    };
    // 50000 + (100 × 200) + (50 × 100) = 50000 + 20000 + 5000 = 75000
    expect(score(portfolio, mockGameState)).toBe(75000);
  });

  it("scores portfolio with zero cash", () => {
    const portfolio: Portfolio = {
      cash: 0,
      holdings: { AAPL: 50 },
    };
    // 0 + (50 × 200) = 10000
    expect(score(portfolio, mockGameState)).toBe(10000);
  });

  it("scores empty portfolio (no cash, no holdings)", () => {
    const portfolio: Portfolio = { cash: 0, holdings: {} };
    expect(score(portfolio, mockGameState)).toBe(0);
  });

  it("rounds to 2 decimal places", () => {
    const gameState: GameState = {
      round: 1,
      market: {
        AAPL: { price: 133.33, change_pct: 0 },
      },
    };
    const portfolio: Portfolio = { cash: 0.01, holdings: { AAPL: 3 } };
    // 0.01 + (3 × 133.33) = 0.01 + 399.99 = 400.00
    expect(score(portfolio, gameState)).toBe(400);
  });

  it("ignores holdings for unknown tickers", () => {
    const portfolio: Portfolio = {
      cash: 1000,
      holdings: { FAKE: 100 },
    };
    // FAKE not in market state, so only cash counts
    expect(score(portfolio, mockGameState)).toBe(1000);
  });
});
