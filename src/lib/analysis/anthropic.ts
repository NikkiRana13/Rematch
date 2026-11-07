import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { AnalysisInput, AnalysisOutcome, ReasoningAnalyzer } from "./types";
import { buildClassifierSystemPrompt, buildClassifierUserMessage, CLASSIFY_PROMPT_VERSION } from "./prompt";
import { classificationJsonSchema, validateClassification } from "./validate";

export const DEFAULT_ANTHROPIC_MODEL = "claude-opus-5-5";

/** Models that accept the server-side `fallbacks: "default"` refusal fallback on the Claude API. */
const FALLBACK_MODELS = new Set(["claude-opus-5-5", "claude-opus-5", "claude-fable-5-1", "claude-sonnet-5-5"]);

export function anthropicModel(): string {
  return process.env.ANTHROPIC_MODEL?.trim() || DEFAULT_ANTHROPIC_MODEL;
}

type Effort = "low" | "medium" | "high" | "xhigh" | "max";
function effort(): Effort {
  const e = process.env.ANTHROPIC_EFFORT?.trim();
  return e === "medium" || e === "high" || e === "xhigh" || e === "max" ? e : "low";
}

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!client) client = new Anthropic({ timeout: 45_000, maxRetries: 1 });
  return client;
}

/**
 * Sends a JSON-schema-constrained request and returns the parsed JSON object, or an error code.
 * Never throws: API failures are reported, not hidden or replaced.
 */
export async function callAnthropicJson(opts: {
  system: string;
  user: string;
  schema: Record<string, unknown>;
  maxTokens?: number;
}): Promise<{ ok: true; json: unknown } | { ok: false; errorCode: string }> {
  const model = anthropicModel();
  const useFallbacks = FALLBACK_MODELS.has(model) && process.env.ANTHROPIC_FALLBACKS !== "off";
  try {
    const response = await getClient().beta.messages.create({
      model,
      max_tokens: opts.maxTokens ?? 4000,
      system: opts.system,
      messages: [{ role: "user", content: opts.user }],
      output_config: { effort: effort(), format: { type: "json_schema", schema: opts.schema } },
      ...(useFallbacks ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
    });
    if (response.stop_reason === "refusal") return { ok: false, errorCode: "model_refusal" };
    if (response.stop_reason === "max_tokens") return { ok: false, errorCode: "max_tokens" };
    const text = response.content
      .filter((b): b is Extract<typeof b, { type: "text" }> => b.type === "text")
      .map((b) => b.text)
      .join("");
    try {
      return { ok: true, json: JSON.parse(text) };
    } catch {
      return { ok: false, errorCode: "invalid_json" };
    }
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) return { ok: false, errorCode: "api_auth_error" };
    if (err instanceof Anthropic.RateLimitError) return { ok: false, errorCode: "api_rate_limited" };
    if (err instanceof Anthropic.BadRequestError) return { ok: false, errorCode: "api_bad_request" };
    if (err instanceof Anthropic.APIConnectionTimeoutError) return { ok: false, errorCode: "api_timeout" };
    if (err instanceof Anthropic.APIConnectionError) return { ok: false, errorCode: "api_connection_error" };
    if (err instanceof Anthropic.APIError) return { ok: false, errorCode: `api_error_${err.status ?? "unknown"}` };
    return { ok: false, errorCode: "api_unknown_error" };
  }
}

export class AnthropicAnalyzer implements ReasoningAnalyzer {
  readonly provider = "anthropic";
  readonly promptVersion = CLASSIFY_PROMPT_VERSION;
  get model() {
    return anthropicModel();
  }

  async analyze(input: AnalysisInput): Promise<AnalysisOutcome> {
    const res = await callAnthropicJson({
      system: buildClassifierSystemPrompt(input),
      user: buildClassifierUserMessage(input),
      schema: classificationJsonSchema(input.subject),
    });
    if (!res.ok) return { status: "unavailable", errorCode: res.errorCode };
    const v = validateClassification(res.json, input.subject, input.studentText);
    if (!v.ok) return { status: "unavailable", errorCode: v.errorCode };
    return { status: "completed", value: v.value };
  }
}
