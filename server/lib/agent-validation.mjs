import course from "../../src/agent/course.json" with { type: "json" };

export const MAX_AGENT_REQUEST_BYTES = 32_000;

export function validateAgentEvaluationRequest(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("Request body must be an object.");
  const transcript = body.transcript;
  if (!transcript || typeof transcript !== "object" || Array.isArray(transcript)) throw new Error("Transcript must be an object.");
  if (transcript.schemaVersion !== "solari.arena.agent-transcript.v1") throw new Error("Unsupported transcript schema version.");
  if (transcript.courseId !== course.courseId) throw new Error("Transcript course does not match the frozen benchmark course.");
  const seed = Number(transcript.seed);
  if (!Number.isSafeInteger(seed) || seed < 0 || seed > 0xffff_ffff) throw new Error("Transcript seed must be a uint32 integer.");
  if (!Array.isArray(transcript.actions) || transcript.actions.length > course.maxActions) throw new Error(`Transcript must contain at most ${course.maxActions} actions.`);
  let commandedMs = 0;
  const actions = transcript.actions.map((action, index) => {
    if (!action || typeof action !== "object" || Array.isArray(action)) throw new Error(`Action ${index} must be an object.`);
    const keys = Object.keys(action).sort().join(",");
    if (keys !== "drive,durationMs,sequence,turn") throw new Error(`Action ${index} contains unsupported fields.`);
    if (action.sequence !== index) throw new Error(`Action ${index} has a non-canonical sequence.`);
    const { drive, turn, durationMs } = action;
    if (![drive, turn, durationMs].every(Number.isFinite)) throw new Error(`Action ${index} must contain finite numbers.`);
    if (Math.abs(drive) > course.maxDrive) throw new Error(`Action ${index} drive exceeds the course limit.`);
    if (Math.abs(turn) > course.maxTurn) throw new Error(`Action ${index} turn exceeds the course limit.`);
    if (!Number.isInteger(durationMs) || durationMs < 100 || durationMs > course.maxActionDurationMs) throw new Error(`Action ${index} duration is outside the course limit.`);
    commandedMs += durationMs;
    return { sequence: index, drive, turn, durationMs };
  });
  if (commandedMs > course.maxSeconds * 1_000) throw new Error("Transcript exceeds the simulated-time limit.");
  return {
    transcript: {
      schemaVersion: transcript.schemaVersion,
      courseId: transcript.courseId,
      seed,
      actions,
    },
    agentLabel: typeof body.agentLabel === "string" ? body.agentLabel.trim().slice(0, 80) : "unreported-agent",
    commandedMs,
  };
}
