import { describe, it, expect } from "vitest";
import { generatePrices, createRng, hashSeed } from "../src/price-simulator.js";
import { STOCKS } from "../src/stocks.js";

describe("price-simulator", () => {
  const TEST_SEED = "test-competition-2026";

  describe("createRng", () => {
    it("produces values in [0, 1)", () => {
      const rng = createRng(42);
      for (let i = 0; i < 1000; i++) {
        const val = rng();
        expect(val).toBeGreaterThanOrEqual(0);
        expect(val).toBeLessThan(1);
      }
    });

    it("is deterministic", () => {
      const rng1 = createRng(42);
      const rng2 = createRng(42);
      for (let i = 0; i < 100; i++) {
        expect(rng1()).toBe(rng2());
      }
    });

    it("different seeds produce different sequences", () => {
      const rng1 = createRng(42);
      const rng2 = createRng(43);
      let allSame = true;
      for (let i = 0; i < 10; i++) {
        if (rng1() !== rng2()) allSame = false;
      }
      expect(allSame).toBe(false);
    });
  });

  describe("hashSeed", () => {
    it("produces consistent hashes", () => {
      expect(hashSeed("test")).toBe(hashSeed("test"));
    });

    it("different strings produce different hashes", () => {
      expect(hashSeed("test1")).not.toBe(hashSeed("test2"));
    });
  });

  describe("generatePrices", () => {
    it("returns starting prices for round 0", () => {
      const market = generatePrices(TEST_SEED, 0);

      for (const stock of STOCKS) {
        expect(market[stock.ticker]).toBeDefined();
        expect(market[stock.ticker].price).toBe(stock.startPrice);
        expect(market[stock.ticker].change_pct).toBe(0);
      }
    });

    it("returns all 20 stocks", () => {
      const market = generatePrices(TEST_SEED, 1);
      expect(Object.keys(market)).toHaveLength(20);
    });

    it("is deterministic — same seed + round = same prices", () => {
      const market1 = generatePrices(TEST_SEED, 10);
      const market2 = generatePrices(TEST_SEED, 10);

      for (const ticker of Object.keys(market1)) {
        expect(market1[ticker].price).toBe(market2[ticker].price);
        expect(market1[ticker].change_pct).toBe(market2[ticker].change_pct);
      }
    });

    it("different seeds produce different prices", () => {
      const market1 = generatePrices("seed-a", 10);
      const market2 = generatePrices("seed-b", 10);

      let allSame = true;
      for (const ticker of Object.keys(market1)) {
        if (market1[ticker].price !== market2[ticker].price) allSame = false;
      }
      expect(allSame).toBe(false);
    });

    it("prices stay positive", () => {
      // Run for many rounds to stress-test
      const market = generatePrices(TEST_SEED, 500);
      for (const ticker of Object.keys(market)) {
        expect(market[ticker].price).toBeGreaterThan(0);
      }
    });

    it("prices change between rounds", () => {
      const market1 = generatePrices(TEST_SEED, 1);
      const market2 = generatePrices(TEST_SEED, 2);

      let anyDifferent = false;
      for (const ticker of Object.keys(market1)) {
        if (market1[ticker].price !== market2[ticker].price) anyDifferent = true;
      }
      expect(anyDifferent).toBe(true);
    });

    it("change_pct reflects the actual change from previous round", () => {
      const round9 = generatePrices(TEST_SEED, 9);
      const round10 = generatePrices(TEST_SEED, 10);

      for (const ticker of Object.keys(round10)) {
        const prev = round9[ticker].price;
        const curr = round10[ticker].price;
        const expectedPct = Math.round(((curr - prev) / prev) * 10000) / 100;
        // Allow small floating point differences
        expect(Math.abs(round10[ticker].change_pct - expectedPct)).toBeLessThan(0.5);
      }
    });

    it("volatility keeps prices within reasonable range over 100 rounds", () => {
      const market = generatePrices(TEST_SEED, 100);
      for (const stock of STOCKS) {
        const price = market[stock.ticker].price;
        // Prices shouldn't deviate more than 10x from start in 100 rounds
        expect(price).toBeLessThan(stock.startPrice * 10);
        expect(price).toBeGreaterThan(stock.startPrice / 10);
      }
    });
  });
});
