// ─── Market Types ───────────────────────────────────────────

export interface StockPrice {
  price: number;
  change_pct: number;
}

export interface MarketState {
  [ticker: string]: StockPrice;
}

export interface GameState {
  round: number;
  market: MarketState;
}

// ─── Portfolio Types ────────────────────────────────────────

export interface Holdings {
  [ticker: string]: number;
}

export interface Portfolio {
  cash: number;
  holdings: Holdings;
}

// ─── Order Types ────────────────────────────────────────────

export interface RawOrder {
  action: "buy" | "sell";
  ticker: string;
  quantity: number;
}

export interface AppliedOrder extends RawOrder {
  price: number;
  transactionCost: number;
}

export interface RejectedOrder {
  order: RawOrder;
  reason: string;
}

// ─── Agent API Contract ─────────────────────────────────────

export interface AgentRequest {
  round: number;
  timestamp: string;
  portfolio: {
    cash: number;
    holdings: Holdings;
  };
  market: MarketState;
  errors: RejectedOrder[];
}

export interface AgentResponse {
  orders: RawOrder[];
}

// ─── Agent Config ───────────────────────────────────────────

export interface AgentConfig {
  systemPrompt: string;
  examplesText: string;      // raw text file contents, injected as-is
  temperature: number;       // 0.0 - 2.0, default 0.7
  topP: number;              // 0.0 - 1.0, default 0.9
  maxTokens: number;         // 1 - 512, default 256
  repetitionPenalty: number;  // 1.0 - 2.0, default 1.1
}
