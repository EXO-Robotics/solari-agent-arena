import { afterEach, describe, expect, it, vi } from "vitest";
import { registerAgentSiteTools } from "./webmcp";

afterEach(() => { Reflect.deleteProperty(globalThis, "document"); });

describe("WebMCP site tools", () => {
  it("registers the exact bounded tool surface and delegates to arena callbacks", async () => {
    const tools = new Map<string, { name: string; execute(input: Record<string, unknown>): Promise<unknown>; inputSchema: Record<string, unknown> }>();
    Object.defineProperty(globalThis, "document", { configurable: true, value: { modelContext: { registerTool: async (tool: { name: string; execute(input: Record<string, unknown>): Promise<unknown>; inputSchema: Record<string, unknown> }) => { tools.set(tool.name, tool); } } } });
    const callbacks = {
      reset: vi.fn((seed: number) => ({ seed })), observe: vi.fn(() => ({ time: 0 })),
      act: vi.fn(async (input: { drive: number; turn: number; durationMs: number }) => input), transcript: vi.fn(() => ({ actions: [] })),
    };
    expect(await registerAgentSiteTools(callbacks as never)).toBe(true);
    expect([...tools.keys()].sort()).toEqual(["arena_act", "arena_observe", "arena_reset", "arena_transcript"]);
    await tools.get("arena_reset")?.execute({ seed: 7 });
    await tools.get("arena_observe")?.execute({});
    await tools.get("arena_act")?.execute({ drive: 1.2, turn: -0.3, durationMs: 500 });
    await tools.get("arena_transcript")?.execute({});
    expect(callbacks.reset).toHaveBeenCalledWith(7);
    expect(callbacks.observe).toHaveBeenCalledOnce();
    expect(callbacks.act).toHaveBeenCalledWith({ drive: 1.2, turn: -0.3, durationMs: 500 });
    expect(callbacks.transcript).toHaveBeenCalledOnce();
  });

  it("stays optional in browsers without WebMCP", async () => {
    Object.defineProperty(globalThis, "document", { configurable: true, value: {} });
    expect(await registerAgentSiteTools({} as never)).toBe(false);
  });
});
