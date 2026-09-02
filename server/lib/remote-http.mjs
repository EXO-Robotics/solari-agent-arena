import {
  actPractice, connectPractice, disconnectPractice, finishPractice, observePractice, remoteFailureDiagnostic, sanitizeRemoteError,
} from "./remote-arena.mjs";

export const REMOTE_HTTP_SCHEMA_VERSION = "solari.arena.http-command.v1";
export const REMOTE_HTTP_RESPONSE_VERSION = "solari.arena.http-command-response.v1";
export const REMOTE_HTTP_OPERATIONS = Object.freeze(["connect", "observe", "act", "finish", "disconnect"]);

const SHAPES = Object.freeze({
  connect: ["schemaVersion", "operation", "ticket"],
  observe: ["schemaVersion", "operation", "arenaSession"],
  act: ["schemaVersion", "operation", "arenaSession", "expectedSequence", "drive", "turn", "durationMs"],
  finish: ["schemaVersion", "operation", "arenaSession"],
  disconnect: ["schemaVersion", "operation", "arenaSession"],
});

function exactKeys(value, expected) {
  const keys = Object.keys(value).sort();
  return keys.length === expected.length && keys.every((key, index) => key === [...expected].sort()[index]);
}

function capability(value) {
  return typeof value === "string" && value.length >= 20 && value.length <= 8_192;
}

export function validateRemoteHttpCommand(value) {
  if (!value || typeof value !== "object" || Array.isArray(value) || value.schemaVersion !== REMOTE_HTTP_SCHEMA_VERSION || !REMOTE_HTTP_OPERATIONS.includes(value.operation)) throw new Error("Invalid Arena HTTP command.");
  const expected = SHAPES[value.operation];
  if (!exactKeys(value, expected)) throw new Error("Invalid Arena HTTP command.");
  if (value.operation === "connect" && !capability(value.ticket)) throw new Error("Invalid Arena HTTP command.");
  if (value.operation !== "connect" && !capability(value.arenaSession)) throw new Error("Invalid Arena HTTP command.");
  if (value.operation === "act") {
    if (!Number.isInteger(value.expectedSequence) || value.expectedSequence < 0 || value.expectedSequence > 10_000) throw new Error("Invalid Arena HTTP command.");
    if (![value.drive, value.turn, value.durationMs].every(Number.isFinite)) throw new Error("Invalid Arena HTTP command.");
    if (Math.abs(value.drive) > 1.6 || Math.abs(value.turn) > 1.4 || !Number.isInteger(value.durationMs) || value.durationMs < 100 || value.durationMs > 2_000) throw new Error("Invalid Arena HTTP command.");
  }
  return Object.freeze({ ...value });
}

function publicResult(operation, value) {
  const response = { ...value };
  const image = response.image;
  delete response.image;
  return {
    schemaVersion: REMOTE_HTTP_RESPONSE_VERSION,
    operation,
    ...response,
    ...(image ? { image: { mimeType: "image/png", base64: Buffer.from(image).toString("base64") } } : {}),
  };
}

export async function executeRemoteHttpCommand(command) {
  const input = validateRemoteHttpCommand(command);
  let value;
  if (input.operation === "connect") value = await connectPractice(input.ticket);
  else if (input.operation === "observe") value = await observePractice(input.arenaSession);
  else if (input.operation === "act") value = await actPractice(input.arenaSession, input);
  else if (input.operation === "finish") value = await finishPractice(input.arenaSession);
  else value = await disconnectPractice(input.arenaSession);
  return publicResult(input.operation, value);
}

export function remoteHttpError(error, operation = "unknown") {
  const message = sanitizeRemoteError(error);
  if (message === "Hosted Agent Practice is paused on this deployment." || message === "Hosted Agent Practice is not configured.") return { status: 503, error: message };
  if ([
    "Invalid Arena capability.", "Arena capability expired or is not active.", "Invalid Arena capability lifetime.",
    "Arena pairing ticket was already redeemed or revoked.", "Arena session was released or expired.",
  ].includes(message)) return { status: 401, error: message };
  if (message === "Arena command already in progress.") return { status: 409, error: message };
  if (message.includes("expectedSequence") || message.startsWith("Expected action sequence ") || message.includes("outside the course limits") || message.includes("durationMs")) return { status: 409, error: message };
  const diagnostic = remoteFailureDiagnostic(error);
  return {
    status: 502,
    error: message,
    code: diagnostic.code,
    retryable: diagnostic.retryable,
    recovery: operation === "act" ? "observe_before_retry" : "retry_with_backoff",
    diagnosticStage: diagnostic.stage,
  };
}
