import { Card, createDeck, shuffleDeck, formatCards } from "./cards.js";
import { evaluateHand, compareHands } from "./hand-evaluator.js";

export type PokerAction = "fold" | "call" | "raise" | "check";

export interface PlayerState {
  id: string;
  holeCards: Card[];
  bankroll: number;
  currentBet: number;
  folded: boolean;
  isDealer: boolean;
}

export interface GameState {
  players: [PlayerState, PlayerState];
  community: Card[];
  pot: number;
  currentBet: number;
  phase: "preflop" | "flop" | "turn" | "river" | "done";
  deck: Card[];
  deckIndex: number;
  smallBlind: number;
  bigBlind: number;
  actions: Array<{ playerId: string; action: PokerAction; amount: number }>;
  winner: string | null;
  winAmount: number;
  winReason: string;
  // Turn tracking
  actionsThisPhase: number;
  lastToAct: number; // index of last player to act this phase
}

const SMALL_BLIND = 500;
const BIG_BLIND = 1000;

export function createGame(
  player1Id: string, player1Bankroll: number,
  player2Id: string, player2Bankroll: number,
  rng: () => number
): GameState {
  const deck = shuffleDeck(createDeck(), rng);

  const game: GameState = {
    players: [
      { id: player1Id, holeCards: [deck[0], deck[1]], bankroll: player1Bankroll, currentBet: 0, folded: false, isDealer: true },
      { id: player2Id, holeCards: [deck[2], deck[3]], bankroll: player2Bankroll, currentBet: 0, folded: false, isDealer: false },
    ],
    community: [],
    pot: 0,
    currentBet: BIG_BLIND,
    phase: "preflop",
    deck,
    deckIndex: 4,
    smallBlind: SMALL_BLIND,
    bigBlind: BIG_BLIND,
    actions: [],
    winner: null,
    winAmount: 0,
    winReason: "",
    actionsThisPhase: 0,
    lastToAct: -1,
  };

  // Post blinds
  game.players[0].currentBet = SMALL_BLIND;
  game.players[0].bankroll -= SMALL_BLIND;
  game.players[1].currentBet = BIG_BLIND;
  game.players[1].bankroll -= BIG_BLIND;
  game.pot = SMALL_BLIND + BIG_BLIND;

  return game;
}

/**
 * Get whose turn it is. Pre-flop: dealer (0) acts first. Post-flop: non-dealer (1) acts first.
 * Returns -1 if phase is complete.
 */
export function getActivePlayerIndex(game: GameState): number {
  if (game.phase === "done") return -1;

  // Pre-flop: dealer acts first (small blind), then big blind responds
  // Post-flop: non-dealer (1) acts first
  const firstToAct = game.phase === "preflop" ? 0 : 1;

  if (game.actionsThisPhase === 0) return firstToAct;
  if (game.actionsThisPhase === 1) return 1 - firstToAct;

  // After 2+ actions, check if bets are settled
  if (game.players[0].currentBet === game.players[1].currentBet && game.actionsThisPhase >= 2) {
    return -1; // phase complete
  }

  // Someone raised — other player needs to respond
  return 1 - game.lastToAct;
}

