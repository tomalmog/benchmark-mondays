import { createSession } from "./model-runner.mjs";
import {
  pokerArena,
} from "@weekly-benchmark/arena-poker";
import { createDeck, shuffleDeck, formatCards, evaluateHand, compareHands } from "@weekly-benchmark/arena-poker";

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
 * Get a confidence rating (1-10) from the model.
 * Returns a number 1-10. Defaults to 5 if unparseable.
 */
async function getConfidence(session, prompt) {
  const response = await session.prompt(prompt);
  const cleaned = response.trim();
  console.log(`  → rated: ${cleaned.substring(0, 50)}`);

  const match = cleaned.match(/\b(10|[1-9])\b/);
  if (match) return parseInt(match[1]);
  return 5; // default medium confidence
}

/**
 * Convert confidence to a bet multiplier.
 * 1-2: fold (0), 3-4: check/call (1x blind), 5-6: small bet (2x), 7-8: raise (4x), 9-10: big raise (8x)
 */
function confidenceToBet(confidence) {
  // Add some randomness so it's not perfectly deterministic
  const noise = Math.floor(Math.random() * 3) - 1; // -1, 0, or +1
  const adjusted = Math.max(1, Math.min(10, confidence + noise));

  if (adjusted <= 3) return { action: "fold", bet: 0 };
  if (adjusted <= 6) return { action: "call", bet: 10 + Math.floor(Math.random() * 20) };
  if (adjusted <= 8) return { action: "raise", bet: 30 + Math.floor(Math.random() * 50) };
  return { action: "raise", bet: 80 + Math.floor(Math.random() * 120) };
}

const BLIND = 25;

/**
 * Play a single hand. Simple flow:
 * - Deal hole cards, each player rates once → betting
 * - Deal flop, each player rates once → betting
 * - Deal turn, each player rates once → betting
 * - Deal river, each player rates once → betting
 * - Showdown
 *
 * Each "betting round" = both players rate, higher bet wins the round.
 * If someone folds, hand is over.
 */
