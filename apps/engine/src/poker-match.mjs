import { createSession } from "./model-runner.mjs";
import {
  createGame,
  applyAction,
  getPlayerView,
  getActivePlayerIndex,
  pokerArena,
} from "@weekly-benchmark/arena-poker";

/**
 * Simple seeded PRNG for card shuffling
 */
function createRng(seed) {
  let state = seed | 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (Math.imul(31, hash) + str.charCodeAt(i)) | 0;
  }
  return hash;
}

/**
 * Extract JSON from model response
 */
function extractJson(text) {
  let depth = 0;
  let start = -1;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "{") { if (depth === 0) start = i; depth++; }
    else if (text[i] === "}") {
      depth--;
      if (depth === 0 && start >= 0) {
        try { return JSON.parse(text.substring(start, i + 1)); } catch {}
        start = -1;
      }
    }
  }
  return null;
}

const ALLOWED_ACTIONS = new Set(["fold", "call", "raise", "check"]);

/**
 * Run a single hand of heads-up poker between two agents.
 * Returns the result: { winner, winAmount, actions, bankrolls }
 */
export async function playHand(config) {
  const { agent1, agent2, handNumber, seed, onAction } = config;

  const rng = createRng(hashString(seed) + handNumber * 7919);

  const game = createGame(
    agent1.id, agent1.bankroll,
    agent2.id, agent2.bankroll,
    rng
  );

  const agents = { [agent1.id]: agent1, [agent2.id]: agent2 };
  const sessions = {};

  // Create sessions for both players
  for (const agent of [agent1, agent2]) {
    const systemPrompt = [
      agent.config.systemPrompt,
      agent.config.examplesText ? "\n\nEXAMPLES:\n" + agent.config.examplesText.slice(0, 3000) : "",
      "---",
      pokerArena.getRules(),
      "---",
      pokerArena.getToolDefinitions(),
    ].join("\n\n");

    sessions[agent.id] = await createSession(systemPrompt, agent.config);
  }

  let maxTurns = 20; // safety limit per hand

  try {
    while (game.phase !== "done" && game.phase !== "showdown" && maxTurns > 0) {
      const activeIdx = getActivePlayerIndex(game);
      if (activeIdx === -1) {
        // Phase should advance — force it by dealing
        break;
      }

      const activePlayer = game.players[activeIdx];
      const session = sessions[activePlayer.id];
      const view = getPlayerView(game, activePlayer.id);

      const prompt = `Hand #${handNumber}\n\n${view}\n\nWhat do you want to do? Respond with ONE JSON: {"tool": "play_action", "args": {"action": "call"}}`;

      const response = await session.prompt(prompt);
      console.log(`[poker:${activePlayer.id.slice(0, 8)}] ${response.substring(0, 150)}`);

      const toolCall = extractJson(response);

      if (!toolCall || toolCall.tool !== "play_action" || !toolCall.args) {
        // Default to call if model doesn't respond properly
        const result = applyAction(game, activeIdx, "call");
        console.log(`[poker] ${activePlayer.id.slice(0, 8)} auto-calls (invalid response)`);
        if (onAction) onAction({ agentId: activePlayer.id, tool: "play_action", args: { action: "call" }, result, timestamp: new Date().toISOString() });
        maxTurns--;
        continue;
      }

      const action = toolCall.args.action;
      if (!ALLOWED_ACTIONS.has(action)) {
        const result = applyAction(game, activeIdx, "call");
        if (onAction) onAction({ agentId: activePlayer.id, tool: "play_action", args: { action: "call" }, result, timestamp: new Date().toISOString() });
        maxTurns--;
        continue;
      }

      const raiseAmount = action === "raise" ? Math.max(1000, Math.min(100000, Number(toolCall.args.amount) || 1000)) : 0;
      const result = applyAction(game, activeIdx, action, raiseAmount);
      console.log(`[poker] ${result}`);

      if (onAction) {
        onAction({
          agentId: activePlayer.id,
          tool: "play_action",
          args: { action, amount: raiseAmount },
          result,
          sideEffects: game.phase === "done" ? { type: "hand_complete", winner: game.winner, winAmount: game.winAmount } : undefined,
          timestamp: new Date().toISOString(),
        });
      }

      maxTurns--;
    }

    // If we ran out of turns without resolution, auto-resolve
    if (game.phase !== "done") {
      // Force call remaining bets and go to showdown
      while (game.phase !== "done" && game.phase !== "showdown") {
        const idx = getActivePlayerIndex(game);
        if (idx === -1) break;
        applyAction(game, idx, "call");
      }
    }

    return {
      winner: game.winner,
      winAmount: game.winAmount,
      winReason: game.winReason,
      player1Bankroll: game.players[0].bankroll,
      player2Bankroll: game.players[1].bankroll,
    };
  } finally {
    // Dispose sessions
    for (const session of Object.values(sessions)) {
      await session.dispose().catch(() => {});
    }
  }
}

/**
 * Run a match: multiple hands between two agents.
 */
export async function playMatch(config) {
  const { agent1, agent2, numHands = 5, seed, onAction, onHandResult } = config;

  let bankroll1 = agent1.bankroll;
  let bankroll2 = agent2.bankroll;

  for (let i = 0; i < numHands; i++) {
    console.log(`\n--- Hand ${i + 1}/${numHands}: ${agent1.name} vs ${agent2.name} ---`);

    // Alternate dealer each hand
    const isAgent1Dealer = i % 2 === 0;
    const dealer = isAgent1Dealer ? agent1 : agent2;
    const nonDealer = isAgent1Dealer ? agent2 : agent1;

    const result = await playHand({
      agent1: { ...dealer, bankroll: isAgent1Dealer ? bankroll1 : bankroll2 },
      agent2: { ...nonDealer, bankroll: isAgent1Dealer ? bankroll2 : bankroll1 },
      handNumber: i + 1,
      seed: seed + `-hand-${i}`,
      onAction,
    });

    // Update bankrolls
    if (isAgent1Dealer) {
      bankroll1 = result.player1Bankroll;
      bankroll2 = result.player2Bankroll;
    } else {
      bankroll2 = result.player1Bankroll;
      bankroll1 = result.player2Bankroll;
    }

    const winnerName = result.winner === agent1.id ? agent1.name :
                       result.winner === agent2.id ? agent2.name : "Split";

    console.log(`[poker] Hand ${i + 1} result: ${winnerName} wins $${result.winAmount} (${result.winReason})`);
    console.log(`[poker] ${agent1.name}: $${bankroll1} | ${agent2.name}: $${bankroll2}`);

    if (onHandResult) {
      onHandResult({
        hand: i + 1,
        winner: result.winner,
        winAmount: result.winAmount,
        winReason: result.winReason,
        bankrolls: { [agent1.id]: bankroll1, [agent2.id]: bankroll2 },
      });
    }
  }

  return {
    bankrolls: { [agent1.id]: bankroll1, [agent2.id]: bankroll2 },
  };
}
