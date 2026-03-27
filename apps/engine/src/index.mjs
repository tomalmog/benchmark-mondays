import { PrismaClient } from "@prisma/client";
import { CompetitionManager } from "./competition-manager.mjs";
import { stockExchangeArena } from "@weekly-benchmark/arena-stock-exchange";
import { runPokerCompetition } from "./poker-competition.mjs";
import { disposeLlama } from "./model-runner.mjs";

const prisma = new PrismaClient();

async function main() {
  console.log("[engine] Weekly Benchmark Engine v2");

  const competition = await prisma.competition.findFirst({
    where: { status: "active" },
    include: {
      agents: { where: { status: "active" }, include: { user: true } },
    },
  });

  if (!competition) {
    console.error("[engine] No active competition");
    process.exit(1);
  }

  if (competition.agents.length === 0) {
    console.error("[engine] No agents registered");
    process.exit(1);
  }

  console.log(`[engine] ${competition.name} — ${competition.agents.length} agents`);

  // Select arena based on competition type
  const arenaMap = {
    "stock-exchange": stockExchangeArena,
  };
  const arena = arenaMap[competition.arenaType];
  if (!arena) {
    console.error(`[engine] Unknown arena type: ${competition.arenaType}`);
    process.exit(1);
  }

  const manager = new CompetitionManager({
    competitionId: competition.id,
    seed: competition.seed,
    arena,
    agents: competition.agents.map((a) => ({
      id: a.id,
      name: a.name,
      config: a.config,
    })),
  });

  async function shutdown() {
    console.log("\n[engine] Shutting down...");
    await manager.stop();
    await disposeLlama();
    await prisma.$disconnect();
    process.exit(0);
  }

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);

  await manager.start();
}

main().catch((err) => {
  console.error("[engine] Fatal:", err);
  process.exit(1);
});
