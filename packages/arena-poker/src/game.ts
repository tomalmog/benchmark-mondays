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
  phase: "preflop" | "flop" | "turn" | "river" | "showdown" | "done";
  deck: Card[];
  deckIndex: number;
  smallBlind: number;
  bigBlind: number;
  actions: Array<{ playerId: string; action: PokerAction; amount: number }>;
  winner: string | null;
  winAmount: number;
  winReason: string;
}

const SMALL_BLIND = 500;
const BIG_BLIND = 1000;

/** Create a new heads-up Hold'em hand */
export function createGame(
  player1Id: string,
  player1Bankroll: number,
  player2Id: string,
  player2Bankroll: number,
  rng: () => number
): GameState {
  const deck = shuffleDeck(createDeck(), rng);

  const game: GameState = {
    players: [
      {
        id: player1Id,
        holeCards: [deck[0], deck[1]],
        bankroll: player1Bankroll,
        currentBet: 0,
        folded: false,
        isDealer: true, // player1 is dealer/small blind
      },
      {
        id: player2Id,
        holeCards: [deck[2], deck[3]],
        bankroll: player2Bankroll,
        currentBet: 0,
        folded: false,
        isDealer: false, // player2 is big blind
      },
    ],
    community: [],
    pot: 0,
    currentBet: BIG_BLIND,
    phase: "preflop",
    deck,
    deckIndex: 4, // first 4 cards dealt to players
    smallBlind: SMALL_BLIND,
    bigBlind: BIG_BLIND,
    actions: [],
    winner: null,
    winAmount: 0,
    winReason: "",
  };

  // Post blinds
  game.players[0].currentBet = SMALL_BLIND;
  game.players[0].bankroll -= SMALL_BLIND;
  game.players[1].currentBet = BIG_BLIND;
  game.players[1].bankroll -= BIG_BLIND;
  game.pot = SMALL_BLIND + BIG_BLIND;

  return game;
}

/** Get whose turn it is (index 0 or 1). Returns -1 if no action needed. */
export function getActivePlayerIndex(game: GameState): number {
  if (game.phase === "done" || game.phase === "showdown") return -1;

  const actions = game.actions.filter((a) => a.action !== "fold");
  const phaseActions = getPhaseActions(game);

  // Pre-flop: dealer (small blind) acts first
  // Post-flop: non-dealer acts first
  if (game.phase === "preflop") {
    if (phaseActions.length === 0) return 0; // dealer acts first preflop
    if (phaseActions.length === 1) return 1; // big blind responds

    // Check if betting is settled
    const lastAction = phaseActions[phaseActions.length - 1];
    if (lastAction.action === "call" || lastAction.action === "check") {
      if (phaseActions.length >= 2) return -1; // move to next phase
    }
    // After a raise, other player needs to respond
    return phaseActions.length % 2 === 0 ? 0 : 1;
  } else {
    // Post-flop: non-dealer (index 1) acts first
    if (phaseActions.length === 0) return 1;
    if (phaseActions.length === 1) return 0;

    const lastAction = phaseActions[phaseActions.length - 1];
    if (lastAction.action === "call" || lastAction.action === "check") {
      if (phaseActions.length >= 2) return -1;
    }
    return phaseActions.length % 2 === 0 ? 1 : 0;
  }
}

function getPhaseActions(game: GameState) {
  // Count actions in current phase by tracking phase transitions
  let phaseStart = 0;
  let currentPhase = "preflop";
  const phases = ["preflop", "flop", "turn", "river"];

  for (let i = 0; i < game.actions.length; i++) {
    if (game.actions[i].action === "fold") continue;
    // This is simplified — we track by current game phase
  }

  // Just return actions since the last phase change
  // We track this by the community card count
  const communityAtPhase: Record<string, number> = { preflop: 0, flop: 3, turn: 4, river: 5 };
  const expectedCards = communityAtPhase[game.phase] || 0;

  // Find where current phase started in the action list
  let startIdx = game.actions.length;
  for (let i = game.actions.length - 1; i >= 0; i--) {
    startIdx = i;
    // Simple heuristic: count back from end
  }

  // Actually, let's just track phase actions count on the game state
  return game.actions.filter((_, i) => i >= game.actions.length - countCurrentPhaseActions(game));
}

