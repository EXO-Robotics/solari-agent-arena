import { afterEach, describe, expect, it } from "vitest";
import { readBoundedJson, validateRemoteRequestBoundary } from "./http-guards.mjs";

const originalHosts = process.env.SOLARI_REMOTE_ALLOWED_HOSTS;
const originalVercelUrl = process.env.VERCEL_URL;
afterEach(() => {
  if (originalHosts === undefined) delete process.env.SOLARI_REMOTE_ALLOWED_HOSTS; else process.env.SOLARI_REMOTE_ALLOWED_HOSTS = originalHosts;
  if (originalVercelUrl === undefined) delete process.env.VERCEL_URL; else process.env.VERCEL_URL = originalVercelUrl;
});

describe("remote HTTP boundary", () => {
  it("accepts only configured host/origin JSON requests", () => {
    process.env.SOLARI_REMOTE_ALLOWED_HOSTS = "arena.example";
    process.env.VERCEL_URL = "preview-arena.vercel.app";
    const request = { headers: { host: "arena.example", origin: "https://arena.example", "content-type": "application/json", "content-length": "12" } };
    expect(validateRemoteRequestBoundary(request)).toBeNull();
    expect(validateRemoteRequestBoundary({ headers: { ...request.headers, host: "evil.example" } })).toMatchObject({ status: 403 });
    expect(validateRemoteRequestBoundary({ headers: { ...request.headers, host: "preview-arena.vercel.app", origin: "https://preview-arena.vercel.app" } })).toBeNull();
    expect(validateRemoteRequestBoundary({ headers: { ...request.headers, origin: "https://evil.example" } })).toMatchObject({ status: 403 });
    expect(validateRemoteRequestBoundary({ headers: { ...request.headers, "content-type": "text/plain" } })).toMatchObject({ status: 415 });
    expect(validateRemoteRequestBoundary({ headers: { ...request.headers, "content-length": "999999" } })).toMatchObject({ status: 413 });
  });

  it("rejects batch and oversized chunked JSON", async () => {
    async function* body(value) { yield Buffer.from(value); }
    await expect(readBoundedJson(body("[]"))).rejects.toThrow(/one JSON object/);
    await expect(readBoundedJson(body(JSON.stringify({ value: "x".repeat(70_000) })))).rejects.toThrow(/too large/);
  });
});