export function applyAction(game: GameState, playerIndex: number, action: PokerAction, raiseAmount: number = 0): string {
  const player = game.players[playerIndex];
  const opponent = game.players[1 - playerIndex];

  if (player.folded) return "Already folded";

  switch (action) {
    case "fold": {
      player.folded = true;
      game.winner = opponent.id;
      game.winAmount = game.pot;
      game.winReason = "opponent folded";
      opponent.bankroll += game.pot;
      game.pot = 0;
      game.phase = "done";
      game.actions.push({ playerId: player.id, action: "fold", amount: 0 });
      return `${player.id} folds. ${opponent.id} wins $${game.winAmount}`;
    }

    case "check": {
      if (player.currentBet < game.currentBet) {
        // Can't check, must call — treat as call
        return applyAction(game, playerIndex, "call");
      }
      game.actions.push({ playerId: player.id, action: "check", amount: 0 });
      game.actionsThisPhase++;
      game.lastToAct = playerIndex;
      tryAdvancePhase(game);
      return `${player.id} checks`;
    }

    case "call": {
      const toCall = game.currentBet - player.currentBet;
      if (toCall <= 0) {
        game.actions.push({ playerId: player.id, action: "check", amount: 0 });
        game.actionsThisPhase++;
        game.lastToAct = playerIndex;
        tryAdvancePhase(game);
        return `${player.id} checks`;
      }
      player.bankroll -= toCall;
      player.currentBet = game.currentBet;
      game.pot += toCall;
      game.actions.push({ playerId: player.id, action: "call", amount: toCall });
      game.actionsThisPhase++;
      game.lastToAct = playerIndex;
      tryAdvancePhase(game);
      return `${player.id} calls $${toCall}`;
    }

    case "raise": {
      const minRaise = game.bigBlind;
      const actualRaise = Math.max(minRaise, Math.floor(raiseAmount));
      const toCall = game.currentBet - player.currentBet;
      const totalCost = toCall + actualRaise;
      player.bankroll -= totalCost;
      player.currentBet = game.currentBet + actualRaise;
      game.currentBet = player.currentBet;
      game.pot += totalCost;
      game.actions.push({ playerId: player.id, action: "raise", amount: actualRaise });
      game.actionsThisPhase++;
      game.lastToAct = playerIndex;
      // After a raise, reset action count so opponent must respond
      game.actionsThisPhase = 1;
      return `${player.id} raises $${actualRaise} (total bet: $${game.currentBet})`;
    }

    default:
      return "Unknown action";
  }
}

function tryAdvancePhase(game: GameState): void {
  // Check if both players have acted and bets are equal
  if (game.players[0].currentBet !== game.players[1].currentBet) return;
  if (game.actionsThisPhase < 2) return;

  // Reset for next phase
  game.players[0].currentBet = 0;
  game.players[1].currentBet = 0;
  game.currentBet = 0;
  game.actionsThisPhase = 0;
  game.lastToAct = -1;

  switch (game.phase) {
    case "preflop":
      game.deckIndex++; // burn
      game.community.push(game.deck[game.deckIndex++]);
      game.community.push(game.deck[game.deckIndex++]);
      game.community.push(game.deck[game.deckIndex++]);
      game.phase = "flop";
      break;
    case "flop":
      game.deckIndex++; // burn
      game.community.push(game.deck[game.deckIndex++]);
      game.phase = "turn";
      break;
    case "turn":
      game.deckIndex++; // burn
      game.community.push(game.deck[game.deckIndex++]);
      game.phase = "river";
      break;
    case "river":
      resolveShowdown(game);
      break;
  }
}

function resolveShowdown(game: GameState): void {
  const p0 = game.players[0];
  const p1 = game.players[1];

  const comparison = compareHands(p0.holeCards, p1.holeCards, game.community);
  const hand0 = evaluateHand([...p0.holeCards, ...game.community]);
  const hand1 = evaluateHand([...p1.holeCards, ...game.community]);

  if (comparison > 0) {
    game.winner = p0.id;
    game.winReason = `${hand0.name} beats ${hand1.name}`;
    p0.bankroll += game.pot;
    game.winAmount = game.pot;
  } else if (comparison < 0) {
    game.winner = p1.id;
    game.winReason = `${hand1.name} beats ${hand0.name}`;
    p1.bankroll += game.pot;
    game.winAmount = game.pot;
  } else {
    game.winner = null;
    game.winReason = "Split pot";
    const half = Math.floor(game.pot / 2);
    p0.bankroll += half;
    p1.bankroll += game.pot - half;
    game.winAmount = 0;
  }

  game.pot = 0;
  game.phase = "done";
}

export function getPlayerView(game: GameState, playerId: string): string {
  const playerIdx = game.players.findIndex((p) => p.id === playerId);
  if (playerIdx === -1) return "Not in this game";

  const player = game.players[playerIdx];
  const opponent = game.players[1 - playerIdx];

  let view = `Phase: ${game.phase.toUpperCase()}\n`;
  view += `Your cards: ${formatCards(player.holeCards)}\n`;
  if (game.community.length > 0) view += `Board: ${formatCards(game.community)}\n`;
  view += `Pot: $${game.pot}\n`;
  view += `Your bankroll: $${player.bankroll}\n`;
  view += `Opponent bankroll: $${opponent.bankroll}\n`;
  const toCall = game.currentBet - player.currentBet;
  if (toCall > 0) view += `To call: $${toCall}\n`;

  return view;
}

export { evaluateHand, formatCards };
