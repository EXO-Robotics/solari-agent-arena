import { describe, expect, it } from "vitest";
import { canonicalJson, finalizeRun, sha256 } from "./evidence.mjs";

describe("authoritative evidence helpers", () => {
  it("canonicalizes object keys recursively", () => {
    expect(canonicalJson({ z: 1, a: { y: 2, x: 3 } })).toBe('{"a":{"x":3,"y":2},"z":1}');
  });

  it("binds every field except the hash itself", () => {
    const run = finalizeRun({ runId: "run-1", metrics: { score: 4 } });
    expect(run.resultHash).toBe(sha256({ runId: "run-1", metrics: { score: 4 } }));
  });
});
