import type {
  AgentRequest,
  RawOrder,
  RejectedOrder,
  Portfolio,
  GameState,
} from "@weekly-benchmark/shared";

/**
 * Build the JSON request payload to send to an agent.
 */
export function buildAgentRequest(
  round: number,
  portfolio: Portfolio,
  gameState: GameState,
  previousErrors: RejectedOrder[]
): AgentRequest {
  return {
    round,
    timestamp: new Date().toISOString(),
    portfolio: {
      cash: Math.round(portfolio.cash * 100) / 100,
      holdings: { ...portfolio.holdings },
    },
    market: gameState.market,
    errors: previousErrors,
  };
}

/**
 * Parse an agent's raw JSON response into typed orders.
 * Returns an empty array for invalid/malformed responses.
 */
export function parseAgentResponse(json: unknown): RawOrder[] {
  if (json === null || json === undefined || typeof json !== "object") {
    return [];
  }

  const obj = json as Record<string, unknown>;

  if (!Array.isArray(obj.orders)) {
    return [];
  }

  const orders: RawOrder[] = [];

  for (const item of obj.orders) {
    if (item === null || typeof item !== "object") {
      continue;
    }

    const order = item as Record<string, unknown>;

    if (
      typeof order.action !== "string" ||
      (order.action !== "buy" && order.action !== "sell")
    ) {
      continue;
    }

    if (typeof order.ticker !== "string" || order.ticker.length === 0) {
      continue;
    }

    if (typeof order.quantity !== "number" || !Number.isFinite(order.quantity)) {
      continue;
    }

    orders.push({
      action: order.action as "buy" | "sell",
      ticker: order.ticker,
      quantity: Math.floor(order.quantity), // truncate to integer
    });
  }

  return orders;
}
