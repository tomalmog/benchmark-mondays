import { getDb, uuid } from "./db.mjs";

const args = process.argv.slice(2);
const arenaType = args.find((arg) => !arg.startsWith("--")) || "poker";
const empty = args.includes("--empty");
const nameArgIndex = args.indexOf("--name");
const competitionName =
  nameArgIndex >= 0 && args[nameArgIndex + 1]
    ? args[nameArgIndex + 1]
    : `Week ${new Date().toISOString().slice(0, 10)} - ${arenaType}`;
const db = getDb();

const competitionId = uuid();
const now = new Date().toISOString();
const endsAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

db.prepare(`
  INSERT INTO competitions (id, name, arena_type, seed, status, starts_at, ends_at)
  VALUES (?, ?, ?, ?, 'active', ?, ?)
`).run(
  competitionId,
  competitionName,
  arenaType,
  `seed-${Date.now()}`,
  now,
  endsAt
);

console.log(`Created competition: ${competitionId} (${arenaType})`);

if (empty) {
  console.log("Created empty competition.");
  console.log("\nDone. Run: node apps/engine/src/index.mjs");
  process.exit(0);
}

const testAgents = [
  {
    name: "AggressiveBot",
    systemPrompt:
      "You are an aggressive trader/player. Always bet big, buy aggressively, and take risks. When asked to rate your hand, rate it high. When trading stocks, buy large positions.",
  },
  {
    name: "ConservativeBot",
    systemPrompt:
      "You are a conservative, careful trader/player. Only bet when you have strong hands. When trading, diversify and hold cash reserves.",
  },
  {
    name: "RandomBot",
    systemPrompt:
      "You make random decisions. Sometimes aggressive, sometimes conservative. Mix up your strategy unpredictably.",
  },
  {
    name: "AnalyticalBot",
    systemPrompt:
      "You are a data-driven analytical player. Carefully consider all available information before making decisions.",
  },
];

for (const agentDef of testAgents) {
  const userId = uuid();
  const agentId = uuid();

  db.prepare(`
    INSERT INTO users (id, github_id, github_login)
    VALUES (?, ?, ?)
  `).run(userId, `test-${agentDef.name.toLowerCase()}`, agentDef.name.toLowerCase());

  db.prepare(`
    INSERT INTO agents (id, user_id, competition_id, name, config, status)
    VALUES (?, ?, ?, ?, ?, 'active')
  `).run(
    agentId,
    userId,
    competitionId,
    agentDef.name,
    JSON.stringify({
      systemPrompt: agentDef.systemPrompt,
      examplesText: "",
      temperature: 0.7,
      topP: 0.9,
      maxTokens: 256,
      repetitionPenalty: 1.1,
    })
  );

  db.prepare(`
    INSERT INTO portfolios (id, agent_id, competition_id, cash, holdings, total_value)
    VALUES (?, ?, ?, 100000, '{}', 100000)
  `).run(uuid(), agentId, competitionId);

  console.log(`  Created agent: ${agentDef.name} (${agentId})`);
}

console.log("\nDone. Run: node apps/engine/src/index.mjs");
