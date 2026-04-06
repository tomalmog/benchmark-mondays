import Database from "better-sqlite3";
import { randomUUID } from "crypto";
import { mkdirSync } from "fs";
import path from "path";

const DB_PATH = process.env.DB_PATH || path.resolve(process.cwd(), "data", "benchmark.db");

let db = null;

function serializeJson(value, fallback = {}) {
  if (typeof value === "string") {
    return value;
  }
  return JSON.stringify(value ?? fallback);
}

export function uuid() {
  return randomUUID();
}

export function getDb() {
  if (db) return db;

  mkdirSync(path.dirname(DB_PATH), { recursive: true });
  db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  initSchema(db);

  return db;
}

export function closeDb() {
  if (!db) return;
  db.close();
  db = null;
}

function initSchema(database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      github_id TEXT UNIQUE NOT NULL,
      github_login TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS competitions (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      arena_type TEXT NOT NULL,
      seed TEXT NOT NULL,
      status TEXT DEFAULT 'draft',
      starts_at TEXT NOT NULL,
      ends_at TEXT NOT NULL,
      current_round INTEGER DEFAULT 0,
      max_agents INTEGER DEFAULT 50,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS agents (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      competition_id TEXT NOT NULL REFERENCES competitions(id),
      name TEXT NOT NULL,
      config TEXT NOT NULL DEFAULT '{}',
      status TEXT DEFAULT 'active',
      total_inferences INTEGER DEFAULT 0,
      last_error TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(user_id, competition_id)
    );

    CREATE TABLE IF NOT EXISTS portfolios (
      id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL REFERENCES agents(id),
      competition_id TEXT NOT NULL REFERENCES competitions(id),
      cash REAL DEFAULT 100000.00,
      holdings TEXT DEFAULT '{}',
      total_value REAL DEFAULT 100000.00,
      updated_at TEXT DEFAULT (datetime('now')),
      UNIQUE(agent_id, competition_id)
    );

    CREATE TABLE IF NOT EXISTS rounds (
      id TEXT PRIMARY KEY,
      competition_id TEXT NOT NULL REFERENCES competitions(id),
      round_number INTEGER NOT NULL,
      status TEXT DEFAULT 'pending',
      market_state TEXT,
      started_at TEXT,
      committed_at TEXT,
      UNIQUE(competition_id, round_number)
    );

    CREATE TABLE IF NOT EXISTS actions (
      id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL REFERENCES agents(id),
      round_id TEXT NOT NULL REFERENCES rounds(id),
      competition_id TEXT NOT NULL REFERENCES competitions(id),
      action_type TEXT NOT NULL,
      ticker TEXT,
      quantity INTEGER,
      price REAL,
      transaction_cost REAL,
      rejected INTEGER DEFAULT 0,
      rejection_reason TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_portfolios_comp_value ON portfolios(competition_id, total_value DESC);
    CREATE INDEX IF NOT EXISTS idx_rounds_comp_number ON rounds(competition_id, round_number);
    CREATE INDEX IF NOT EXISTS idx_actions_comp_created ON actions(competition_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_actions_agent_created ON actions(agent_id, created_at DESC);
  `);
}

export function getActiveCompetition() {
  return getDb()
    .prepare(`
      SELECT * FROM competitions
      WHERE status IN ('active', 'draft')
      ORDER BY created_at DESC
      LIMIT 1
    `)
    .get();
}

export function getActiveOrCompletedCompetition() {
  return getDb()
    .prepare(`
      SELECT * FROM competitions
      WHERE status IN ('active', 'completed')
      ORDER BY created_at DESC
      LIMIT 1
    `)
    .get();
}

export function updateCompetitionRound(competitionId, round) {
  getDb()
    .prepare(`
      UPDATE competitions
      SET current_round = ?
      WHERE id = ?
    `)
    .run(round, competitionId);
}

export function updateCompetitionStatus(competitionId, status, round = null) {
  const database = getDb();
  if (round == null) {
    database
      .prepare(`
        UPDATE competitions
        SET status = ?
        WHERE id = ?
      `)
      .run(status, competitionId);
    return;
  }

  database
    .prepare(`
      UPDATE competitions
      SET status = ?, current_round = ?
      WHERE id = ?
    `)
    .run(status, round, competitionId);
}

export function getAgentsForCompetition(competitionId) {
  return getDb()
    .prepare(`
      SELECT a.*, u.github_login, u.github_id
      FROM agents a
      JOIN users u ON a.user_id = u.id
      WHERE a.competition_id = ? AND a.status = 'active'
      ORDER BY a.created_at ASC
    `)
    .all(competitionId);
}

export function getAgentById(agentId) {
  return getDb()
    .prepare(`
      SELECT a.*, u.github_login, u.github_id, c.arena_type, c.name AS competition_name
      FROM agents a
      JOIN users u ON a.user_id = u.id
      JOIN competitions c ON a.competition_id = c.id
      WHERE a.id = ?
    `)
    .get(agentId);
}

export function getAgentCount(competitionId) {
  const row = getDb()
    .prepare(`
      SELECT COUNT(*) AS count
      FROM agents
      WHERE competition_id = ?
    `)
    .get(competitionId);

  return row?.count ?? 0;
}

export function findUserAgent(userId, competitionId) {
  return getDb()
    .prepare(`
      SELECT *
      FROM agents
      WHERE user_id = ? AND competition_id = ?
    `)
    .get(userId, competitionId);
}

export function createAgent(id, userId, competitionId, name, config) {
  getDb()
    .prepare(`
      INSERT INTO agents (id, user_id, competition_id, name, config)
      VALUES (?, ?, ?, ?, ?)
    `)
    .run(id, userId, competitionId, name, serializeJson(config));
}

export function updateAgentConfig(agentId, config) {
  getDb()
    .prepare(`
      UPDATE agents
      SET config = ?
      WHERE id = ?
    `)
    .run(serializeJson(config), agentId);
}

export function incrementInferences(agentId, count = 1) {
  getDb()
    .prepare(`
      UPDATE agents
      SET total_inferences = total_inferences + ?
      WHERE id = ?
    `)
    .run(count, agentId);
}

export function updateAgentLastError(agentId, lastError) {
  getDb()
    .prepare(`
      UPDATE agents
      SET last_error = ?
      WHERE id = ?
    `)
    .run(lastError, agentId);
}

export function findUserByGithub(githubLogin) {
  return getDb()
    .prepare(`
      SELECT *
      FROM users
      WHERE github_login = ? OR github_id = ?
    `)
    .get(githubLogin, githubLogin);
}

export function createUser(id, githubId, githubLogin) {
  const database = getDb();
  database
    .prepare(`
      INSERT INTO users (id, github_id, github_login)
      VALUES (?, ?, ?)
    `)
    .run(id, githubId, githubLogin);

  return database.prepare(`SELECT * FROM users WHERE id = ?`).get(id);
}

export function getPortfolio(agentId, competitionId) {
  return getDb()
    .prepare(`
      SELECT *
      FROM portfolios
      WHERE agent_id = ? AND competition_id = ?
    `)
    .get(agentId, competitionId);
}

export function getLeaderboard(competitionId, limit = 10) {
  return getDb()
    .prepare(`
      SELECT
        p.*,
        a.id AS agent_id,
        a.name AS agent_name,
        u.github_login
      FROM portfolios p
      JOIN agents a ON p.agent_id = a.id
      JOIN users u ON a.user_id = u.id
      WHERE p.competition_id = ?
      ORDER BY p.total_value DESC
      LIMIT ?
    `)
    .all(competitionId, limit);
}

export function getPortfoliosForCompetition(competitionId) {
  return getDb()
    .prepare(`
      SELECT
        p.*,
        a.name AS agent_name
      FROM portfolios p
      JOIN agents a ON p.agent_id = a.id
      WHERE p.competition_id = ?
      ORDER BY p.total_value DESC
    `)
    .all(competitionId);
}

export function upsertPortfolio(agentId, competitionId, cash, holdings, totalValue) {
  const database = getDb();
  const existing = database
    .prepare(`
      SELECT id
      FROM portfolios
      WHERE agent_id = ? AND competition_id = ?
    `)
    .get(agentId, competitionId);

  if (existing) {
    database
      .prepare(`
        UPDATE portfolios
        SET cash = ?, holdings = ?, total_value = ?, updated_at = datetime('now')
        WHERE agent_id = ? AND competition_id = ?
      `)
      .run(cash, serializeJson(holdings), totalValue, agentId, competitionId);
    return existing.id;
  }

  const id = uuid();
  database
    .prepare(`
      INSERT INTO portfolios (id, agent_id, competition_id, cash, holdings, total_value)
      VALUES (?, ?, ?, ?, ?, ?)
    `)
    .run(id, agentId, competitionId, cash, serializeJson(holdings), totalValue);

  return id;
}

export function upsertRound(competitionId, roundNumber, status = "committed", marketState = {}) {
  const database = getDb();
  const existing = database
    .prepare(`
      SELECT id
      FROM rounds
      WHERE competition_id = ? AND round_number = ?
    `)
    .get(competitionId, roundNumber);

  if (existing) {
    database
      .prepare(`
        UPDATE rounds
        SET status = ?, market_state = ?, committed_at = datetime('now')
        WHERE id = ?
      `)
      .run(status, serializeJson(marketState), existing.id);
    return existing.id;
  }

  const id = uuid();
  database
    .prepare(`
      INSERT INTO rounds (id, competition_id, round_number, status, market_state, started_at, committed_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `)
    .run(id, competitionId, roundNumber, status, serializeJson(marketState));

  return id;
}

export function createAction(data) {
  const id = uuid();

  getDb()
    .prepare(`
      INSERT INTO actions (
        id,
        agent_id,
        round_id,
        competition_id,
        action_type,
        ticker,
        quantity,
        price,
        transaction_cost,
        rejected,
        rejection_reason
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .run(
      id,
      data.agentId,
      data.roundId,
      data.competitionId,
      data.actionType,
      data.ticker ?? null,
      data.quantity ?? null,
      data.price ?? null,
      data.transactionCost ?? null,
      data.rejected ? 1 : 0,
      data.rejectionReason ?? null
    );

  return id;
}

export function countActions(competitionId = null) {
  const database = getDb();

  if (!competitionId) {
    const row = database.prepare(`SELECT COUNT(*) AS count FROM actions`).get();
    return row?.count ?? 0;
  }

  const row = database
    .prepare(`
      SELECT COUNT(*) AS count
      FROM actions
      WHERE competition_id = ?
    `)
    .get(competitionId);

  return row?.count ?? 0;
}

export function getTradeCountsByAgent(competitionId) {
  return getDb()
    .prepare(`
      SELECT agent_id, COUNT(*) AS count
      FROM actions
      WHERE competition_id = ? AND action_type IN ('buy', 'sell') AND rejected = 0
      GROUP BY agent_id
    `)
    .all(competitionId);
}

export function getActionCountsByAgent(competitionId) {
  return getDb()
    .prepare(`
      SELECT agent_id, COUNT(*) AS count
      FROM actions
      WHERE competition_id = ? AND rejected = 0 AND action_type NOT IN ('error', 'timeout')
      GROUP BY agent_id
    `)
    .all(competitionId);
}

export function getRecentActions(competitionId, limit = 30) {
  return getDb()
    .prepare(`
      SELECT act.*, a.name AS agent_name
      FROM actions act
      JOIN agents a ON act.agent_id = a.id
      WHERE act.competition_id = ?
      ORDER BY act.created_at DESC
      LIMIT ?
    `)
    .all(competitionId, limit);
}

export function getAgentActions(agentId, limit = 50) {
  return getDb()
    .prepare(`
      SELECT *
      FROM actions
      WHERE agent_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `)
    .all(agentId, limit);
}

export function getAgentActionCountsByType(agentId) {
  return getDb()
    .prepare(`
      SELECT action_type, COUNT(*) AS count
      FROM actions
      WHERE agent_id = ? AND rejected = 0
      GROUP BY action_type
    `)
    .all(agentId);
}

export function getAgentTradeCount(agentId) {
  const row = getDb()
    .prepare(`
      SELECT COUNT(*) AS count
      FROM actions
      WHERE agent_id = ? AND action_type IN ('buy', 'sell') AND rejected = 0
    `)
    .get(agentId);

  return row?.count ?? 0;
}
