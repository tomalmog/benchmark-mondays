import { PrismaClient } from "@prisma/client";
import { CompetitionManager } from "../apps/engine/src/competition-manager.mjs";

const prisma = new PrismaClient();
const DURATION_MS = 10 * 60 * 1000; // 10 minutes

async function main() {
  console.log("=== Weekly Benchmark — Full Competition Test ===\n");

  // Load active competition from DB
  const competition = await prisma.competition.findFirst({
    where: { status: "active" },
    include: {
      agents: {
        where: { status: "active" },
        include: { user: true },
      },
    },
  });

  if (!competition) {
    console.error("No active competition found");
    process.exit(1);
  }

  console.log(`Competition: ${competition.name} (${competition.id})`);
  console.log(`Agents: ${competition.agents.length}`);
  console.log(`Seed: ${competition.seed}`);
  console.log(`Duration: ${DURATION_MS / 1000}s\n`);

  const agents = competition.agents.map((a) => ({
    id: a.id,
    name: a.name,
    modelPath: a.modelPath,
    systemPrompt: a.systemPrompt,
  }));

  let tradeCount = 0;
  let totalInferences = 0;

  const manager = new CompetitionManager({
    competitionId: competition.id,
    seed: competition.seed,
    agents,
    onAction: (action) => {
      totalInferences++;
      if (action.sideEffects?.type === "trade") {
        tradeCount++;
        const o = action.sideEffects.order;
        console.log(
          `  TRADE [${action.agentId.slice(0, 8)}] ${o.action.toUpperCase()} ${o.quantity} ${o.ticker} @ $${o.price.toFixed(2)}`
        );
      }
    },
    onMarketTick: (tick) => {
      console.log(`\n--- Market Tick ${tick} | Trades so far: ${tradeCount} | Inferences: ${totalInferences} ---`);
      const standings = manager.getStandings();
      for (const s of standings) {
        const pnl = s.totalValue - 100000;
        const pnlStr = pnl >= 0 ? `+$${pnl.toFixed(2)}` : `-$${Math.abs(pnl).toFixed(2)}`;
        const holdingCount = Object.keys(s.holdings).length;
        console.log(
          `  #${s.rank} ${s.name.padEnd(15)} $${s.totalValue.toLocaleString("en-US", { minimumFractionDigits: 2 })} (${pnlStr}) | ${holdingCount} stocks held`
        );
      }
      console.log();
    },
  });

  console.log("Starting competition...\n");
  await manager.start();

  // Run for the duration
  await new Promise((resolve) => setTimeout(resolve, DURATION_MS));

  console.log("\n=== STOPPING COMPETITION ===\n");
  await manager.stop();

  // Final report
  console.log("\n" + "=".repeat(60));
  console.log("  FINAL RESULTS");
  console.log("=".repeat(60));

  const standings = manager.getStandings();
  for (const s of standings) {
    const pnl = s.totalValue - 100000;
    const pnlStr = pnl >= 0 ? `+$${pnl.toFixed(2)}` : `-$${Math.abs(pnl).toFixed(2)}`;
    console.log(`\n  #${s.rank} ${s.name}`);
    console.log(`     Portfolio: $${s.totalValue.toLocaleString("en-US", { minimumFractionDigits: 2 })}`);
    console.log(`     P&L:      ${pnlStr}`);
    console.log(`     Cash:     $${s.cash.toLocaleString("en-US", { minimumFractionDigits: 2 })}`);
    if (Object.keys(s.holdings).length > 0) {
      console.log(`     Holdings: ${JSON.stringify(s.holdings)}`);
    }
  }

  console.log(`\n  Total trades: ${tradeCount}`);
  console.log(`  Total inferences: ${totalInferences}`);
  console.log(`  Market ticks: ${manager.state.tick}`);
  console.log("=".repeat(60));

  // Verify data in DB
  const dbActions = await prisma.action.count({
    where: { competitionId: competition.id },
  });
  const dbPortfolios = await prisma.portfolio.findMany({
    where: { competitionId: competition.id },
    include: { agent: true },
    orderBy: { totalValue: "desc" },
  });

  console.log(`\n  DB verification:`);
  console.log(`    Actions in DB: ${dbActions}`);
  for (const p of dbPortfolios) {
    console.log(`    ${p.agent.name}: $${Number(p.totalValue).toFixed(2)} (DB)`);
  }

  await prisma.$disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error("Competition failed:", err);
  process.exit(1);
});
