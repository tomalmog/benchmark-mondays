import { validateAction } from "@weekly-benchmark/arena-stock-exchange";
import { score } from "@weekly-benchmark/arena-stock-exchange";

const ALLOWED_TOOLS = new Set(["check_prices", "check_portfolio", "place_order", "check_leaderboard", "wait"]);
const MAX_ARG_STRING_LENGTH = 50;
const ALLOWED_ACTIONS = new Set(["buy", "sell"]);

/**
 * Sanitize a tool call from model output.
 * Returns null if the call is invalid/dangerous.
 */
function sanitizeToolCall(tool, args) {
  // Only allow whitelisted tools
  if (typeof tool !== "string" || !ALLOWED_TOOLS.has(tool)) {
    return null;
  }

  // Sanitize args: only allow primitive values (string, number, boolean)
  const sanitized = {};
  if (args && typeof args === "object" && !Array.isArray(args)) {
    for (const [key, value] of Object.entries(args)) {
      // Only allow simple alphanumeric keys
      if (typeof key !== "string" || key.length > 30 || !/^[a-zA-Z_]+$/.test(key)) {
        continue;
      }

      if (typeof value === "number" && Number.isFinite(value)) {
        sanitized[key] = value;
      } else if (typeof value === "string") {
        // Truncate and strip anything that looks like code/injection
        const clean = value.slice(0, MAX_ARG_STRING_LENGTH).replace(/[^a-zA-Z0-9._\-]/g, "");
        sanitized[key] = clean;
      } else if (typeof value === "boolean") {
        sanitized[key] = value;
      }
      // Reject objects, arrays, functions, etc.
    }
  }

  return { tool, args: sanitized };
}

/**
 * Execute a sanitized tool call against the shared competition state.
 * Returns { result, sideEffects? } or null if rejected.
 */
export function executeTool(rawTool, rawArgs, state, agentId) {
  const sanitized = sanitizeToolCall(rawTool, rawArgs);

  if (!sanitized) {
    return {
      result: JSON.stringify({ error: "Invalid or disallowed tool call." }),
    };
  }

  const { tool, args } = sanitized;

  switch (tool) {
    case "check_prices": {
      return {
        result: JSON.stringify(state.market, null, 2),
      };
    }

    case "check_portfolio": {
      const portfolio = state.portfolios[agentId];
      if (!portfolio) {
        return { result: JSON.stringify({ error: "Portfolio not found" }) };
      }
      const totalValue = score(portfolio, { round: state.tick, market: state.market });
      return {
        result: JSON.stringify({
          cash: Math.round(portfolio.cash * 100) / 100,
          holdings: portfolio.holdings,
          totalValue: Math.round(totalValue * 100) / 100,
        }),
      };
    }

    case "place_order": {
      const { action, ticker, quantity } = args;

      // Strict validation
      if (!action || !ALLOWED_ACTIONS.has(action)) {
        return { result: JSON.stringify({ success: false, reason: "action must be 'buy' or 'sell'" }) };
      }
      if (!ticker || typeof ticker !== "string" || ticker.length > 10) {
        return { result: JSON.stringify({ success: false, reason: "invalid ticker" }) };
      }
      if (quantity === undefined || typeof quantity !== "number" || quantity <= 0 || quantity > 10000) {
        return { result: JSON.stringify({ success: false, reason: "quantity must be 1-10000" }) };
      }

      const portfolio = state.portfolios[agentId];
      if (!portfolio) {
        return { result: JSON.stringify({ success: false, reason: "Portfolio not found" }) };
      }

      const gameState = { round: state.tick, market: state.market };
      const orders = [{ action, ticker, quantity: Math.floor(quantity) }];
      const { applied, rejected } = validateAction(orders, portfolio, gameState);

      if (rejected.length > 0) {
        return { result: JSON.stringify({ success: false, reason: rejected[0].reason }) };
      }

      if (applied.length > 0) {
        const order = applied[0];
        if (order.action === "buy") {
          portfolio.cash -= order.price * order.quantity + order.transactionCost;
          portfolio.holdings[order.ticker] = (portfolio.holdings[order.ticker] || 0) + order.quantity;
        } else {
          portfolio.cash += order.price * order.quantity - order.transactionCost;
          portfolio.holdings[order.ticker] = (portfolio.holdings[order.ticker] || 0) - order.quantity;
          if (portfolio.holdings[order.ticker] <= 0) delete portfolio.holdings[order.ticker];
        }

        const newTotal = score(portfolio, gameState);

        return {
          result: JSON.stringify({
            success: true,
            action: order.action,
            ticker: order.ticker,
            quantity: order.quantity,
            price: order.price,
            newCash: Math.round(portfolio.cash * 100) / 100,
            newTotalValue: Math.round(newTotal * 100) / 100,
          }),
          sideEffects: { type: "trade", agentId, order },
        };
      }

      return { result: JSON.stringify({ success: false, reason: "No orders applied" }) };
    }

    case "check_leaderboard": {
      const entries = Object.entries(state.portfolios)
        .map(([id, portfolio]) => {
          const totalValue = score(portfolio, { round: state.tick, market: state.market });
          const agentInfo = state.agents[id];
          return { name: agentInfo?.name || "unknown", totalValue: Math.round(totalValue * 100) / 100 };
        })
        .sort((a, b) => b.totalValue - a.totalValue)
        .map((entry, i) => ({ ...entry, rank: i + 1 }));

      return { result: JSON.stringify(entries, null, 2) };
    }

    case "wait": {
      const seconds = Math.min(60, Math.max(1, Number(args?.seconds) || 10));
      return {
        result: `Waited ${seconds} seconds.`,
        sideEffects: { type: "wait", seconds },
      };
    }

    default:
      return { result: JSON.stringify({ error: "Disallowed tool." }) };
  }
}
