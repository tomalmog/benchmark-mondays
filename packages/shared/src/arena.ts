import type {
  GameState,
  Portfolio,
  RawOrder,
  AppliedOrder,
  RejectedOrder,
  AgentRequest,
} from "./types.js";

/**
 * Action log entry — arena-agnostic record of what an agent did.
 */
export interface ActionLogEntry {
  tool: string;
  args: Record<string, unknown>;
  result: string;
  timestamp: string;
}

export interface Arena {
  /** Arena name (e.g. "Mock Stock Exchange") */
  name: string;

  /** Generate the game state for a given round */
  generateState(seed: string, round: number): GameState;

  /** Validate and apply agent orders against a portfolio */
  validateAction(
    orders: RawOrder[],
    portfolio: Portfolio,
    gameState: GameState
  ): { applied: AppliedOrder[]; rejected: RejectedOrder[] };

  /** Score a portfolio given current market state */
  score(portfolio: Portfolio, gameState: GameState): number;

  /** Build the JSON request payload to send to an agent */
  buildAgentRequest(
    round: number,
    portfolio: Portfolio,
    gameState: GameState,
    previousErrors: RejectedOrder[]
  ): AgentRequest;

  /** Parse the agent's raw JSON response into typed orders */
  parseAgentResponse(json: unknown): RawOrder[];

  // ─── Generalized prompt injection (arena-agnostic) ────────────

  /** Return the competition rules as a human-readable string */
  getRules(): string;

  /** Return the available tools as a human-readable string */
  getToolDefinitions(): string;

  /** Summarize an agent's current state as a human-readable string */
  summarizeState(portfolio: Portfolio, gameState: GameState): string;

  /** Format an agent's action history as a human-readable string */
  formatHistory(actions: ActionLogEntry[], maxEntries?: number): string;
}
