import type { Portfolio, GameState } from "@weekly-benchmark/shared";

/**
 * Calculate total portfolio value: cash + sum(holdings × current price).
 * Returns value rounded to 2 decimal places.
 */
export function score(portfolio: Portfolio, gameState: GameState): number {
  let total = portfolio.cash;

  for (const [ticker, quantity] of Object.entries(portfolio.holdings)) {
    const priceInfo = gameState.market[ticker];
    if (priceInfo) {
      total += priceInfo.price * quantity;
    }
  }

  return Math.round(total * 100) / 100;
}
