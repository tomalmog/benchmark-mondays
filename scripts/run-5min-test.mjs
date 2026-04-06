import { CompetitionManager } from "../apps/engine/src/competition-manager.mjs";
import { stockExchangeArena } from "@weekly-benchmark/arena-stock-exchange";
import { disposeLlama } from "../apps/engine/src/model-runner.mjs";
import {
  getActiveCompetition,
  getAgentTradeCount,
  getAgentsForCompetition,
} from "../apps/engine/src/db.mjs";
const DURATION_MS = 5 * 60 * 1000;

async function main() {
  const competition = getActiveCompetition();
  const agents = competition ? getAgentsForCompetition(competition.id) : [];

  if (!competition || agents.length === 0) {
    console.error("No active competition or agents");
    process.exit(1);
  }

  console.log(`=== ${competition.name} — ${agents.length} agents, ${DURATION_MS/1000}s ===\n`);

  const manager = new CompetitionManager({
    competitionId: competition.id,
    seed: competition.seed,
    arena: stockExchangeArena,
    agents: agents.map((a) => ({
      id: a.id,
      name: a.name,
      config: typeof a.config === "string" ? JSON.parse(a.config) : a.config,
    })),
  });

  const runPromise = manager.start();

  setTimeout(async () => {
    await manager.stop();
    await disposeLlama();
    await runPromise;

    const standings = manager.getStandings();
    console.log("\n=== FINAL RESULTS ===");
    for (const s of standings) {
      const pnl = s.totalValue - 100000;
      console.log(`  #${s.rank} ${s.name}: $${s.totalValue.toFixed(2)} (${pnl >= 0 ? '+' : ''}${pnl.toFixed(2)})`);
      if (Object.keys(s.holdings).length > 0) console.log(`     Holdings: ${JSON.stringify(s.holdings)}`);
    }

    const trades = standings.reduce((total, standing) => total + getAgentTradeCount(standing.agentId), 0);
    console.log(`\n  Total trades: ${trades}`);
    process.exit(0);
  }, DURATION_MS);
}

main().catch(err => { console.error(err); process.exit(1); });
