import { CompetitionManager } from "../apps/engine/src/competition-manager.mjs";

const MODEL_PATH = "./uploads/test-models/hf_Qwen_qwen2.5-1.5b-instruct-q4_k_m.gguf";

async function main() {
  console.log("=== Mini Competition Test ===\n");

  const manager = new CompetitionManager({
    competitionId: "test-001",
    seed: "test-seed-2026",
    agents: [
      {
        id: "agent-aggressive",
        name: "AggressiveTrader",
        modelPath: MODEL_PATH,
        systemPrompt:
          "You are an aggressive momentum trader. Buy stocks that are going up. Sell stocks that are going down. Trade frequently and take big positions.",
      },
      {
        id: "agent-conservative",
        name: "ConservativeInvestor",
        modelPath: MODEL_PATH,
        systemPrompt:
          "You are a conservative value investor. Look for undervalued stocks. Hold positions long-term. Avoid excessive trading. Preserve capital.",
      },
    ],
    onAction: (action) => {
      const { agentId, tool, args, result } = action;
      const short = typeof result === "string" ? result.substring(0, 100) : JSON.stringify(result).substring(0, 100);
      console.log(`  [${agentId}] ${tool}(${JSON.stringify(args)}) → ${short}...`);
    },
    onMarketTick: (tick) => {
      console.log(`\n--- Market Tick ${tick} ---`);
      const standings = manager.getStandings();
      for (const s of standings) {
        console.log(`  #${s.rank} ${s.name}: $${s.totalValue.toLocaleString()}`);
      }
      console.log();
    },
  });

  // Run for 90 seconds then stop
  const DURATION_MS = 90 * 1000;

  console.log(`Starting competition (running for ${DURATION_MS / 1000}s)...\n`);
  await manager.start();

  await new Promise((resolve) => setTimeout(resolve, DURATION_MS));

  console.log("\n=== Stopping competition ===\n");
  await manager.stop();

  console.log("\n=== Final Standings ===");
  const standings = manager.getStandings();
  for (const s of standings) {
    console.log(
      `  #${s.rank} ${s.name}: $${s.totalValue.toLocaleString()} (cash: $${s.cash.toLocaleString()})`
    );
    if (Object.keys(s.holdings).length > 0) {
      console.log(`    Holdings: ${JSON.stringify(s.holdings)}`);
    }
  }

  process.exit(0);
}

main().catch((err) => {
  console.error("Competition failed:", err);
  process.exit(1);
});
