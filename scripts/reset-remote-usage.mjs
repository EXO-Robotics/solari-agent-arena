import { remoteUsageStatus, resetDailyUsage } from "../server/lib/remote-admission.mjs";
import { DEFAULT_ARENA_URL } from "../server/lib/arena-url.mjs";
import { OWNER_RESET_CONFIRMATION, OWNER_RESET_SCHEMA_VERSION, ownerUsageResetToken } from "../server/lib/owner-usage-reset.mjs";

const scopeIndex = process.argv.indexOf("--scope");
const requestedScope = scopeIndex >= 0 ? process.argv[scopeIndex + 1] : undefined;
const urlIndex = process.argv.indexOf("--url");
const requestedUrl = urlIndex >= 0 ? process.argv[urlIndex + 1] : process.env.ARENA_URL ?? DEFAULT_ARENA_URL;
const confirm = process.argv.includes("--confirm") && process.argv.includes(OWNER_RESET_CONFIRMATION) && Boolean(requestedScope);

function hasLocalRedisCredentials() {
  return Boolean(
    (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN)
    || (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN),
  );
}

async function resetThroughOwnerEndpoint() {
  const token = ownerUsageResetToken();
  if (!token) throw new Error("Set SOLARI_REMOTE_OWNER_TOKEN, or keep SOLARI_EVALUATION_ENABLED=false with a private SOLARI_EVALUATION_TOKEN.");
  const endpoint = new URL("/api/arena-expire", requestedUrl);
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({
      schemaVersion: OWNER_RESET_SCHEMA_VERSION,
      operation: "reset-daily-usage",
      scope: requestedScope,
      confirm: OWNER_RESET_CONFIRMATION,
    }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Remote reset failed (${response.status}): ${body.error ?? "unknown error"}`);
  return body;
}

if (!confirm) {
  console.error("Refusing to reset usage. Re-run with: npm run remote:reset-usage -- --scope production --confirm RESET_DAILY_USAGE");
  process.exitCode = 2;
} else {
  console.error(`Resetting daily usage for Redis scope: ${requestedScope}`);
  if (hasLocalRedisCredentials()) {
    const before = await remoteUsageStatus();
    const reset = await resetDailyUsage(undefined, requestedScope);
    const after = await remoteUsageStatus();
    console.log(JSON.stringify({ transport: "direct-redis", before, reset, after }, null, 2));
  } else {
    console.error(`Using owner-only endpoint: ${new URL("/api/arena-expire", requestedUrl).origin}`);
    console.log(JSON.stringify({ transport: "owner-endpoint", ...await resetThroughOwnerEndpoint() }, null, 2));
  }
}
