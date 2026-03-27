import { describe, it, expect } from "vitest";
import { validateAction } from "../src/action-validator.js";
import type { Portfolio, GameState, RawOrder } from "@weekly-benchmark/shared";

const mockGameState: GameState = {
  round: 1,
  market: {
    AAPL: { price: 200, change_pct: 1.0 },
    NVDA: { price: 100, change_pct: -0.5 },
    MSFT: { price: 400, change_pct: 0.2 },
  },
};

const defaultPortfolio: Portfolio = {
  cash: 100000,
  holdings: {},
};

describe("action-validator", () => {
  describe("buy orders", () => {
    it("applies a valid buy order", () => {
      const orders: RawOrder[] = [{ action: "buy", ticker: "AAPL", quantity: 10 }];
      const result = validateAction(orders, defaultPortfolio, mockGameState);

      expect(result.applied).toHaveLength(1);
      expect(result.rejected).toHaveLength(0);
      expect(result.applied[0].ticker).toBe("AAPL");
      expect(result.applied[0].price).toBe(200);
      expect(result.applied[0].transactionCost).toBe(0);
    });

    it("rejects buy with insufficient cash", () => {
      const portfolio: Portfolio = { cash: 100, holdings: {} };
      const orders: RawOrder[] = [{ action: "buy", ticker: "AAPL", quantity: 10 }];
      const result = validateAction(orders, portfolio, mockGameState);

      expect(result.applied).toHaveLength(0);
      expect(result.rejected).toHaveLength(1);
      expect(result.rejected[0].reason).toBe("insufficient_cash");
    });

    it("rejects buy exceeding 50% position limit", () => {
      // Portfolio worth ~100k. Buying $60k of AAPL exceeds 50%
      const orders: RawOrder[] = [{ action: "buy", ticker: "AAPL", quantity: 300 }];
      const result = validateAction(orders, defaultPortfolio, mockGameState);

      // 300 × $200 = $60,000 which is > 50% of ~$100k portfolio
      expect(result.rejected).toHaveLength(1);
      expect(result.rejected[0].reason).toBe("position_limit_exceeded");
    });
  });

  describe("sell orders", () => {
    it("applies a valid sell order", () => {
      const portfolio: Portfolio = { cash: 50000, holdings: { AAPL: 100 } };
      const orders: RawOrder[] = [{ action: "sell", ticker: "AAPL", quantity: 50 }];
      const result = validateAction(orders, portfolio, mockGameState);

      expect(result.applied).toHaveLength(1);
      expect(result.rejected).toHaveLength(0);
      expect(result.applied[0].ticker).toBe("AAPL");
      expect(result.applied[0].price).toBe(200);
    });

    it("has zero transaction cost", () => {
      const portfolio: Portfolio = { cash: 50000, holdings: { AAPL: 100 } };
      const orders: RawOrder[] = [{ action: "sell", ticker: "AAPL", quantity: 10 }];
      const result = validateAction(orders, portfolio, mockGameState);

      expect(result.applied[0].transactionCost).toBe(0);
    });

    it("rejects sell with insufficient holdings", () => {
      const portfolio: Portfolio = { cash: 50000, holdings: { AAPL: 5 } };
      const orders: RawOrder[] = [{ action: "sell", ticker: "AAPL", quantity: 10 }];
      const result = validateAction(orders, portfolio, mockGameState);

      expect(result.rejected).toHaveLength(1);
      expect(result.rejected[0].reason).toBe("insufficient_holdings");
    });

    it("rejects sell of stock not held", () => {
      const orders: RawOrder[] = [{ action: "sell", ticker: "AAPL", quantity: 10 }];
      const result = validateAction(orders, defaultPortfolio, mockGameState);

      expect(result.rejected).toHaveLength(1);
      expect(result.rejected[0].reason).toBe("insufficient_holdings");
    });
  });

  describe("validation edge cases", () => {
    it("rejects unknown ticker", () => {
      const orders: RawOrder[] = [{ action: "buy", ticker: "FAKE", quantity: 10 }];
      const result = validateAction(orders, defaultPortfolio, mockGameState);

      expect(result.rejected).toHaveLength(1);
      expect(result.rejected[0].reason).toBe("unknown_ticker");
    });

    it("rejects zero quantity", () => {
      const orders: RawOrder[] = [{ action: "buy", ticker: "AAPL", quantity: 0 }];
      const result = validateAction(orders, defaultPortfolio, mockGameState);

      expect(result.rejected).toHaveLength(1);
      expect(result.rejected[0].reason).toBe("invalid_quantity");
    });

    it("rejects negative quantity", () => {
      const orders: RawOrder[] = [{ action: "buy", ticker: "AAPL", quantity: -5 }];
      const result = validateAction(orders, defaultPortfolio, mockGameState);

      expect(result.rejected).toHaveLength(1);
      expect(result.rejected[0].reason).toBe("invalid_quantity");
    });

    it("rejects non-integer quantity", () => {
      const orders: RawOrder[] = [{ action: "buy", ticker: "AAPL", quantity: 5.5 }];
      const result = validateAction(orders, defaultPortfolio, mockGameState);

      expect(result.rejected).toHaveLength(1);
      expect(result.rejected[0].reason).toBe("invalid_quantity");
    });

    it("returns empty results for empty orders array", () => {
      const result = validateAction([], defaultPortfolio, mockGameState);
      expect(result.applied).toHaveLength(0);
      expect(result.rejected).toHaveLength(0);
    });
  });

  describe("multiple orders", () => {
    it("processes multiple valid orders in sequence", () => {
      const orders: RawOrder[] = [
        { action: "buy", ticker: "AAPL", quantity: 10 },
        { action: "buy", ticker: "NVDA", quantity: 20 },
      ];
      const result = validateAction(orders, defaultPortfolio, mockGameState);

      expect(result.applied).toHaveLength(2);
      expect(result.rejected).toHaveLength(0);
    });

    it("processes mix of valid and invalid orders", () => {
      const orders: RawOrder[] = [
        { action: "buy", ticker: "AAPL", quantity: 10 },
        { action: "buy", ticker: "FAKE", quantity: 5 },
        { action: "buy", ticker: "NVDA", quantity: 20 },
      ];
      const result = validateAction(orders, defaultPortfolio, mockGameState);

      expect(result.applied).toHaveLength(2);
      expect(result.rejected).toHaveLength(1);
      expect(result.rejected[0].order.ticker).toBe("FAKE");
    });

    it("respects cash depletion across sequential buys", () => {
      const portfolio: Portfolio = { cash: 10000, holdings: {} };
      const orders: RawOrder[] = [
        { action: "buy", ticker: "AAPL", quantity: 10 }, // $2000
        { action: "buy", ticker: "NVDA", quantity: 30 }, // $3000
        { action: "buy", ticker: "MSFT", quantity: 20 }, // $8000 — insufficient cash ($5000 left)
      ];
      const result = validateAction(orders, portfolio, mockGameState);

      expect(result.applied).toHaveLength(2);
      expect(result.rejected).toHaveLength(1);
      expect(result.rejected[0].reason).toBe("insufficient_cash");
    });

    it("does not mutate the input portfolio", () => {
      const portfolio: Portfolio = { cash: 100000, holdings: { AAPL: 50 } };
      const originalCash = portfolio.cash;
      const originalHoldings = { ...portfolio.holdings };

      validateAction(
        [{ action: "buy", ticker: "NVDA", quantity: 10 }],
        portfolio,
        mockGameState
      );

      expect(portfolio.cash).toBe(originalCash);
      expect(portfolio.holdings).toEqual(originalHoldings);
    });
  });
});
