import { describe, expect, it } from "vitest";
import { siteArea } from "./ThemeShell";

describe("siteArea", () => {
  it("maps routes to the start page, student side, or teacher side", () => {
    expect(siteArea("/")).toBe("start");
    for (const p of ["/join", "/me", "/play/abc", "/play/abc/results", "/roadmap", "/roadmap/p/practice/o"]) expect(siteArea(p)).toBe("student");
    for (const p of ["/host", "/host/plans/1", "/host/overview", "/host/competitions/new"]) expect(siteArea(p)).toBe("teacher");
    expect(siteArea("/membership")).toBe("teacher"); // prefix match is per path segment
  });
});
