import type { Arena, ActionLogEntry, GameState, Portfolio } from "@weekly-benchmark/shared";
import { generatePrices } from "./price-simulator.js";
import { validateAction } from "./action-validator.js";
import { score } from "./scoring.js";
import { buildAgentRequest, parseAgentResponse } from "./request-builder.js";

export const stockExchangeArena: Arena = {
  name: "Mock Stock Exchange",

  generateState(seed: string, round: number): GameState {
    const market = generatePrices(seed, round);
    return { round, market };
  },

  validateAction,
  score,
  buildAgentRequest,
  parseAgentResponse,

  getRules(): string {
    return `STOCK TRADING COMPETITION

RULES:
- You start with $100,000 in cash
- There are 20 stocks you can trade
- You are ranked by total portfolio value (cash + stock holdings at market price)
- No transaction costs — trade freely
- Max 50% of your portfolio value in any single stock
- The competition runs for 7 days with market prices changing every 30 seconds

GOAL: Maximize your total portfolio value by buying and selling stocks strategically.
You MUST invest your cash to win — holding all cash guarantees you lose to anyone who invests.`;
  },

  getToolDefinitions(): string {
    return `AVAILABLE TOOLS — respond with ONE JSON object per message:

1. check_prices — See current stock prices
   {"tool": "check_prices", "args": {}}

2. place_order — Buy or sell stocks
   {"tool": "place_order", "args": {"action": "buy", "ticker": "AAPL", "quantity": 10}}
   {"tool": "place_order", "args": {"action": "sell", "ticker": "TSLA", "quantity": 5}}

3. check_portfolio — See your cash and holdings
   {"tool": "check_portfolio", "args": {}}

4. check_leaderboard — See current rankings
   {"tool": "check_leaderboard", "args": {}}

5. wait — Wait for market to change (1-60 seconds)
   {"tool": "wait", "args": {"seconds": 15}}

RESPOND WITH ONLY ONE JSON OBJECT. NO OTHER TEXT.`;
  },

  summarizeState(portfolio: Portfolio, gameState: GameState): string {
    const cash = portfolio.cash;
    const holdings = portfolio.holdings;
    const heldTickers = Object.keys(holdings);
    const totalValue = score(portfolio, gameState);

    let summary = `CURRENT STATE:\n`;
    summary += `  Cash: $${cash.toFixed(2)}\n`;
    summary += `  Total Value: $${totalValue.toFixed(2)}\n`;
    summary += `  P&L: ${totalValue >= 100000 ? "+" : ""}$${(totalValue - 100000).toFixed(2)}\n`;

    if (heldTickers.length > 0) {
      summary += `  Holdings:\n`;
      for (const ticker of heldTickers) {
        const qty = holdings[ticker];
        const price = gameState.market[ticker]?.price || 0;
        const value = qty * price;
        summary += `    ${ticker}: ${qty} shares @ $${price.toFixed(2)} = $${value.toFixed(2)}\n`;
      }
    } else {
      summary += `  Holdings: none (all cash)\n`;
    }

    return summary;
  },

  formatHistory(actions: ActionLogEntry[], maxEntries: number = 20): string {
    if (actions.length === 0) {
      return "PAST ACTIONS: none yet — this is your first turn.";
    }

    const recent = actions.slice(-maxEntries);
    let history = `PAST ACTIONS (last ${recent.length}):\n`;

    for (const action of recent) {
      if (action.tool === "place_order") {
        const args = action.args as { action?: string; ticker?: string; quantity?: number };
        const resultStr = action.result.includes('"success":true') ? "SUCCESS" : "FAILED";
        history += `  ${action.timestamp}: ${(args.action || "").toUpperCase()} ${args.quantity} ${args.ticker} — ${resultStr}\n`;
      } else if (action.tool === "wait") {
        // skip wait entries to save prompt space
      } else {
        history += `  ${action.timestamp}: ${action.tool}\n`;
      }
    }

    return history;
  },
};

export { generatePrices } from "./price-simulator.js";
export { validateAction } from "./action-validator.js";
export { score } from "./scoring.js";
export { buildAgentRequest, parseAgentResponse } from "./request-builder.js";
export { STOCKS, TICKER_SET } from "./stocks.js";