export async function playHand(config) {
  const { agent1, agent2, handNumber, seed, onAction } = config;

  const rng = createRng(hashString(seed) + handNumber * 7919);
  const deck = shuffleDeck(createDeck(), rng);

  let idx = 0;
  const hole1 = [deck[idx++], deck[idx++]];
  const hole2 = [deck[idx++], deck[idx++]];
  const community = [];

  let bank1 = agent1.bankroll;
  let bank2 = agent2.bankroll;
  let pot = 0;

  // Post blinds
  const sb = BLIND / 2;
  bank1 -= sb;
  bank2 -= BLIND;
  pot = sb + BLIND;

  // Create sessions
  const sessions = {};
  for (const agent of [agent1, agent2]) {
    const systemPrompt = [
      agent.config.systemPrompt,
      agent.config.examplesText ? "\nEXAMPLES:\n" + agent.config.examplesText.slice(0, 2000) : "",
      "---",
      pokerArena.getRules(),
      "---",
      pokerArena.getToolDefinitions(),
    ].join("\n\n");
    sessions[agent.id] = await createSession(systemPrompt, agent.config);
  }

  let winner = null;
  let winReason = "";
  let winAmount = 0;

  const phases = [
    { name: "PREFLOP", deal: 0 },
    { name: "FLOP", deal: 3 },
    { name: "TURN", deal: 1 },
    { name: "RIVER", deal: 1 },
  ];

  try {
    for (const phase of phases) {
      // Deal community cards
      if (phase.deal > 0) {
        idx++; // burn
        for (let i = 0; i < phase.deal; i++) {
          community.push(deck[idx++]);
        }
      }

      const boardStr = community.length > 0 ? `Board: ${formatCards(community)}` : "No community cards yet";

      // Player 1 rates
      const prompt1 = `${phase.name}\nYour cards: ${formatCards(hole1)}\n${boardStr}\nPot: $${pot}\nYour bankroll: $${bank1}\n\nRate your hand 1-10:`;
      console.log(`[hand ${handNumber}] ${phase.name} - ${agent1.name}:`);
      const conf1 = await getConfidence(sessions[agent1.id], prompt1);

      // Player 2 rates
      const prompt2 = `${phase.name}\nYour cards: ${formatCards(hole2)}\n${boardStr}\nPot: $${pot}\nYour bankroll: $${bank2}\n\nRate your hand 1-10:`;
      console.log(`[hand ${handNumber}] ${phase.name} - ${agent2.name}:`);
      const conf2 = await getConfidence(sessions[agent2.id], prompt2);

      const bet1 = confidenceToBet(conf1);
      const bet2 = confidenceToBet(conf2);

      console.log(`[hand ${handNumber}] ${agent1.name}: ${conf1}/10 → ${bet1.action} $${bet1.bet} | ${agent2.name}: ${conf2}/10 → ${bet2.action} $${bet2.bet}`);

      // Log actions
      if (onAction) {
        onAction({ agentId: agent1.id, tool: "play_action", args: { action: bet1.action, amount: bet1.bet }, result: `${conf1}/10`, timestamp: new Date().toISOString() });
        onAction({ agentId: agent2.id, tool: "play_action", args: { action: bet2.action, amount: bet2.bet }, result: `${conf2}/10`, timestamp: new Date().toISOString() });
      }

      // Handle folds
      if (bet1.action === "fold" && bet2.action === "fold") {
        // Both fold — split pot (weird but whatever)
        bank1 += Math.floor(pot / 2);
        bank2 += pot - Math.floor(pot / 2);
        winner = null;
        winReason = "Both folded";
        winAmount = 0;
        pot = 0;
        break;
      }

      if (bet1.action === "fold") {
        bank2 += pot;
        winner = agent2.id;
        winReason = "opponent folded";
        winAmount = pot;
        pot = 0;
        console.log(`[hand ${handNumber}] ${agent1.name} folds → ${agent2.name} wins $${winAmount}`);
        break;
      }

      if (bet2.action === "fold") {
        bank1 += pot;
        winner = agent1.id;
        winReason = "opponent folded";
        winAmount = pot;
        pot = 0;
        console.log(`[hand ${handNumber}] ${agent2.name} folds → ${agent1.name} wins $${winAmount}`);
        break;
      }

      // Both stay in — add bets to pot
      const roundBet = Math.max(bet1.bet, bet2.bet);
      bank1 -= roundBet;
      bank2 -= roundBet;
      pot += roundBet * 2;
    }

    // Showdown if nobody folded
    if (winner === null && pot > 0) {
      const result = compareHands(hole1, hole2, community);
      const hand1 = evaluateHand([...hole1, ...community]);
      const hand2 = evaluateHand([...hole2, ...community]);

      if (result > 0) {
        winner = agent1.id;
        winReason = `${hand1.name} beats ${hand2.name}`;
        winAmount = pot;
        bank1 += pot;
      } else if (result < 0) {
        winner = agent2.id;
        winReason = `${hand2.name} beats ${hand1.name}`;
        winAmount = pot;
        bank2 += pot;
      } else {
        winReason = "Split pot";
        winAmount = 0;
        bank1 += Math.floor(pot / 2);
        bank2 += pot - Math.floor(pot / 2);
      }

      console.log(`[hand ${handNumber}] Showdown: ${agent1.name} ${formatCards(hole1)} (${hand1.name}) vs ${agent2.name} ${formatCards(hole2)} (${hand2.name})`);
      console.log(`[hand ${handNumber}] ${winner ? (winner === agent1.id ? agent1.name : agent2.name) + ' wins' : 'Split'} $${winAmount} (${winReason})`);
    }

    return {
      winner,
      winAmount,
      winReason,
      player1Bankroll: bank1,
      player2Bankroll: bank2,
    };
  } finally {
    for (const session of Object.values(sessions)) {
      await session.dispose().catch(() => {});
    }
  }
}

export async function playMatch(config) {
  const { agent1, agent2, numHands = 5, seed, onAction, onHandResult } = config;

  let bankroll1 = agent1.bankroll;
  let bankroll2 = agent2.bankroll;

  for (let i = 0; i < numHands; i++) {
    console.log(`\n--- Hand ${i + 1}/${numHands}: ${agent1.name} vs ${agent2.name} ---`);

    // Alternate dealer
    const isAgent1Dealer = i % 2 === 0;

    const result = await playHand({
      agent1: isAgent1Dealer ? { ...agent1, bankroll: bankroll1 } : { ...agent2, bankroll: bankroll2 },
      agent2: isAgent1Dealer ? { ...agent2, bankroll: bankroll2 } : { ...agent1, bankroll: bankroll1 },
      handNumber: i + 1,
      seed: seed + `-hand-${i}`,
      onAction,
    });

    if (isAgent1Dealer) {
      bankroll1 = result.player1Bankroll;
      bankroll2 = result.player2Bankroll;
    } else {
      bankroll2 = result.player1Bankroll;
      bankroll1 = result.player2Bankroll;
    }

    const winnerName = result.winner === agent1.id ? agent1.name :
                       result.winner === agent2.id ? agent2.name : "Split";

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

  return { bankrolls: { [agent1.id]: bankroll1, [agent2.id]: bankroll2 } };
}
