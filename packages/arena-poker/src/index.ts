import type { Arena, ActionLogEntry, GameState, Portfolio } from "@weekly-benchmark/shared";

/**
 * Poker Arena
 *
 * Heads-up Texas Hold'em. Agents play round-robin against each other.
 * Scored by total bankroll.
 */
export const pokerArena: Arena = {
  name: "Texas Hold'em Poker",

  // Not used for poker (no market simulation) — returns empty state
  generateState(_seed: string, round: number): GameState {
    return { round, market: {} };
  },

  // Not used for poker — poker has its own action system
  validateAction() {
    return { applied: [], rejected: [] };
  },

  score(portfolio: Portfolio): number {
    return portfolio.cash; // bankroll IS the score
  },

  buildAgentRequest() {
    return { round: 0, timestamp: "", portfolio: { cash: 0, holdings: {} }, market: {}, errors: [] };
  },

  parseAgentResponse(): [] {
    return [];
  },

  getRules(): string {
    return `TEXAS HOLD'EM POKER COMPETITION

RULES:
- Heads-up (1v1) Texas Hold'em
- You play against every other agent in round-robin matches
- Each match consists of multiple hands
- Small blind: $500, Big blind: $1,000
- Starting bankroll: $100,000
- You CAN go into debt — no bust-out
- Ranked by total bankroll at the end of the week

GAME FLOW:
1. You receive two hole cards
2. Pre-flop betting round
3. Three community cards (flop) dealt, betting round
4. Fourth community card (turn) dealt, betting round
5. Fifth community card (river) dealt, final betting round
6. Showdown — best 5-card hand wins the pot

HAND RANKINGS (best to worst):
Royal Flush > Straight Flush > Four of a Kind > Full House > Flush > Straight > Three of a Kind > Two Pair > One Pair > High Card`;
  },

  getToolDefinitions(): string {
    return `AVAILABLE ACTIONS — respond with ONE JSON object:

1. See your hand and the board:
   {"tool": "check_hand", "args": {}}

2. Play an action:
   {"tool": "play_action", "args": {"action": "call"}}
   {"tool": "play_action", "args": {"action": "fold"}}
   {"tool": "play_action", "args": {"action": "raise", "amount": 2000}}
   {"tool": "play_action", "args": {"action": "check"}}

3. Check your bankroll:
   {"tool": "check_bankroll", "args": {}}

4. Check leaderboard:
   {"tool": "check_leaderboard", "args": {}}

RESPOND WITH ONLY ONE JSON OBJECT. NO OTHER TEXT.`;
  },

  summarizeState(portfolio: Portfolio): string {
    return `BANKROLL: $${portfolio.cash.toFixed(0)}`;
  },

  formatHistory(actions: ActionLogEntry[], maxEntries: number = 15): string {
    if (actions.length === 0) return "MATCH HISTORY: No hands played yet.";

    const recent = actions.slice(-maxEntries);
    let history = `RECENT HANDS (last ${recent.length}):\n`;

    for (const action of recent) {
      if (action.tool === "play_action") {
        const args = action.args as { action?: string; amount?: number };
        history += `  ${args.action?.toUpperCase()}${args.amount ? ` $${args.amount}` : ""}\n`;
      } else if (action.tool === "hand_result") {
        history += `  → ${action.result}\n`;
      }
    }

    return history;
  },
};

export { createGame, applyAction, getPlayerView, getActivePlayerIndex } from "./game.js";
export type { GameState as PokerGameState, PokerAction, PlayerState } from "./game.js";
export { evaluateHand, compareHands } from "./hand-evaluator.js";
export { formatCards, formatCard, createDeck, shuffleDeck } from "./cards.js";
export type { Card } from "./cards.js";
