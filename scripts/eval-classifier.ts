/**
 * Optional classifier evaluation against hand-labelled fixtures.
 *
 *   npm run eval              # Anthropic provider (requires ANTHROPIC_API_KEY; makes real, billed API calls)
 *   npm run eval -- --rules   # rule-based baseline (no network)
 *
 * Reports what actually happened. API failures are counted separately from completed
 * classifications and are never scored as correct or incorrect.
 */
import { FIXTURES } from "../src/lib/analysis/fixtures";
import { fixtureToInput } from "../src/lib/analysis/fixtureInput";
import { RuleBasedAnalyzer } from "../src/lib/analysis/ruleBased";
import { isSpecificCategory } from "../src/lib/content/taxonomy";
import type { ReasoningAnalyzer } from "../src/lib/analysis/types";

async function main() {
  const useRules = process.argv.includes("--rules");
  let analyzer: ReasoningAnalyzer;
  if (useRules) analyzer = new RuleBasedAnalyzer();
  else {
    if (!process.env.ANTHROPIC_API_KEY) {
      console.error("ANTHROPIC_API_KEY is not set. Use --rules for the offline baseline.");
      process.exit(1);
    }
    const { AnthropicAnalyzer } = await import("../src/lib/analysis/anthropic");
    analyzer = new AnthropicAnalyzer();
  }
  console.log(`Provider: ${analyzer.provider}${analyzer.model ? ` (${analyzer.model})` : ""}, prompt ${analyzer.promptVersion}`);
  console.log(`Fixtures: ${FIXTURES.length}\n`);

  let completed = 0;
  let correct = 0;
  const unavailable: Record<string, number> = {};
  let insufficientCases = 0;
  let insufficientGivenSpecific = 0;
  let quotesReturned = 0;
  const rows: string[] = [];

  for (const f of FIXTURES) {
    const out = await analyzer.analyze(fixtureToInput(f));
    if (f.expected === "INSUFFICIENT_EVIDENCE") insufficientCases++;
    if (out.status === "unavailable") {
      unavailable[out.errorCode] = (unavailable[out.errorCode] ?? 0) + 1;
      rows.push(`  ${f.id.padEnd(20)} UNAVAILABLE (${out.errorCode})`);
      continue;
    }
    completed++;
    const got = out.value.category;
    const ok = got === f.expected || (f.acceptable ?? []).includes(got);
    if (ok) correct++;
    if (out.value.evidenceQuote) quotesReturned++;
    if (f.expected === "INSUFFICIENT_EVIDENCE" && isSpecificCategory(got)) insufficientGivenSpecific++;
    rows.push(`  ${f.id.padEnd(20)} ${ok ? "✓" : "✗"} expected ${f.expected}${ok ? "" : `, got ${got}`}`);
  }

  const quoteFailures = unavailable["evidence_quote_not_in_reasoning"] ?? 0;
  const apiFailures = Object.entries(unavailable)
    .filter(([k]) => k.startsWith("api_") || k === "model_refusal" || k === "max_tokens" || k === "invalid_json")
    .reduce((s, [, v]) => s + v, 0);
  const validationFailures = Object.values(unavailable).reduce((s, v) => s + v, 0) - apiFailures;

  console.log(rows.join("\n"));
  console.log("\nSummary");
  console.log(`  Completed classifications: ${completed} of ${FIXTURES.length}`);
  console.log(`  Accuracy on completed (primary or acceptable label): ${correct} of ${completed}${completed ? ` (${Math.round((100 * correct) / completed)}%)` : ""}`);
  console.log(`  Insufficient-evidence fixtures given a specific diagnosis: ${insufficientGivenSpecific} of ${insufficientCases}`);
  console.log(`  Supporting quotes: ${quotesReturned} valid quotes returned; ${quoteFailures} outputs rejected because the quote was not in the student's text`);
  console.log(`  API failures (excluded from accuracy): ${apiFailures}`);
  console.log(`  Other validation failures (excluded from accuracy): ${validationFailures}`);
  if (Object.keys(unavailable).length) console.log(`  Unavailable by error code: ${JSON.stringify(unavailable)}`);
  console.log("\nNote: fixtures are developer-written examples, not real student data; results do not establish classroom validity.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
