import { describe, expect, it } from "vitest";
import { FIXTURES } from "./fixtures";
import { fixtureToInput } from "./fixtureInput";
import { RuleBasedAnalyzer } from "./ruleBased";
import { isSpecificCategory } from "../content/taxonomy";
import { quoteOccursIn } from "./validate";

describe("rule-based analyser on labelled fixtures", () => {
  it("produces only validated output and reports its accuracy honestly", async () => {
    const analyzer = new RuleBasedAnalyzer();
    let correct = 0;
    const misses: string[] = [];
    for (const f of FIXTURES) {
      const out = await analyzer.analyze(fixtureToInput(f));
      expect(out.status, f.id).toBe("completed");
      if (out.status !== "completed") continue;
      if (out.value.evidenceQuote) expect(quoteOccursIn(out.value.evidenceQuote, f.reasoning)).toBe(true);
      const ok = out.value.category === f.expected || (f.acceptable ?? []).includes(out.value.category);
      if (ok) correct++;
      else misses.push(`${f.id}: expected ${f.expected}, got ${out.value.category}`);
    }
    // Printed, not asserted against a target: this is a transparent heuristic baseline.
    console.info(`[rule-based] ${correct}/${FIXTURES.length} fixtures matched.\n  ${misses.join("\n  ")}`);
    expect(correct).toBeGreaterThan(0);
  });

  it("never gives a specific diagnosis to instruction-only, empty, or guess responses", async () => {
    const analyzer = new RuleBasedAnalyzer();
    for (const f of FIXTURES.filter((x) => x.tags.includes("guess") || x.tags.includes("absent") || x.id.endsWith("injection-only") || x.id === "r-injection")) {
      const out = await analyzer.analyze(fixtureToInput(f));
      expect(out.status === "completed" && isSpecificCategory(out.value.category), f.id).toBe(false);
    }
  });
});
