import type {
  RawOrder,
  AppliedOrder,
  RejectedOrder,
  Portfolio,
  GameState,
} from "@weekly-benchmark/shared";
import { TICKER_SET } from "./stocks.js";

const TRANSACTION_COST_RATE = 0; // no transaction costs
const MAX_POSITION_PCT = 0.5; // 50% of portfolio value

/**
 * Validate and apply a list of orders against a portfolio.
 * Valid orders are applied in sequence; invalid orders are rejected with a reason.
 * Returns the applied and rejected orders (does NOT mutate the input portfolio).
 */
export function validateAction(
  orders: RawOrder[],
  portfolio: Portfolio,
  gameState: GameState
): { applied: AppliedOrder[]; rejected: RejectedOrder[] } {
  const applied: AppliedOrder[] = [];
  const rejected: RejectedOrder[] = [];

  // Work on a mutable copy of the portfolio
  let cash = portfolio.cash;
  const holdings: Record<string, number> = { ...portfolio.holdings };

  for (const order of orders) {
    // Validate ticker exists
    if (!TICKER_SET.has(order.ticker)) {
      rejected.push({ order, reason: "unknown_ticker" });
      continue;
    }

    // Validate quantity
    if (!Number.isInteger(order.quantity) || order.quantity <= 0) {
      rejected.push({ order, reason: "invalid_quantity" });
      continue;
    }

    const priceInfo = gameState.market[order.ticker];
    if (!priceInfo) {
      rejected.push({ order, reason: "unknown_ticker" });
      continue;
    }

    const price = priceInfo.price;

    if (order.action === "buy") {
      const totalCost = price * order.quantity;
      const txCost = totalCost * TRANSACTION_COST_RATE;
      const totalWithFees = totalCost + txCost;

      // Check sufficient cash
      if (totalWithFees > cash) {
        rejected.push({ order, reason: "insufficient_cash" });
        continue;
      }

      // Check position limit: would this put more than 50% of portfolio in one stock?
      const currentHolding = holdings[order.ticker] || 0;
      const newHoldingValue = (currentHolding + order.quantity) * price;
      // Estimate total portfolio value after this trade
      const portfolioValueAfter = estimatePortfolioValue(
        cash - totalWithFees,
        { ...holdings, [order.ticker]: currentHolding + order.quantity },
        gameState
      );

      if (newHoldingValue / portfolioValueAfter > MAX_POSITION_PCT) {
        rejected.push({ order, reason: "position_limit_exceeded" });
        continue;
      }

      // Apply the buy
      cash -= totalWithFees;
      holdings[order.ticker] = currentHolding + order.quantity;
      applied.push({
        ...order,
        price,
        transactionCost: Math.round(txCost * 100) / 100,
      });
    } else if (order.action === "sell") {
      const currentHolding = holdings[order.ticker] || 0;

      // Check sufficient holdings
      if (order.quantity > currentHolding) {
        rejected.push({ order, reason: "insufficient_holdings" });
        continue;
      }

      const totalRevenue = price * order.quantity;
      const txCost = totalRevenue * TRANSACTION_COST_RATE;

      // Apply the sell
      cash += totalRevenue - txCost;
      holdings[order.ticker] = currentHolding - order.quantity;
      if (holdings[order.ticker] === 0) {
        delete holdings[order.ticker];
      }
      applied.push({
        ...order,
        price,
        transactionCost: Math.round(txCost * 100) / 100,
      });
    } else {
      rejected.push({ order, reason: "invalid_action" });
    }
  }

  return { applied, rejected };
}

function estimatePortfolioValue(
  cash: number,
  holdings: Record<string, number>,
  gameState: GameState
): number {
  let total = cash;
  for (const [ticker, quantity] of Object.entries(holdings)) {
    const priceInfo = gameState.market[ticker];
    if (priceInfo) {
      total += priceInfo.price * quantity;
    }
  }
  return total;
}

export { TRANSACTION_COST_RATE, MAX_POSITION_PCT };
