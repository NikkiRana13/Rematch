import "server-only";
import { isAiConfigured } from "./analysis";
import { anthropicModel, callAnthropicJson } from "./analysis/anthropic";

/** The configured AI JSON caller, or null when AI isn't configured. */
export function aiCaller() {
  return isAiConfigured() ? { call: callAnthropicJson, model: anthropicModel() } : null;
}
