import fs from "fs";
import { createAgent, createUser, findUserAgent, findUserByGithub, getActiveCompetition, upsertPortfolio, uuid } from "./db.mjs";

const inputPath = process.argv[2];

if (!inputPath) {
  console.error("Usage: node apps/engine/src/import-agents-json.mjs <path-to-agents.json>");
  process.exit(1);
}

const competition = getActiveCompetition();
if (!competition) {
  console.error("No active competition found.");
  process.exit(1);
}

const agents = JSON.parse(fs.readFileSync(inputPath, "utf8"));
if (!Array.isArray(agents)) {
  console.error("Input must be a JSON array.");
  process.exit(1);
}

let imported = 0;
let skipped = 0;

for (const row of agents) {
  const githubLogin = String(row.githubLogin || "").trim();
  const githubId = String(row.githubId || githubLogin || uuid()).trim();
  const agentName = String(row.agentName || "").trim();
  const config = row.config && typeof row.config === "object" ? row.config : null;

  if (!githubLogin || !agentName || !config?.systemPrompt) {
    skipped++;
    continue;
  }

  let user = findUserByGithub(githubLogin) || findUserByGithub(githubId);
  if (!user) {
    user = createUser(uuid(), githubId, githubLogin);
  }

  if (findUserAgent(user.id, competition.id)) {
    skipped++;
    continue;
  }

  const agentId = uuid();
  createAgent(agentId, user.id, competition.id, agentName, {
    systemPrompt: String(config.systemPrompt),
    examplesText: String(config.examplesText || ""),
    temperature: Number(config.temperature ?? 0.7),
    topP: Number(config.topP ?? 0.9),
    maxTokens: Number(config.maxTokens ?? 256),
    repetitionPenalty: Number(config.repetitionPenalty ?? 1.1),
  });
  upsertPortfolio(agentId, competition.id, 100000, {}, 100000);
  imported++;
}

console.log(`Imported ${imported} agents into ${competition.name}. Skipped ${skipped}.`);
