import { describe, expect, it } from "vitest";
import { MAX_CONTROLLER_BYTES, validateControllerSource } from "./validation";

describe("validateControllerSource", () => {
  it("accepts a bounded controller", () => {
    expect(validateControllerSource("function control(robot, dt) { return { drive: 1 }; }")).toMatchObject({ valid: true });
  });

  it("rejects host capabilities", () => {
    expect(validateControllerSource("function control() { process.exit(1); }")).toMatchObject({
      valid: false,
      capability: "Node.js host access",
    });
  });

  it("rejects oversized source", () => {
    const source = `function control(){return {}}/*${"x".repeat(MAX_CONTROLLER_BYTES)}*/`;
    expect(validateControllerSource(source).valid).toBe(false);
  });
});
