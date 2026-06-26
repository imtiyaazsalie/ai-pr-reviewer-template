const axios = require("axios");

const MAX_RETRIES = 3;
const INITIAL_DELAY = 1000;
const TIMEOUT = 30000;

const PROVIDER_DEFAULTS = {
  deepseek: {
    url: "https://api.deepseek.com/v1/chat/completions",
    model: "deepseek-chat",
    format: "openai",
  },
  openai: {
    url: "https://api.openai.com/v1/chat/completions",
    model: "gpt-4o-mini",
    format: "openai",
  },
  groq: {
    url: "https://api.groq.com/openai/v1/chat/completions",
    model: "llama-3.1-8b-instant",
    format: "openai",
  },
  anthropic: {
    url: "https://api.anthropic.com/v1/messages",
    model: "claude-3-5-haiku-latest",
    format: "anthropic",
  },
  ollama: {
    url: "http://localhost:11434/v1/chat/completions",
    model: "llama3.1",
    format: "openai",
  },
};

function resolveConfig() {
  const provider = process.env.AI_PROVIDER || "deepseek";
  const apiKey = process.env.AI_API_KEY || process.env.DEEPSEEK_API_KEY;
  const model = process.env.AI_MODEL;
  const baseUrl = process.env.AI_BASE_URL;

  const defaults = PROVIDER_DEFAULTS[provider] || PROVIDER_DEFAULTS.deepseek;

  return {
    provider,
    apiKey,
    model: model || defaults.model,
    url: baseUrl || defaults.url,
    format: defaults.format,
  };
}

function buildOpenAIRequest({ messages, temperature }, config) {
  return {
    url: config.url,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    data: {
      model: config.model,
      messages,
      temperature,
      max_tokens: 1500,
    },
  };
}

function buildAnthropicRequest({ messages, temperature }, config) {
  // Anthropic uses a separate "system" field instead of system role in messages
  const systemMessages = messages.filter((m) => m.role === "system");
  const nonSystem = messages.filter((m) => m.role !== "system");
  const system = systemMessages.map((m) => m.content).join("\n\n") || undefined;

  return {
    url: config.url,
    headers: {
      "Content-Type": "application/json",
      "x-api-key": config.apiKey,
      "anthropic-version": "2023-06-01",
    },
    data: {
      model: config.model,
      max_tokens: 1500,
      temperature,
      messages: nonSystem,
      ...(system ? { system } : {}),
    },
  };
}

function buildRequest(params, config) {
  if (config.format === "anthropic") {
    return buildAnthropicRequest(params, config);
  }
  return buildOpenAIRequest(params, config);
}

function extractResponse(response, config) {
  if (config.format === "anthropic") {
    return response.data.content?.[0]?.text || "";
  }
  return response.data.choices?.[0]?.message?.content || "";
}

async function callLLM(messages, temperature = 0.2) {
  const config = resolveConfig();

  if (!config.apiKey && config.provider !== "ollama") {
    throw new Error(
      `AI_API_KEY not set. Provide it via the ai_api_key or deepseek_api_key input.`,
    );
  }

  let attempt = 0;
  let delay = INITIAL_DELAY;

  while (attempt < MAX_RETRIES) {
    try {
      const request = buildRequest({ messages, temperature }, config);
      const response = await axios.post(request.url, request.data, {
        headers: request.headers,
        timeout: TIMEOUT,
      });
      return extractResponse(response, config);
    } catch (error) {
      attempt++;
      if (attempt === MAX_RETRIES) throw error;
      const isRetryable =
        error.response?.status === 429 || error.response?.status >= 500;
      if (!isRetryable) throw error;
      console.warn(`Attempt ${attempt} failed. Retrying in ${delay}ms...`);
      await new Promise((resolve) => setTimeout(resolve, delay));
      delay *= 2;
    }
  }
}

module.exports = { callLLM };
