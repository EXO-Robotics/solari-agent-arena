import { describe, expect, it } from "vitest";
import { validateEvaluationRequest } from "./request-validation.mjs";

describe("evaluation request validation", () => {
  it("accepts a controller and uint32 seed", () => {
    expect(validateEvaluationRequest({ controller: "function control(){return {}}", seed: 42 })).toMatchObject({ seed: 42 });
  });

  it("does not execute or reject capability probes at the host boundary", () => {
    expect(validateEvaluationRequest({ controller: "function control(){process.exit(1)}", seed: 1 }).controller).toContain("process.exit");
  });

  it("rejects invalid seeds", () => {
    expect(() => validateEvaluationRequest({ controller: "function control(){return {}}", seed: -1 })).toThrow(/Seed/);
  });
});
