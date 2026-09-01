import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getRemoteCourse, listRemoteCourseIds, remoteCourseHash } from "./remote-courses.mjs";

describe("remote course registry", () => {
  it("serves only the shared built-in manifests", () => {
    expect(listRemoteCourseIds()).toEqual(["arena-slalom-ramp-v1", "practice-first-steps-v1", "practice-east-sprint-v1"]);
    expect(() => getRemoteCourse("imported-route")).toThrow(/Unknown/);
  });

  it("keeps the official shared manifest identical to the frozen evaluator course", () => {
    const official = JSON.parse(readFileSync(new URL("../../src/agent/course.json", import.meta.url), "utf8"));
    expect(getRemoteCourse("arena-slalom-ramp-v1").course).toEqual(official);
    expect(remoteCourseHash(official)).toMatch(/^[a-f0-9]{64}$/);
  });
});
