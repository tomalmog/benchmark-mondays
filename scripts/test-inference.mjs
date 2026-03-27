import { getLlama, LlamaChatSession } from "node-llama-cpp";

async function main() {
  const llama = await getLlama();
  console.log("[test] Llama loaded");

  const model = await llama.loadModel({
    modelPath: "./uploads/test-models/hf_Qwen_qwen2.5-0.5b-instruct-q4_k_m.gguf",
  });
  console.log("[test] Model loaded");

  const context = await model.createContext();
  const session = new LlamaChatSession({
    contextSequence: context.getSequence(),
    systemPrompt: "You are a stock trader. Respond ONLY with valid JSON, no other text.",
  });

  const response = await session.prompt(
    'Current prices: AAPL=$200, NVDA=$100. Your cash: $10000. What trade do you want to make? Respond with JSON like: {"tool": "place_order", "args": {"action": "buy", "ticker": "AAPL", "quantity": 5}}'
  );

  console.log("[test] Response:", response);

  await model.dispose();
  await llama.dispose();
  console.log("[test] Done");
}

main().catch(console.error);
