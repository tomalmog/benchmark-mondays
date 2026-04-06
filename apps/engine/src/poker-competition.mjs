import { playMatch } from "./poker-match.mjs";
import {
  createAction,
  getPortfolio,
  incrementInferences,
  upsertPortfolio,
  upsertRound,
} from "./db.mjs";

/**
 * Run a continuous poker competition with random matchups.
 * Randomly pairs two agents, they play a match, repeat.
 * Runs until stopped. Money is conserved — what one agent wins, the other loses.
 */
export async function runPokerCompetition(config) {
  const { competitionId, agents, seed, handsPerMatch = 1, maxMatches = 10000 } = config;

  // Load bankrolls from DB
  const bankrolls = {};
  for (const agent of agents) {
    const portfolio = getPortfolio(agent.id, competitionId);
    bankrolls[agent.id] = portfolio ? Number(portfolio.cash) : 100000;
  }

  const totalMoneyStart = Object.values(bankrolls).reduce((a, b) => a + b, 0);
  console.log(`[poker] ${agents.length} agents, random matchups, ${handsPerMatch} hands per match`);
  console.log(`[poker] Total money in system: $${totalMoneyStart}`);

  let matchNum = 0;

  while (matchNum < maxMatches) {
    matchNum++;

    // Randomly pick 2 different agents
    const idx1 = Math.floor(Math.random() * agents.length);
    let idx2 = Math.floor(Math.random() * (agents.length - 1));
    if (idx2 >= idx1) idx2++;

    const agent1 = agents[idx1];
    const agent2 = agents[idx2];

    console.log(`\n=== MATCH ${matchNum}: ${agent1.name} ($${bankrolls[agent1.id]}) vs ${agent2.name} ($${bankrolls[agent2.id]}) ===`);

    const result = await playMatch({
      agent1: { ...agent1, bankroll: bankrolls[agent1.id] },
      agent2: { ...agent2, bankroll: bankrolls[agent2.id] },
      numHands: handsPerMatch,
      seed: `${seed}-match-${matchNum}`,
      onAction: (action) => {
        try {
          const roundId = getOrCreateRound(competitionId, matchNum);
          createAction({
            agentId: action.agentId,
            roundId,
            competitionId,
            actionType: action.args.action || "play",
            price: action.args.amount ? Number(action.args.amount) : null,
            rejected: false,
            rejectionReason: action.result,
          });
        } catch {}

        try {
          incrementInferences(action.agentId);
        } catch {}
      },
      onHandResult: (handResult) => {
        for (const [id, amount] of Object.entries(handResult.bankrolls)) {
          bankrolls[id] = amount;
        }
      },
    });

    // Update bankrolls from match
    for (const [id, amount] of Object.entries(result.bankrolls)) {
      bankrolls[id] = amount;
    }

    // Verify money conservation
    const totalMoney = Object.values(bankrolls).reduce((a, b) => a + b, 0);
    if (Math.abs(totalMoney - totalMoneyStart) > 1) {
      console.error(`[poker] MONEY LEAK! Expected $${totalMoneyStart}, got $${totalMoney}`);
    }

    // Persist to DB
    for (const agent of agents) {
      try {
        upsertPortfolio(agent.id, competitionId, bankrolls[agent.id], {}, bankrolls[agent.id]);
      } catch {}
    }

    // Print standings
    const standings = agents
      .map((a) => ({ name: a.name, bankroll: bankrolls[a.id] }))
      .sort((a, b) => b.bankroll - a.bankroll);

    console.log(`--- Standings after match ${matchNum} (Total: $${totalMoney}) ---`);
    for (let i = 0; i < standings.length; i++) {
      const pnl = standings[i].bankroll - 100000;
      console.log(`  #${i + 1} ${standings[i].name.padEnd(20)} $${standings[i].bankroll.toFixed(0).padStart(7)} (${pnl >= 0 ? "+" : ""}${pnl.toFixed(0)})`);
    }
  }

  return { bankrolls };
}

const roundCache = {};
function getOrCreateRound(competitionId, matchNum) {
  const key = `${competitionId}-${matchNum}`;
  if (roundCache[key]) return roundCache[key];
  const roundId = upsertRound(competitionId, matchNum, "committed", {});
  roundCache[key] = roundId;
  return roundId;
}
