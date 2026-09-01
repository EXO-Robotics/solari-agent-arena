import { describe, expect, it } from "vitest";
import { BUILT_IN_COURSE_IDS, resolveArenaUrl } from "./arena-url.mjs";

describe("MCP arena URL boundary", () => {
  it("normalizes the configured arena origin", () => {
    expect(resolveArenaUrl(undefined, "https://arena.example/?x=1")).toBe("https://arena.example/?agent=1");
    expect(resolveArenaUrl("https://arena.example/?seed=5", "https://arena.example/")).toBe("https://arena.example/?agent=1");
  });

  it("carries only an explicitly selected built-in course", () => {
    expect(resolveArenaUrl("https://arena.example/?course=attacker-route", "https://arena.example/", "practice-first-steps-v1"))
      .toBe("https://arena.example/?agent=1&course=practice-first-steps-v1");
    expect(() => resolveArenaUrl(undefined, "https://arena.example/", "local-import-v1")).toThrow(/allow-listed/);
    expect(BUILT_IN_COURSE_IDS).toHaveLength(3);
  });
  it.each(["https://attacker.example/", "https://user:pass@arena.example/", "https://arena.example/other"])("rejects an out-of-bound target", (value) => {
    expect(() => resolveArenaUrl(value, "https://arena.example/")).toThrow(/origin|uncredentialed|path/);
  });
});
