import { describe, expect, it } from "vitest";
import { canonicalJson } from "./verify";

describe("browser evidence verification", () => {
  it("uses the same recursive key order as the server", () => {
    expect(canonicalJson({ z: 1, a: { y: 2, x: 3 } })).toBe('{"a":{"x":3,"y":2},"z":1}');
  });
});
