import { getLlama, LlamaChatSession } from "node-llama-cpp";

// Platform default model path
export const PLATFORM_MODEL_PATH = "./uploads/test-models/hf_Qwen_qwen2.5-1.5b-instruct-q4_k_m.gguf";

let llamaInstance = null;
let loadedModel = null;
let loadedModelPath = null;

async function getLlamaInstance() {
  if (!llamaInstance) {
    llamaInstance = await getLlama();
  }
  return llamaInstance;
}

async function getModel(modelPath) {
  if (loadedModel && loadedModelPath === modelPath) {
    return loadedModel;
  }

  if (loadedModel) {
    await loadedModel.dispose();
    loadedModel = null;
    loadedModelPath = null;
  }

  const llama = await getLlamaInstance();
  loadedModel = await llama.loadModel({ modelPath });
  loadedModelPath = modelPath;
  console.log(`[model-runner] Model loaded: ${modelPath.split("/").pop()}`);
  return loadedModel;
}

/**
 * Create a chat session with the platform model using an agent's config.
 *
 * @param {object} config - AgentConfig: { systemPrompt, examples, temperature, topP, maxTokens, repetitionPenalty }
 * @param {string} fullSystemPrompt - The complete system prompt (participant's + arena rules + tools)
 */
export async function createSession(fullSystemPrompt, config = {}) {
  const model = await getModel(PLATFORM_MODEL_PATH);
  const context = await model.createContext();

  const session = new LlamaChatSession({
    contextSequence: context.getSequence(),
    systemPrompt: fullSystemPrompt,
  });

  const temperature = config.temperature ?? 0.7;
  const topP = config.topP ?? 0.9;
  const maxTokens = config.maxTokens ?? 256;
  const repeatPenalty = config.repetitionPenalty ?? 1.1;

  return {
    async prompt(text) {
      return await session.prompt(text, {
        temperature,
        topP,
        maxTokens,
        repeatPenalty: { penalty: repeatPenalty },
      });
    },

    async dispose() {
      await context.dispose();
    },
  };
}

/** Legacy compat */
export async function loadModel(modelPath, systemPrompt) {
  return createSession(systemPrompt, {});
}

export async function disposeLlama() {
  if (loadedModel) {
    await loadedModel.dispose();
    loadedModel = null;
    loadedModelPath = null;
  }
  if (llamaInstance) {
    await llamaInstance.dispose();
    llamaInstance = null;
  }
}
