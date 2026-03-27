import { PrismaClient } from "@prisma/client";
import { playMatch } from "./poker-match.mjs";

const prisma = new PrismaClient();

/**
 * Run a full round-robin poker competition.
 * Every agent plays every other agent in a heads-up match.
 */
export async function runPokerCompetition(config) {
  const { competitionId, agents, seed, handsPerMatch = 3, onUpdate } = config;

  // Initialize bankrolls
  const bankrolls = {};
  for (const agent of agents) {
    bankrolls[agent.id] = 100000;
  }

  // Generate all matchups (round-robin)
  const matchups = [];
  for (let i = 0; i < agents.length; i++) {
    for (let j = i + 1; j < agents.length; j++) {
      matchups.push([agents[i], agents[j]]);
    }
  }

  console.log(`[poker] ${agents.length} agents, ${matchups.length} matchups, ${handsPerMatch} hands each`);

  let matchNum = 0;
  for (const [agent1, agent2] of matchups) {
    matchNum++;
    console.log(`\n=== MATCH ${matchNum}/${matchups.length}: ${agent1.name} vs ${agent2.name} ===`);

    const result = await playMatch({
      agent1: { ...agent1, bankroll: bankrolls[agent1.id] },
      agent2: { ...agent2, bankroll: bankrolls[agent2.id] },
      numHands: handsPerMatch,
      seed: `${seed}-match-${matchNum}`,
      onAction: async (action) => {
        // Log actions to DB
        try {
          const roundId = await getOrCreateRound(competitionId, matchNum);
          if (action.sideEffects?.type === "hand_complete") {
            await prisma.action.create({
              data: {
                agentId: action.agentId,
                roundId,
                competitionId,
                actionType: action.args.action || "play",
                ticker: null,
                quantity: null,
                price: action.args.amount ? Number(action.args.amount) : null,
                rejected: false,
                rejectionReason: action.result,
              },
            });
          } else {
            await prisma.action.create({
              data: {
                agentId: action.agentId,
                roundId,
                competitionId,
                actionType: action.args.action || "play",
                ticker: null,
                quantity: null,
                price: action.args.amount ? Number(action.args.amount) : null,
                rejected: false,
              },
            });
          }
        } catch (err) {
          // Don't let DB errors stop the game
        }

        // Update inference count
        prisma.agent.update({
          where: { id: action.agentId },
          data: { totalInferences: { increment: 1 } },
        }).catch(() => {});
      },
      onHandResult: (handResult) => {
        // Update bankrolls from hand result
        for (const [id, amount] of Object.entries(handResult.bankrolls)) {
          bankrolls[id] = amount;
        }
      },
    });

    // Update bankrolls from match result
    for (const [id, amount] of Object.entries(result.bankrolls)) {
      bankrolls[id] = amount;
    }

    // Persist bankrolls to DB after each match
    for (const agent of agents) {
      await prisma.portfolio.upsert({
        where: { agentId_competitionId: { agentId: agent.id, competitionId } },
        create: { agentId: agent.id, competitionId, cash: bankrolls[agent.id], holdings: {}, totalValue: bankrolls[agent.id] },
        update: { cash: bankrolls[agent.id], totalValue: bankrolls[agent.id], holdings: {} },
      }).catch((err) => console.error("[poker] Portfolio update failed:", err.message));
    }

    // Print standings
    const standings = agents
      .map((a) => ({ name: a.name, bankroll: bankrolls[a.id] }))
      .sort((a, b) => b.bankroll - a.bankroll);

    console.log(`\n--- Standings after match ${matchNum} ---`);
    for (let i = 0; i < standings.length; i++) {
      const pnl = standings[i].bankroll - 100000;
      console.log(`  #${i + 1} ${standings[i].name.padEnd(15)} $${standings[i].bankroll.toFixed(0)} (${pnl >= 0 ? "+" : ""}${pnl.toFixed(0)})`);
    }

    if (onUpdate) onUpdate(bankrolls);
  }

  // Mark competition complete
  await prisma.competition.update({
    where: { id: competitionId },
    data: { status: "completed" },
  }).catch(() => {});

  return { bankrolls };
}

const roundCache = {};
async function getOrCreateRound(competitionId, matchNum) {
  const key = `${competitionId}-${matchNum}`;
  if (roundCache[key]) return roundCache[key];

  const round = await prisma.round.upsert({
    where: { competitionId_roundNumber: { competitionId, roundNumber: matchNum } },
    create: { competitionId, roundNumber: matchNum, status: "committed", marketState: {}, startedAt: new Date(), committedAt: new Date() },
    update: {},
  });

  roundCache[key] = round.id;
  return round.id;
}
