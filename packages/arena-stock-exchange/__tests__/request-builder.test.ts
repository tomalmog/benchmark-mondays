import { describe, it, expect } from "vitest";
import {
  buildAgentRequest,
  parseAgentResponse,
} from "../src/request-builder.js";
import type { Portfolio, GameState, RejectedOrder } from "@weekly-benchmark/shared";

const mockGameState: GameState = {
  round: 42,
  market: {
    AAPL: { price: 200, change_pct: 1.0 },
    NVDA: { price: 100, change_pct: -0.5 },
  },
};

const mockPortfolio: Portfolio = {
  cash: 87420.5,
  holdings: { NVDA: 100, AAPL: 50 },
};

describe("buildAgentRequest", () => {
  it("builds correct JSON shape", () => {
    const request = buildAgentRequest(42, mockPortfolio, mockGameState, []);

    expect(request.round).toBe(42);
    expect(request.timestamp).toBeDefined();
    expect(request.portfolio.cash).toBe(87420.5);
    expect(request.portfolio.holdings).toEqual({ NVDA: 100, AAPL: 50 });
    expect(request.market).toEqual(mockGameState.market);
    expect(request.errors).toEqual([]);
  });

  it("includes previous round rejection errors", () => {
    const errors: RejectedOrder[] = [
      {
        order: { action: "buy", ticker: "MSFT", quantity: 9999 },
        reason: "insufficient_cash",
      },
    ];
    const request = buildAgentRequest(42, mockPortfolio, mockGameState, errors);

    expect(request.errors).toHaveLength(1);
    expect(request.errors[0].reason).toBe("insufficient_cash");
  });

  it("does not mutate the input portfolio", () => {
    const original = { ...mockPortfolio.holdings };
    const request = buildAgentRequest(42, mockPortfolio, mockGameState, []);
    request.portfolio.holdings.NEW = 999;

    expect(mockPortfolio.holdings).toEqual(original);
  });

  it("includes ISO timestamp", () => {
    const request = buildAgentRequest(1, mockPortfolio, mockGameState, []);
    expect(() => new Date(request.timestamp)).not.toThrow();
  });
});

describe("parseAgentResponse", () => {
  it("parses valid response with orders", () => {
    const json = {
      orders: [
        { action: "buy", ticker: "MSFT", quantity: 50 },
        { action: "sell", ticker: "AAPL", quantity: 25 },
      ],
    };
    const orders = parseAgentResponse(json);

    expect(orders).toHaveLength(2);
    expect(orders[0]).toEqual({ action: "buy", ticker: "MSFT", quantity: 50 });
    expect(orders[1]).toEqual({ action: "sell", ticker: "AAPL", quantity: 25 });
  });

  it("returns empty array for null input", () => {
    expect(parseAgentResponse(null)).toEqual([]);
  });

  it("returns empty array for undefined input", () => {
    expect(parseAgentResponse(undefined)).toEqual([]);
  });

  it("returns empty array for non-object input", () => {
    expect(parseAgentResponse("not an object")).toEqual([]);
    expect(parseAgentResponse(42)).toEqual([]);
  });

  it("returns empty array when orders field is missing", () => {
    expect(parseAgentResponse({})).toEqual([]);
  });

  it("returns empty array when orders is not an array", () => {
    expect(parseAgentResponse({ orders: "not array" })).toEqual([]);
  });

  it("returns empty array for empty orders", () => {
    expect(parseAgentResponse({ orders: [] })).toEqual([]);
  });

  it("skips invalid action types", () => {
    const json = {
      orders: [
        { action: "hold", ticker: "AAPL", quantity: 10 },
        { action: "buy", ticker: "AAPL", quantity: 10 },
      ],
    };
    const orders = parseAgentResponse(json);
    expect(orders).toHaveLength(1);
    expect(orders[0].action).toBe("buy");
  });

  it("skips orders with missing ticker", () => {
    const json = {
      orders: [{ action: "buy", quantity: 10 }],
    };
    expect(parseAgentResponse(json)).toEqual([]);
  });

  it("skips orders with empty ticker", () => {
    const json = {
      orders: [{ action: "buy", ticker: "", quantity: 10 }],
    };
    expect(parseAgentResponse(json)).toEqual([]);
  });

  it("skips orders with non-number quantity", () => {
    const json = {
      orders: [{ action: "buy", ticker: "AAPL", quantity: "ten" }],
    };
    expect(parseAgentResponse(json)).toEqual([]);
  });

  it("truncates float quantities to integers", () => {
    const json = {
      orders: [{ action: "buy", ticker: "AAPL", quantity: 10.7 }],
    };
    const orders = parseAgentResponse(json);
    expect(orders[0].quantity).toBe(10);
  });

  it("skips null items in orders array", () => {
    const json = {
      orders: [null, { action: "buy", ticker: "AAPL", quantity: 10 }],
    };
    const orders = parseAgentResponse(json);
    expect(orders).toHaveLength(1);
  });

  it("skips Infinity and NaN quantities", () => {
    const json = {
      orders: [
        { action: "buy", ticker: "AAPL", quantity: Infinity },
        { action: "buy", ticker: "AAPL", quantity: NaN },
      ],
    };
    expect(parseAgentResponse(json)).toEqual([]);
  });
});
