import { afterEach, describe, expect, it } from "vitest";
import handler from "../../api/arena-expire.mjs";

const originalHosts = process.env.SOLARI_REMOTE_ALLOWED_HOSTS;
const originalToken = process.env.SOLARI_REMOTE_OWNER_TOKEN;
const originalEvaluationEnabled = process.env.SOLARI_EVALUATION_ENABLED;
const originalEvaluationToken = process.env.SOLARI_EVALUATION_TOKEN;

afterEach(() => {
  if (originalHosts === undefined) delete process.env.SOLARI_REMOTE_ALLOWED_HOSTS; else process.env.SOLARI_REMOTE_ALLOWED_HOSTS = originalHosts;
  if (originalToken === undefined) delete process.env.SOLARI_REMOTE_OWNER_TOKEN; else process.env.SOLARI_REMOTE_OWNER_TOKEN = originalToken;
  if (originalEvaluationEnabled === undefined) delete process.env.SOLARI_EVALUATION_ENABLED; else process.env.SOLARI_EVALUATION_ENABLED = originalEvaluationEnabled;
  if (originalEvaluationToken === undefined) delete process.env.SOLARI_EVALUATION_TOKEN; else process.env.SOLARI_EVALUATION_TOKEN = originalEvaluationToken;
});

function request(body, authorization) {
  const text = JSON.stringify(body);
  return {
    method: "POST",
    headers: {
      host: "arena.example",
      "content-type": "application/json",
      "content-length": String(Buffer.byteLength(text)),
      ...(authorization ? { authorization } : {}),
    },
    async *[Symbol.asyncIterator]() { yield Buffer.from(text); },
  };
}

function response() {
  return {
    statusCode: 0,
    headers: {},
    body: "",
    setHeader(key, value) { this.headers[key] = value; },
    end(value) { this.body = value; },
  };
}

describe("Arena expiry HTTP API owner boundary", () => {
  it("does not let an invalid bearer request fall through to signed cleanup", async () => {
    process.env.SOLARI_REMOTE_ALLOWED_HOSTS = "arena.example";
    process.env.SOLARI_REMOTE_OWNER_TOKEN = "a".repeat(48);
    const output = response();
    await handler(request({}, `Bearer ${"b".repeat(48)}`), output);
    expect(output.statusCode).toBe(401);
    expect(JSON.parse(output.body)).toEqual({ error: "Invalid owner authorization." });
  });

  it("rejects malformed reset input after owner authentication and before Redis", async () => {
    process.env.SOLARI_REMOTE_ALLOWED_HOSTS = "arena.example";
    process.env.SOLARI_REMOTE_OWNER_TOKEN = "a".repeat(48);
    const output = response();
    await handler(request({ operation: "reset" }, `Bearer ${"a".repeat(48)}`), output);
    expect(output.statusCode).toBe(400);
    expect(JSON.parse(output.body)).toEqual({ error: "Invalid owner reset request." });
  });

  it("does not accept the evaluation token as owner authorization when evaluation is enabled", async () => {
    process.env.SOLARI_REMOTE_ALLOWED_HOSTS = "arena.example";
    delete process.env.SOLARI_REMOTE_OWNER_TOKEN;
    process.env.SOLARI_EVALUATION_ENABLED = "true";
    process.env.SOLARI_EVALUATION_TOKEN = "e".repeat(48);
    const output = response();
    await handler(request({ operation: "reset" }, `Bearer ${"e".repeat(48)}`), output);
    expect(output.statusCode).toBe(401);
    expect(JSON.parse(output.body)).toEqual({ error: "Invalid owner authorization." });
  });

  it("preserves the signed-cleanup boundary when no owner bearer is present", async () => {
    process.env.SOLARI_REMOTE_ALLOWED_HOSTS = "arena.example";
    const output = response();
    await handler(request({}), output);
    expect(output.statusCode).toBe(401);
    expect(JSON.parse(output.body)).toEqual({ error: "Invalid cleanup signature." });
  });
});
