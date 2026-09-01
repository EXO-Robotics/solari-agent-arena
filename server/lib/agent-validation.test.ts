import { describe, expect, it } from "vitest";
import { validateAgentEvaluationRequest } from "./agent-validation.mjs";

const valid = {
  transcript: {
    schemaVersion: "solari.arena.agent-transcript.v1",
    courseId: "arena-slalom-ramp-v1",
    seed: 42,
    actions: [{ sequence: 0, drive: 1.2, turn: 0, durationMs: 800 }],
  },
};

describe("agent transcript request validation", () => {
  it("accepts and canonicalizes a bounded transcript", () => {
    expect(validateAgentEvaluationRequest(valid)).toMatchObject({ commandedMs: 800, transcript: { seed: 42 } });
  });

  it.each([
    [{ ...valid, transcript: { ...valid.transcript, courseId: "other" } }, /course/],
    [{ ...valid, transcript: { ...valid.transcript, actions: [{ sequence: 2, drive: 1, turn: 0, durationMs: 500 }] } }, /sequence/],
    [{ ...valid, transcript: { ...valid.transcript, actions: [{ sequence: 0, drive: 99, turn: 0, durationMs: 500 }] } }, /drive/],
    [{ ...valid, transcript: { ...valid.transcript, actions: [{ sequence: 0, drive: 1, turn: 0, durationMs: 99 }] } }, /duration/],
    [{ ...valid, transcript: { ...valid.transcript, actions: [{ sequence: 0, drive: 1, turn: 0, durationMs: 500, extra: true }] } }, /unsupported/],
  ])("rejects non-canonical or out-of-bounds input", (input, pattern) => {
    expect(() => validateAgentEvaluationRequest(input)).toThrow(pattern);
  });
});
