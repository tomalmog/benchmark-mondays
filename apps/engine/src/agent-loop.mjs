import { createSession } from "./model-runner.mjs";
import { executeTool } from "./tool-executor.mjs";

/**
 * Extract all JSON objects from a response string.
 */
function extractJsonObjects(text) {
  const objects = [];
  let depth = 0;
  let start = -1;

  for (let i = 0; i < text.length; i++) {
    if (text[i] === "{") {
      if (depth === 0) start = i;
      depth++;
    } else if (text[i] === "}") {
      depth--;
      if (depth === 0 && start >= 0) {
        try {
          const obj = JSON.parse(text.substring(start, i + 1));
          if (obj.tool) objects.push(obj);
        } catch {}
        start = -1;
      }
    }
  }

  return objects;
}

/**
 * Format the raw examples text for injection into the system prompt.
 * We don't parse or validate — just cap the length and inject as-is.
 */
function formatExamples(examplesText) {
  if (!examplesText || typeof examplesText !== "string" || examplesText.trim().length === 0) return "";
  // Cap at 5000 chars to avoid blowing the context window
  const capped = examplesText.slice(0, 5000);
  return "\n\nEXAMPLES:\n" + capped;
}

/**
 * Run one agent turn using the agent's config (system prompt, examples, temperature, etc).
 * Arena-agnostic: arena provides rules, state, history, tools.
 */
export async function runAgentTurn(config) {
  const {
    agentId, agentConfig, arena, state, actionHistory,
    onAction, roundNum, toolBudget = 6,
  } = config;

  const gameState = { round: state.tick, market: state.market };
  const portfolio = state.portfolios[agentId] || { cash: 100000, holdings: {} };

  // Build system prompt: participant config + few-shot examples + arena rules + tools
  const systemPrompt = [
    agentConfig.systemPrompt,
    formatExamples(agentConfig.examplesText),
    "---",
    arena.getRules(),
    "---",
    arena.getToolDefinitions(),
  ].join("\n\n");

  // Build turn prompt with state + history
  const stateStr = arena.summarizeState(portfolio, gameState);
  const historyStr = arena.formatHistory(actionHistory, 20);
  const turnPrompt = `ROUND ${roundNum}\n\n${stateStr}\n\n${historyStr}\n\nWhat do you want to do? Respond with ONE JSON tool call.`;

  const model = await createSession(systemPrompt, agentConfig);
  let traded = false;
  let toolCallCount = 0;
  let consecutiveNonTradeTools = 0;
  const newActions = [];

  try {
    let nextPrompt = turnPrompt;

    while (toolCallCount < toolBudget) {
      const response = await model.prompt(nextPrompt);
      console.log(`[agent:${agentId.slice(0, 8)}] ${response.substring(0, 200)}`);

      const toolCalls = extractJsonObjects(response);

      if (toolCalls.length === 0) {
        nextPrompt = `Invalid response. Respond with ONE JSON tool call.`;
        toolCallCount++;
        continue;
      }

      for (const toolCall of toolCalls) {
        if (toolCallCount >= toolBudget) break;

        const { tool, args } = toolCall;
        if (!tool) continue;

        const { result, sideEffects } = executeTool(tool, args || {}, state, agentId);
        toolCallCount++;

        const actionEntry = {
          tool,
          args: args || {},
          result: typeof result === "string" ? result : JSON.stringify(result),
          timestamp: new Date().toISOString(),
        };
        newActions.push(actionEntry);

        if (tool === "place_order") {
          traded = true;
          consecutiveNonTradeTools = 0;
        } else {
          consecutiveNonTradeTools++;
        }

        if (onAction) {
          onAction({ agentId, tool, args: args || {}, result, sideEffects, timestamp: actionEntry.timestamp });
        }

        if (sideEffects?.type === "trade") {
          const o = sideEffects.order;
          console.log(`[agent:${agentId.slice(0, 8)}] ${o.action.toUpperCase()} ${o.quantity} ${o.ticker} @ $${o.price.toFixed(2)}`);
        }

        if (sideEffects?.type === "wait") {
          await new Promise((resolve) => setTimeout(resolve, Math.min(sideEffects.seconds * 1000, 1000)));
        }
      }

      // Build follow-up prompt
      const lastTool = toolCalls[toolCalls.length - 1]?.tool;

      if (lastTool === "wait") {
        nextPrompt = `Done waiting. What next?`;
      } else if (traded) {
        const p = state.portfolios[agentId];
        const held = Object.keys(p.holdings);
        nextPrompt = `Trade executed. Cash: $${p.cash.toFixed(0)}, Holdings: ${held.join(", ") || "none"}. What next?`;
      } else if (consecutiveNonTradeTools >= 1) {
        nextPrompt = `You checked info. Now BUY. What stock do you want to buy?`;
      } else {
        nextPrompt = `What next?`;
      }

      await new Promise((resolve) => setTimeout(resolve, 300));
    }

    return { toolCalls: toolCallCount, traded, newActions };
  } finally {
    await model.dispose();
  }
}
