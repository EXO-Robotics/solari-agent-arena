import { timingSafeEqual } from "node:crypto";

export const OWNER_RESET_SCHEMA_VERSION = "solari.arena.owner-usage-reset.v1";
export const OWNER_RESET_CONFIRMATION = "RESET_DAILY_USAGE";

export function ownerUsageResetToken(environment = process.env) {
  if (typeof environment.SOLARI_REMOTE_OWNER_TOKEN === "string" && environment.SOLARI_REMOTE_OWNER_TOKEN.length >= 32) {
    return environment.SOLARI_REMOTE_OWNER_TOKEN;
  }
  if (environment.SOLARI_EVALUATION_ENABLED === "false"
      && typeof environment.SOLARI_EVALUATION_TOKEN === "string"
      && environment.SOLARI_EVALUATION_TOKEN.length >= 32) {
    return environment.SOLARI_EVALUATION_TOKEN;
  }
  return undefined;
}

export function hasBearerAuthorization(value) {
  return /^Bearer\s+\S+$/i.test(String(value ?? ""));
}

export function authorizeOwnerUsageReset(authorization, expectedToken) {
  if (typeof expectedToken !== "string" || expectedToken.length < 32) return false;
  const match = /^Bearer\s+(.+)$/i.exec(String(authorization ?? ""));
  if (!match) return false;
  const actual = Buffer.from(match[1]);
  const expected = Buffer.from(expectedToken);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function validateOwnerUsageReset(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid");
  const keys = Object.keys(value).sort().join(",");
  if (keys !== "confirm,operation,schemaVersion,scope") throw new Error("invalid");
  if (value.schemaVersion !== OWNER_RESET_SCHEMA_VERSION) throw new Error("invalid");
  if (value.operation !== "reset-daily-usage") throw new Error("invalid");
  if (value.confirm !== OWNER_RESET_CONFIRMATION) throw new Error("invalid");
  if (!/^[a-z0-9-]{1,32}$/i.test(value.scope)) throw new Error("invalid");
  return Object.freeze({ ...value });
}

export async function executeOwnerUsageReset(input, { remoteUsageStatus, resetDailyUsage }) {
  const before = await remoteUsageStatus();
  const reset = await resetDailyUsage(undefined, input.scope);
  const after = await remoteUsageStatus();
  return Object.freeze({ schemaVersion: OWNER_RESET_SCHEMA_VERSION, reset: true, before, resetArtifact: reset, after });
}
