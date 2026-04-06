import { generatePrices, score } from "@weekly-benchmark/arena-stock-exchange";
import { runAgentTurn } from "./agent-loop.mjs";
import {
  createAction,
  incrementInferences,
  updateAgentLastError,
  updateCompetitionRound,
  updateCompetitionStatus,
  upsertPortfolio,
  upsertRound,
} from "./db.mjs";
const MARKET_TICK_INTERVAL_MS = 30_000;

export class CompetitionManager {
  constructor(config) {
    this.competitionId = config.competitionId;
    this.seed = config.seed;
    this.agents = config.agents;
    this.arena = config.arena; // the Arena implementation

    this.state = {
      tick: 0,
      market: {},
      portfolios: {},
      agents: {},
    };

    // Per-agent action history (persists across rounds)
    this.actionHistories = {};

    this.abortController = new AbortController();
    this.marketInterval = null;
    this.actionQueue = [];
    this.flushInterval = null;
    this._roundCache = {};
  }

  initialize() {
    this.state.market = generatePrices(this.seed, 0);
    this.state.tick = 0;

    for (const agent of this.agents) {
      this.state.portfolios[agent.id] = { cash: 100_000, holdings: {} };
      this.state.agents[agent.id] = { name: agent.name };
      this.actionHistories[agent.id] = [];
    }

    console.log(`[competition] ${this.arena.name}`);
    console.log(`[competition] ${this.agents.length} agents, ${Object.keys(this.state.market).length} stocks`);
  }

  async start() {
    this.initialize();

    this.marketInterval = setInterval(() => this.tickMarket(), MARKET_TICK_INTERVAL_MS);
    this.flushInterval = setInterval(() => this.flushActions(), 5000);

    console.log(`[competition] Running — one agent at a time, 7B model`);

    let roundNum = 0;

    while (!this.abortController.signal.aborted) {
      roundNum++;
      console.log(`\n=== ROUND ${roundNum} ===`);

      for (const agent of this.agents) {
        if (this.abortController.signal.aborted) break;

        console.log(`[competition] ${agent.name}'s turn...`);

        try {
          const result = await runAgentTurn({
            agentId: agent.id,
            agentConfig: agent.config,
            arena: this.arena,
            state: this.state,
            actionHistory: this.actionHistories[agent.id],
            onAction: (action) => this.handleAction(action),
            roundNum,
          });

          // Append new actions to persistent history
          if (result.newActions) {
            this.actionHistories[agent.id].push(...result.newActions);
          }

          // Persist this agent's portfolio + actions immediately (live website updates)
          await this.persistPortfolios();
          await this.flushActions();

          incrementInferences(agent.id, result.toolCalls);

        } catch (err) {
          console.error(`[competition] ${agent.name} failed:`, err.message);
          updateAgentLastError(agent.id, err.message);
        }
      }

      // Standings
      const standings = this.getStandings();
      console.log(`--- Standings after round ${roundNum} ---`);
      for (const s of standings) {
        const pnl = s.totalValue - 100000;
        const pnlStr = pnl >= 0 ? `+$${pnl.toFixed(2)}` : `-$${Math.abs(pnl).toFixed(2)}`;
        const holdingCount = Object.keys(s.holdings).length;
        console.log(`  #${s.rank} ${s.name.padEnd(15)} $${s.totalValue.toFixed(2)} (${pnlStr}) | ${holdingCount} stocks`);
      }

      await this.persistPortfolios();
      await this.flushActions();

      await new Promise((resolve) => {
        const timeout = setTimeout(resolve, 1000);
        this.abortController.signal.addEventListener("abort", () => {
          clearTimeout(timeout);
          resolve();
        }, { once: true });
      });
    }
  }

  tickMarket() {
    this.state.tick++;
    this.state.market = generatePrices(this.seed, this.state.tick);
    console.log(`[market] Tick ${this.state.tick}`);
  }

  handleAction(action) {
    this.actionQueue.push(action);
  }

  async flushActions() {
    if (this.actionQueue.length === 0) return;
    const batch = this.actionQueue.splice(0);

    for (const action of batch) {
      try {
        const roundId = this.getOrCreateRound(this.state.tick);

        if (action.sideEffects?.type === "trade") {
          const order = action.sideEffects.order;
          createAction({
            agentId: action.agentId,
            roundId,
            competitionId: this.competitionId,
            actionType: order.action,
            ticker: order.ticker,
            quantity: order.quantity,
            price: order.price,
            transactionCost: order.transactionCost,
            rejected: false,
          });
        } else if (action.tool === "place_order" && action.result.includes('"success":false')) {
          let reason = "unknown";
          try { reason = JSON.parse(action.result).reason || "unknown"; } catch {}
          const args = action.args || {};
          createAction({
            agentId: action.agentId,
            roundId,
            competitionId: this.competitionId,
            actionType: args.action || "buy",
            ticker: args.ticker,
            quantity: typeof args.quantity === "number" ? Math.floor(args.quantity) : null,
            rejected: true,
            rejectionReason: reason,
          });
        }
      } catch (err) {
        console.error(`[competition] Persist failed:`, err.message);
      }
    }
  }

  async persistPortfolios() {
    for (const [agentId, portfolio] of Object.entries(this.state.portfolios)) {
      const totalValue = score(portfolio, { round: this.state.tick, market: this.state.market });
      try {
        upsertPortfolio(agentId, this.competitionId, portfolio.cash, portfolio.holdings, totalValue);
      } catch (err) {
        console.error(`[competition] Portfolio update failed:`, err.message);
      }
    }

    updateCompetitionRound(this.competitionId, this.state.tick);
  }

  getOrCreateRound(tick) {
    if (this._roundCache[tick]) return this._roundCache[tick];

    const roundId = upsertRound(this.competitionId, tick, "committed", this.state.market);
    this._roundCache[tick] = roundId;
    return roundId;
  }

  async stop() {
    console.log("[competition] Stopping...");
    this.abortController.abort();

    if (this.marketInterval) { clearInterval(this.marketInterval); this.marketInterval = null; }
    if (this.flushInterval) { clearInterval(this.flushInterval); this.flushInterval = null; }

    await this.flushActions();
    await this.persistPortfolios();

    updateCompetitionStatus(this.competitionId, "completed", this.state.tick);

    console.log("[competition] Stopped");
  }

  getStandings() {
    return Object.entries(this.state.portfolios)
      .map(([agentId, portfolio]) => {
        const totalValue = score(portfolio, { round: this.state.tick, market: this.state.market });
        return {
          agentId,
          name: this.state.agents[agentId]?.name || agentId,
          totalValue: Math.round(totalValue * 100) / 100,
          cash: Math.round(portfolio.cash * 100) / 100,
          holdings: { ...portfolio.holdings },
        };
      })
      .sort((a, b) => b.totalValue - a.totalValue)
      .map((entry, i) => ({ ...entry, rank: i + 1 }));
  }
}
