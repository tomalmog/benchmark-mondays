import { PrismaClient } from "@prisma/client";
import { CompetitionManager } from "../apps/engine/src/competition-manager.mjs";
import { stockExchangeArena } from "@weekly-benchmark/arena-stock-exchange";
import { disposeLlama } from "../apps/engine/src/model-runner.mjs";

const prisma = new PrismaClient();
const DURATION_MS = 5 * 60 * 1000;

async function main() {
  const competition = await prisma.competition.findFirst({
    where: { status: "active" },
    include: { agents: { where: { status: "active" }, include: { user: true } } },
  });

  if (!competition || competition.agents.length === 0) {
    console.error("No active competition or agents");
    process.exit(1);
  }

  console.log(`=== ${competition.name} — ${competition.agents.length} agents, ${DURATION_MS/1000}s ===\n`);

  const manager = new CompetitionManager({
    competitionId: competition.id,
    seed: competition.seed,
    arena: stockExchangeArena,
    agents: competition.agents.map(a => ({
      id: a.id, name: a.name, config: a.config,
    })),
  });

  await manager.start();

  setTimeout(async () => {
    await manager.stop();
    await disposeLlama();

    const standings = manager.getStandings();
    console.log("\n=== FINAL RESULTS ===");
    for (const s of standings) {
      const pnl = s.totalValue - 100000;
      console.log(`  #${s.rank} ${s.name}: $${s.totalValue.toFixed(2)} (${pnl >= 0 ? '+' : ''}${pnl.toFixed(2)})`);
      if (Object.keys(s.holdings).length > 0) console.log(`     Holdings: ${JSON.stringify(s.holdings)}`);
    }

    const trades = await prisma.action.count({ where: { actionType: { in: ['buy','sell'] }, rejected: false } });
    console.log(`\n  Total trades: ${trades}`);
    await prisma.$disconnect();
    process.exit(0);
  }, DURATION_MS);
}

main().catch(err => { console.error(err); process.exit(1); });
