import { CompetitionManager } from "./competition-manager.mjs";
import { stockExchangeArena } from "@weekly-benchmark/arena-stock-exchange";
import { runPokerCompetition } from "./poker-competition.mjs";
import { disposeLlama } from "./model-runner.mjs";
import { startApiServer, stopApiServer } from "./api-server.mjs";
import { getActiveCompetition, getAgentsForCompetition } from "./db.mjs";

async function main() {
  console.log("[engine] Weekly Benchmark Engine v3 (SQLite + L4)");

  const apiPort = Number(process.env.API_PORT || 3001);
  startApiServer(apiPort);

  const competition = getActiveCompetition();
  if (!competition) {
    console.log("[engine] No active competition - API server running, waiting for competition.");
    return;
  }

  const agents = getAgentsForCompetition(competition.id);
  if (agents.length === 0) {
    console.log("[engine] No agents registered - API server running, waiting for agents.");
    return;
  }

  console.log(`[engine] ${competition.name} - ${agents.length} agents - arena: ${competition.arena_type}`);

  const agentConfigs = agents.map((agent) => ({
    id: agent.id,
    name: agent.name,
    config: typeof agent.config === "string" ? JSON.parse(agent.config) : agent.config,
  }));

  if (competition.arena_type === "poker") {
    await runPokerCompetition({
      competitionId: competition.id,
      agents: agentConfigs,
      seed: competition.seed,
      handsPerMatch: 3,
    });
    return;
  }

  const arenaMap = { "stock-exchange": stockExchangeArena };
  const arena = arenaMap[competition.arena_type];
  if (!arena) {
    console.error(`[engine] Unknown arena type: ${competition.arena_type}`);
    process.exit(1);
  }

  const manager = new CompetitionManager({
    competitionId: competition.id,
    seed: competition.seed,
    arena,
    agents: agentConfigs.map((a) => ({
      id: a.id,
      name: a.name,
      config: a.config,
    })),
  });

  async function shutdown() {
    console.log("\n[engine] Shutting down...");
    await manager.stop();
    await disposeLlama();
    stopApiServer();
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
