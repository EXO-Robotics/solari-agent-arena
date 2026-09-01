import { afterEach, describe, expect, it } from "vitest";
import handler from "./arena-command.mjs";

const originalEnabled = process.env.SOLARI_REMOTE_ENABLED;
const originalHosts = process.env.SOLARI_REMOTE_ALLOWED_HOSTS;

afterEach(() => {
  if (originalEnabled === undefined) delete process.env.SOLARI_REMOTE_ENABLED; else process.env.SOLARI_REMOTE_ENABLED = originalEnabled;
  if (originalHosts === undefined) delete process.env.SOLARI_REMOTE_ALLOWED_HOSTS; else process.env.SOLARI_REMOTE_ALLOWED_HOSTS = originalHosts;
});

function request(method, body = {}) {
  const text = JSON.stringify(body);
  return {
    method,
    headers: { host: "arena.example", origin: "https://arena.example", "content-type": "application/json", "content-length": String(Buffer.byteLength(text)) },
    async *[Symbol.asyncIterator]() { yield Buffer.from(text); },
  };
}

function response() {
  const headers = {};
  return {
    statusCode: 0,
    headers,
    body: "",
    setHeader(key, value) { headers[key] = value; },
    end(value) { this.body = value; },
  };
}

describe("Arena HTTP command API", () => {
  it("rejects unknown command shapes before touching Solari", async () => {
    process.env.SOLARI_REMOTE_ALLOWED_HOSTS = "arena.example";
    const output = response();
    await handler(request("POST", { schemaVersion: "solari.arena.http-command.v1", operation: "connect", ticket: "short" }), output);
    expect(output.statusCode).toBe(400);
    expect(JSON.parse(output.body)).toEqual({ error: "Invalid Arena HTTP command." });
  });

  it("fails closed while hosted practice is disabled", async () => {
    process.env.SOLARI_REMOTE_ALLOWED_HOSTS = "arena.example";
    process.env.SOLARI_REMOTE_ENABLED = "false";
    const output = response();
    await handler(request("POST", { schemaVersion: "solari.arena.http-command.v1", operation: "connect", ticket: `saa1.${"a".repeat(48)}` }), output);
    expect(output.statusCode).toBe(503);
    expect(JSON.parse(output.body)).toEqual({ error: "Hosted Agent Practice is paused on this deployment." });
  });

  it("allows only POST", async () => {
    const output = response();
    await handler(request("GET"), output);
    expect(output.statusCode).toBe(405);
    expect(output.headers.allow).toBe("POST");
  });
});
