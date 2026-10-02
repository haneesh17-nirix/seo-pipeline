import OpenAI from "openai";

// ── LLM Provider ──────────────────────────────────────────────────────────────
// Routes generation to whichever provider is configured, in this order:
//   1. Azure OpenAI   — AZURE_OPENAI_ENDPOINT + AZURE_OPENAI_KEY
//   2. Anthropic      — ANTHROPIC_API_KEY
//   3. Ollama         — local, always available as the last resort
//
// A provider that fails is skipped for the remainder of the run rather than
// retried on every call. This matters: the Azure resource was deleted while its
// variables stayed in .env, and the previous version routed there whenever they
// were merely present, with no fallback — so every generation call failed.
//
// Model quality is the binding constraint on output, not prompt design. Local
// models up to 7B produce copy a strict critic scores around 2.7/5; the same
// chain on a frontier model is the single change that moves it.

const AZURE_ENDPOINT    = process.env.AZURE_OPENAI_ENDPOINT ?? "";
const AZURE_KEY         = process.env.AZURE_OPENAI_KEY ?? "";
const AZURE_DEPLOYMENT  = process.env.AZURE_OPENAI_DEPLOYMENT ?? "gpt-4o-mini";
const AZURE_API_VERSION = process.env.AZURE_OPENAI_API_VERSION ?? "2024-08-01-preview";

const ANTHROPIC_KEY   = process.env.ANTHROPIC_API_KEY ?? "";
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5";

const OLLAMA_HOST  = process.env.OLLAMA_HOST ?? "http://localhost:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? "llama3.2";

function isAzureConfigured(): boolean {
  return !!(AZURE_ENDPOINT && AZURE_KEY);
}

function isAnthropicConfigured(): boolean {
  return !!ANTHROPIC_KEY;
}

/** Anthropic Messages API over fetch — no SDK dependency needed. */
async function callAnthropic(prompt: string, opts: LLMOptions = {}): Promise<string> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": ANTHROPIC_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: opts.model?.startsWith("claude") ? opts.model : ANTHROPIC_MODEL,
      max_tokens: 4096,
      temperature: opts.temperature ?? 0.8,
      // Anthropic has no JSON mode; prefilling an opening brace makes the model
      // continue the object instead of introducing it with prose.
      ...(opts.json ? { stop_sequences: ["\n\n\n"] } : {}),
      messages: [
        { role: "user", content: prompt },
        ...(opts.json ? [{ role: "assistant", content: "{" }] : []),
      ],
    }),
    signal: AbortSignal.timeout(Number(process.env.LLM_TIMEOUT_MS ?? 420000)),
  });

  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${(await res.text()).slice(0, 200)}`);

  const data = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
  const text = data.content?.find((b) => b.type === "text")?.text ?? "";
  // Put back the brace that was prefilled.
  return (opts.json ? `{${text}` : text).trim();
}

async function callAzureOpenAI(prompt: string, opts: LLMOptions = {}): Promise<string> {
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
    temperature: opts.temperature ?? 0.8,
    ...(opts.json ? { response_format: { type: "json_object" as const } } : {}),
  });

  return response.choices[0]?.message?.content?.trim() ?? "";
}

async function callOllama(prompt: string, model: string, opts: LLMOptions = {}): Promise<string> {
  const res = await fetch(`${OLLAMA_HOST}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      prompt,
      stream: false,
      ...(opts.json ? { format: "json" } : {}),
      options: { temperature: opts.temperature ?? 0.8 },
    }),
    // A 7B model emitting a full script as JSON regularly exceeds two minutes
    // on this hardware; the old 120s ceiling aborted mid-generation.
    signal: AbortSignal.timeout(Number(process.env.LLM_TIMEOUT_MS ?? 420000)),
  });
  if (!res.ok) throw new Error(`Ollama ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { response: string };
  return data.response.trim();
}

let azureBroken = false;
let anthropicBroken = false;

export interface LLMOptions {
  /** Ollama model override. Ignored when Azure serves the request. */
  model?: string;
  /** Ask the provider for strict JSON. */
  json?: boolean;
  temperature?: number;
}

export async function callLLM(
  prompt: string,
  modelOrOpts?: string | LLMOptions,
): Promise<string> {
  const opts: LLMOptions =
    typeof modelOrOpts === "string" ? { model: modelOrOpts } : (modelOrOpts ?? {});

  // Azure is tried only while it is actually answering. The endpoint is still
  // configured in .env but the resource was deleted, and the previous version
  // routed there whenever the variables were merely PRESENT — with no fallback
  // on failure — so every generation call failed outright rather than using the
  // local model that was sitting right there.
  if (isAzureConfigured() && !azureBroken) {
    try {
      return await callAzureOpenAI(prompt, opts);
    } catch (err) {
      azureBroken = true;
      const detail = err instanceof Error ? err.message : String(err);
      console.warn(
        `[llm] Azure OpenAI unreachable (${detail.slice(0, 120)}) — falling back to Ollama for the rest of this run.`,
      );
    }
  }

  if (isAnthropicConfigured() && !anthropicBroken) {
    try {
      return await callAnthropic(prompt, opts);
    } catch (err) {
      anthropicBroken = true;
      const detail = err instanceof Error ? err.message : String(err);
      console.warn(
        `[llm] Anthropic unavailable (${detail.slice(0, 120)}) — falling back to Ollama.`,
      );
    }
  }

  return callOllama(prompt, opts.model ?? OLLAMA_MODEL, opts);
}

/**
 * Calls the model and returns parsed JSON, retrying on unparseable output.
 *
 * Small models emit fenced blocks, trailing commas and prose preambles even
 * when told not to. Repairing the common cases here keeps every caller from
 * writing its own defensive parser.
 */
export async function callLLMJson<T = unknown>(
  prompt: string,
  opts: LLMOptions & { attempts?: number } = {},
): Promise<T> {
  const attempts = opts.attempts ?? 3;
  let lastError = "";

  for (let i = 0; i < attempts; i++) {
    const raw = await callLLM(prompt, { ...opts, json: true });
    const cleaned = stripToJson(raw);
    try {
      return JSON.parse(cleaned) as T;
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
  }

  throw new Error(`Model did not return valid JSON after ${attempts} attempts: ${lastError}`);
}

/** Pulls a JSON object out of a response that may be fenced or prefixed. */
function stripToJson(raw: string): string {
  let s = raw.trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) s = fence[1].trim();

  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start !== -1 && end > start) s = s.slice(start, end + 1);

  // Trailing commas before a closing brace or bracket.
  return s.replace(/,(\s*[}\]])/g, "$1");
}

export function llmProvider(): "azure-openai" | "anthropic" | "ollama" {
  if (isAzureConfigured() && !azureBroken) return "azure-openai";
  if (isAnthropicConfigured() && !anthropicBroken) return "anthropic";
  return "ollama";
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
