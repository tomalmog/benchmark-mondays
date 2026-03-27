import { PrismaClient } from "@prisma/client";
import { runPokerCompetition } from "../apps/engine/src/poker-competition.mjs";
import { disposeLlama } from "../apps/engine/src/model-runner.mjs";

const prisma = new PrismaClient();

async function main() {
  const competition = await prisma.competition.findFirst({
    where: { status: "active" },
    include: { agents: { where: { status: "active" }, include: { user: true } } },
  });

  if (!competition || competition.agents.length < 2) {
    console.error("Need at least 2 agents for poker");
    process.exit(1);
  }

  console.log(`=== ${competition.name} — ${competition.agents.length} agents ===\n`);

  const agents = competition.agents.map((a) => ({
    id: a.id,
    name: a.name,
    config: a.config,
  }));

  const result = await runPokerCompetition({
    competitionId: competition.id,
    agents,
    seed: competition.seed,
    handsPerMatch: 3,
  });

  console.log("\n=== FINAL RESULTS ===");
  const sorted = Object.entries(result.bankrolls)
    .map(([id, bankroll]) => ({
      name: agents.find((a) => a.id === id)?.name || id,
      bankroll,
    }))
    .sort((a, b) => b.bankroll - a.bankroll);

  for (let i = 0; i < sorted.length; i++) {
    const pnl = sorted[i].bankroll - 100000;
    console.log(`  #${i + 1} ${sorted[i].name}: $${sorted[i].bankroll.toFixed(0)} (${pnl >= 0 ? "+" : ""}${pnl.toFixed(0)})`);
  }

  await disposeLlama();
  await prisma.$disconnect();
  process.exit(0);
}

main().catch((err) => { console.error(err); process.exit(1); });
