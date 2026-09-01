import { describe, expect, it } from "vitest";
import { resolveArenaUrl } from "./arena-url.mjs";

describe("MCP arena URL boundary", () => {
  it("normalizes the configured arena origin", () => {
    expect(resolveArenaUrl(undefined, "https://arena.example/?x=1")).toBe("https://arena.example/?agent=1");
    expect(resolveArenaUrl("https://arena.example/?seed=5", "https://arena.example/")).toBe("https://arena.example/?agent=1");
  });
  it.each(["https://attacker.example/", "https://user:pass@arena.example/", "https://arena.example/other"])("rejects an out-of-bound target", (value) => {
    expect(() => resolveArenaUrl(value, "https://arena.example/")).toThrow(/origin|uncredentialed|path/);
  });
});