function countCurrentPhaseActions(game: GameState): number {
  let count = 0;
  for (let i = game.actions.length - 1; i >= 0; i--) {
    // Phase boundary: when community cards changed
    count++;
    if (game.actions[i].action === "call" || game.actions[i].action === "check") {
      // Two consecutive non-raise actions end a phase
      if (count >= 2) break;
    }
  }
  return Math.min(count, game.actions.length);
}

/** Apply a player's action to the game */
export function applyAction(
  game: GameState,
  playerIndex: number,
  action: PokerAction,
  raiseAmount: number = 0
): string {
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
        return "Cannot check — there's a bet to call";
      }
      game.actions.push({ playerId: player.id, action: "check", amount: 0 });
      maybeAdvancePhase(game);
      return `${player.id} checks`;
    }

    case "call": {
      const toCall = game.currentBet - player.currentBet;
      if (toCall <= 0) {
        // Nothing to call — treat as check
        game.actions.push({ playerId: player.id, action: "check", amount: 0 });
        maybeAdvancePhase(game);
        return `${player.id} checks`;
      }
      player.bankroll -= toCall;
      player.currentBet = game.currentBet;
      game.pot += toCall;
      game.actions.push({ playerId: player.id, action: "call", amount: toCall });
      maybeAdvancePhase(game);
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
      return `${player.id} raises $${actualRaise} (total bet: $${game.currentBet})`;
    }

    default:
      return "Unknown action";
  }
}

function maybeAdvancePhase(game: GameState): void {
  // Check if both players have acted and bets are equal
  const p0 = game.players[0];
  const p1 = game.players[1];

  if (p0.currentBet !== p1.currentBet) return;

  // Check recent actions — need at least one action per player in this phase
  const recentActions = game.actions.slice(-2);
  if (recentActions.length < 2) return;

  const lastTwo = recentActions.map((a) => a.action);
  const isSettled = lastTwo.every((a) => a === "call" || a === "check");
  if (!isSettled) return;

  // Advance phase
  // Reset bets for new round
  p0.currentBet = 0;
  p1.currentBet = 0;
  game.currentBet = 0;

  switch (game.phase) {
    case "preflop":
      // Deal flop (3 cards)
      game.community.push(game.deck[game.deckIndex++]); // burn
      game.community.push(game.deck[game.deckIndex++]);
      game.community.push(game.deck[game.deckIndex++]);
      // Wait, we shouldn't push burn card to community
      game.community.pop(); game.community.pop(); game.community.pop();
      game.deckIndex -= 3;
      // Properly: burn 1, deal 3
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
      // Showdown
      resolveShowdown(game);
      break;
  }
}

function resolveShowdown(game: GameState): void {
  game.phase = "showdown";
  const p0 = game.players[0];
  const p1 = game.players[1];

  const comparison = compareHands(p0.holeCards, p1.holeCards, game.community);

  if (comparison > 0) {
    game.winner = p0.id;
    game.winReason = `${evaluateHand([...p0.holeCards, ...game.community]).name} beats ${evaluateHand([...p1.holeCards, ...game.community]).name}`;
    p0.bankroll += game.pot;
    game.winAmount = game.pot;
  } else if (comparison < 0) {
    game.winner = p1.id;
    game.winReason = `${evaluateHand([...p1.holeCards, ...game.community]).name} beats ${evaluateHand([...p0.holeCards, ...game.community]).name}`;
    p1.bankroll += game.pot;
    game.winAmount = game.pot;
  } else {
    // Split pot
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

/** Get a summary of the game state visible to a specific player */
export function getPlayerView(game: GameState, playerId: string): string {
  const playerIdx = game.players.findIndex((p) => p.id === playerId);
  if (playerIdx === -1) return "Not in this game";

  const player = game.players[playerIdx];
  const opponent = game.players[1 - playerIdx];

  let view = `Phase: ${game.phase.toUpperCase()}\n`;
  view += `Your cards: ${formatCards(player.holeCards)}\n`;
  if (game.community.length > 0) {
    view += `Board: ${formatCards(game.community)}\n`;
  }
  view += `Pot: $${game.pot}\n`;
  view += `Your bankroll: $${player.bankroll}\n`;
  view += `Opponent bankroll: $${opponent.bankroll}\n`;

  const toCall = game.currentBet - player.currentBet;
  if (toCall > 0) {
    view += `To call: $${toCall}\n`;
  }

  return view;
}

export { evaluateHand, formatCards };
