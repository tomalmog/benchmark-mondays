import cors from "cors";
import express from "express";
import {
  createAgent,
  createUser,
  findUserAgent,
  findUserByGithub,
  getActiveCompetition,
  getActiveOrCompletedCompetition,
  getActionCountsByAgent,
  getAgentActionCountsByType,
  getAgentActions,
  getAgentById,
  getAgentCount,
  getAgentTradeCount,
  getLeaderboard,
  getPortfolio,
  getRecentActions,
  getTradeCountsByAgent,
  updateAgentConfig,
  upsertPortfolio,
  uuid,
} from "./db.mjs";

let server = null;

function parseJsonField(value, fallback) {
  if (typeof value !== "string") return value ?? fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

export function startApiServer(port = 3001) {
  if (server) {
    return server;
  }

  const app = express();

  app.use(
    cors({
      origin: process.env.CORS_ORIGIN || "*",
      methods: ["GET", "POST"],
    })
  );
  app.use(express.json({ limit: "2mb" }));

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  app.get("/api/competition", (_req, res) => {
    const competition = getActiveOrCompletedCompetition();
    if (!competition) {
      res.json(null);
      return;
    }

    const agentCount = getAgentCount(competition.id);
    const leaderboardRows = getLeaderboard(competition.id, 10);
    const activityCounts =
      competition.arena_type === "poker"
        ? getActionCountsByAgent(competition.id)
        : getTradeCountsByAgent(competition.id);
    const tradeCountMap = new Map(activityCounts.map((row) => [row.agent_id, row.count]));

    const leaderboardEntries = leaderboardRows.map((row, index) => ({
      id: row.agent_id,
      name: row.agent_name,
      githubLogin: row.github_login,
      totalValue: row.total_value,
      cash: row.cash,
      invested: Math.max(0, row.total_value - row.cash),
      tradeCount: tradeCountMap.get(row.agent_id) || 0,
      rank: index + 1,
    }));

    const activityItems = getRecentActions(competition.id, 30).map((row) => ({
      id: row.id,
      agentName: row.agent_name,
      actionType: row.action_type,
      ticker: row.ticker,
      quantity: row.quantity,
      price: row.price,
      rejected: !!row.rejected,
      rejectionReason: row.rejection_reason,
      createdAt: row.created_at,
    }));

    res.json({
      competition: {
        id: competition.id,
        name: competition.name,
        arenaType: competition.arena_type,
        startsAt: competition.starts_at,
        endsAt: competition.ends_at,
        currentRound: competition.current_round,
        status: competition.status,
      },
      agentCount,
      leaderboardEntries,
      activityItems,
    });
  });

  app.get("/api/agents/:id", (req, res) => {
    const agent = getAgentById(req.params.id);
    if (!agent) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }

    const portfolio = getPortfolio(agent.id, agent.competition_id);
    const holdings = parseJsonField(portfolio?.holdings, {});
    const totalValue = portfolio?.total_value ?? 100000;
    const cash = portfolio?.cash ?? 100000;
    const countMap = Object.fromEntries(
      getAgentActionCountsByType(agent.id).map((row) => [row.action_type, row.count])
    );

    res.json({
      id: agent.id,
      name: agent.name,
      githubLogin: agent.github_login,
      arenaType: agent.arena_type,
      totalValue,
      cash,
      pnl: totalValue - 100000,
      holdings,
      totalInferences: agent.total_inferences,
      isPoker: agent.arena_type === "poker",
      countMap,
      actions: getAgentActions(agent.id, 50).map((row) => ({
        id: row.id,
        actionType: row.action_type,
        ticker: row.ticker,
        quantity: row.quantity,
        price: row.price,
        rejected: !!row.rejected,
        rejectionReason: row.rejection_reason,
        createdAt: row.created_at,
      })),
    });
  });

  app.get("/api/agents/:id/config", (req, res) => {
    const githubLogin = String(req.query.githubLogin || "");
    if (!githubLogin) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }

    const agent = getAgentById(req.params.id);
    if (!agent) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }

    if (agent.github_login !== githubLogin && agent.github_id !== githubLogin) {
      res.status(403).json({ error: "Not your agent" });
      return;
    }

    const config = parseJsonField(agent.config, {});
    res.json({
      systemPrompt: config.systemPrompt || "",
      examplesText: config.examplesText || "",
      temperature: config.temperature ?? 0.7,
      topP: config.topP ?? 0.9,
      maxTokens: config.maxTokens ?? 256,
      repetitionPenalty: config.repetitionPenalty ?? 1.1,
    });
  });

  app.get("/api/my-agent", (req, res) => {
    const githubLogin = String(req.query.githubLogin || "");
    if (!githubLogin) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }

    const user = findUserByGithub(githubLogin);
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const competition = getActiveOrCompletedCompetition();
    if (!competition) {
      res.status(404).json({ error: "No competition" });
      return;
    }

    const agent = findUserAgent(user.id, competition.id);
    if (!agent) {
      res.status(404).json({ error: "No agent" });
      return;
    }

    const portfolio = getPortfolio(agent.id, competition.id);
    const totalValue = portfolio?.total_value ?? 100000;
    const cash = portfolio?.cash ?? 100000;
    const holdings = parseJsonField(portfolio?.holdings, {});

    res.json({
      id: agent.id,
      name: agent.name,
      totalValue,
      cash,
      pnl: totalValue - 100000,
      holdings,
      tradeCount: getAgentTradeCount(agent.id),
      totalInferences: agent.total_inferences,
      recentTrades: getAgentActions(agent.id, 50).map((row) => ({
        actionType: row.action_type,
        ticker: row.ticker,
        quantity: row.quantity,
        price: row.price,
        rejected: !!row.rejected,
        rejectionReason: row.rejection_reason,
        createdAt: row.created_at,
      })),
    });
  });

  app.post("/api/agents/submit", (req, res) => {
    try {
      const { name, config, githubLogin, githubEmail } = req.body ?? {};
      if (!name || !config?.systemPrompt) {
        res.status(400).json({ error: "Agent name and system prompt required" });
        return;
      }

      const competition = getActiveCompetition();
      if (!competition) {
        res.status(400).json({ error: "No active competition" });
        return;
      }

      if (getAgentCount(competition.id) >= competition.max_agents) {
        res.status(400).json({ error: "Competition is full" });
        return;
      }

      const login = String(githubLogin || githubEmail || "unknown");
      let user = findUserByGithub(login);
      if (!user) {
        user = createUser(uuid(), String(githubEmail || login), login);
      }

      if (findUserAgent(user.id, competition.id)) {
        res.status(409).json({ error: "You already have an agent in this competition" });
        return;
      }

      const validatedConfig = {
        systemPrompt: String(config.systemPrompt).trim().slice(0, 10000),
        examplesText: String(config.examplesText || "").slice(0, 1000000),
        temperature: Math.max(0, Math.min(2, Number(config.temperature) || 0.7)),
        topP: Math.max(0.1, Math.min(1, Number(config.topP) || 0.9)),
        maxTokens: Math.max(64, Math.min(512, Math.floor(Number(config.maxTokens) || 256))),
        repetitionPenalty: Math.max(1, Math.min(2, Number(config.repetitionPenalty) || 1.1)),
      };

      const agentId = uuid();
      createAgent(agentId, user.id, competition.id, String(name).trim(), validatedConfig);
      upsertPortfolio(agentId, competition.id, 100000, {}, 100000);

      res.json({ id: agentId, name: String(name).trim(), message: "Agent submitted." });
    } catch (error) {
      console.error("[api/submit]", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/agents/update", (req, res) => {
    try {
      const { agentId, config, githubLogin } = req.body ?? {};
      if (!agentId || !config?.systemPrompt || !githubLogin) {
        res.status(400).json({ error: "Missing agent ID, githubLogin, or system prompt" });
        return;
      }

      const agent = getAgentById(agentId);
      if (!agent) {
        res.status(404).json({ error: "Agent not found" });
        return;
      }

      if (agent.github_login !== githubLogin && agent.github_id !== githubLogin) {
        res.status(403).json({ error: "Not your agent" });
        return;
      }

      updateAgentConfig(agentId, {
        systemPrompt: String(config.systemPrompt).trim().slice(0, 10000),
        examplesText: String(config.examplesText || "").slice(0, 1000000),
        temperature: Math.max(0, Math.min(2, Number(config.temperature) || 0.7)),
        topP: Math.max(0.1, Math.min(1, Number(config.topP) || 0.9)),
        maxTokens: Math.max(64, Math.min(512, Math.floor(Number(config.maxTokens) || 256))),
        repetitionPenalty: Math.max(1, Math.min(2, Number(config.repetitionPenalty) || 1.1)),
      });

      res.json({ message: "Agent updated." });
    } catch (error) {
      console.error("[api/update]", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  server = app.listen(port, "0.0.0.0", () => {
    console.log(`[api] Listening on port ${port}`);
  });

  return server;
}

export function stopApiServer() {
  if (!server) return;
  server.close();
  server = null;
}
