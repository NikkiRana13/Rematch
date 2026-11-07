import "server-only";
import { AnthropicAnalyzer } from "./anthropic";
import { RuleBasedAnalyzer } from "./ruleBased";
import type { ReasoningAnalyzer } from "./types";

export function isAiConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY?.trim());
}

/**
 * Provider selection:
 * - ANTHROPIC_API_KEY set → Anthropic. Failures are stored as "analysis unavailable";
 *   we never silently fall back to another provider's result.
 * - Otherwise → the clearly labelled rule-based analyser.
 */
export function getAnalyzer(): ReasoningAnalyzer {
  if (isAiConfigured()) return new AnthropicAnalyzer();
  return new RuleBasedAnalyzer();
}
