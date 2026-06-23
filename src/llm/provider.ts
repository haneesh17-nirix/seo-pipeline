import OpenAI from "openai";

// ── LLM Provider ──────────────────────────────────────────────────────────────
// Routes generation requests to Azure OpenAI (production) or Ollama (local dev).
// Preference order: Azure OpenAI → Ollama fallback.
// Never use the Anthropic/Claude API — all inference stays on Azure.

const AZURE_ENDPOINT    = process.env.AZURE_OPENAI_ENDPOINT ?? "";
const AZURE_KEY         = process.env.AZURE_OPENAI_KEY ?? "";
const AZURE_DEPLOYMENT  = process.env.AZURE_OPENAI_DEPLOYMENT ?? "gpt-4o-mini";
const AZURE_API_VERSION = process.env.AZURE_OPENAI_API_VERSION ?? "2024-08-01-preview";

const OLLAMA_HOST  = process.env.OLLAMA_HOST ?? "http://localhost:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? "llama3.2";

function isAzureConfigured(): boolean {
  return !!(AZURE_ENDPOINT && AZURE_KEY);
}

async function callAzureOpenAI(prompt: string): Promise<string> {
  const client = new OpenAI({
    apiKey: AZURE_KEY,
    baseURL: `${AZURE_ENDPOINT}/openai/deployments/${AZURE_DEPLOYMENT}`,
    defaultQuery: { "api-version": AZURE_API_VERSION },
    defaultHeaders: { "api-key": AZURE_KEY },
  });

  const response = await client.chat.completions.create({
    model: AZURE_DEPLOYMENT,
    messages: [{ role: "user", content: prompt }],
    max_tokens: 2048,
    temperature: 0.8,
  });

  return response.choices[0]?.message?.content?.trim() ?? "";
}

async function callOllama(prompt: string, model: string): Promise<string> {
  const res = await fetch(`${OLLAMA_HOST}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, prompt, stream: false }),
    signal: AbortSignal.timeout(120000),
  });
  if (!res.ok) throw new Error(`Ollama ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { response: string };
  return data.response.trim();
}

export async function callLLM(prompt: string, model?: string): Promise<string> {
  if (isAzureConfigured()) {
    return callAzureOpenAI(prompt);
  }
  return callOllama(prompt, model ?? OLLAMA_MODEL);
}

export function llmProvider(): "azure-openai" | "ollama" {
  return isAzureConfigured() ? "azure-openai" : "ollama";
}

export async function checkLLM(): Promise<boolean> {
  if (isAzureConfigured()) {
    try {
      await callAzureOpenAI("ping");
      return true;
    } catch { return false; }
  }
  try {
    const res = await fetch(`${OLLAMA_HOST}/api/tags`);
    return res.ok;
  } catch { return false; }
}
