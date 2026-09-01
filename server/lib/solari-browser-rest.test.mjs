import { afterEach, describe, expect, it, vi } from "vitest";
import { releaseSolariBrowserSession } from "./solari-browser-rest.mjs";

const originalFetch = globalThis.fetch;
const originalKey = process.env.SOLARI_API_KEY;

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalKey === undefined) delete process.env.SOLARI_API_KEY;
  else process.env.SOLARI_API_KEY = originalKey;
});

describe("Solari Browser release", () => {
  it("accepts a successful or legacy bare-404 idempotent release", async () => {
    process.env.SOLARI_API_KEY = "test-key";
    globalThis.fetch = vi.fn(async () => new Response(null, { status: 204 }));
    await expect(releaseSolariBrowserSession("provider-session-123")).resolves.toBe(true);
    globalThis.fetch = vi.fn(async () => new Response("", { status: 404 }));
    await expect(releaseSolariBrowserSession("provider-session-123")).resolves.toBe(true);
  });

  it("does not misreport an explicit InvalidSessionId rejection as released", async () => {
    process.env.SOLARI_API_KEY = "test-key";
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ code: "InvalidSessionId" }), { status: 404 }));
    await expect(releaseSolariBrowserSession("provider-session-123")).rejects.toThrow("release was not accepted");
  });
});
