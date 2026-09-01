import { remoteUsageStatus, resetDailyUsage } from "../server/lib/remote-admission.mjs";

const scopeIndex = process.argv.indexOf("--scope");
const requestedScope = scopeIndex >= 0 ? process.argv[scopeIndex + 1] : undefined;
const confirm = process.argv.includes("--confirm") && process.argv.includes("RESET_DAILY_USAGE") && Boolean(requestedScope);

if (!confirm) {
  console.error("Refusing to reset usage. Re-run with: npm run remote:reset-usage -- --scope production --confirm RESET_DAILY_USAGE");
  process.exitCode = 2;
} else {
  const before = await remoteUsageStatus();
  console.error(`Resetting daily usage for Redis scope: ${requestedScope}`);
  const reset = await resetDailyUsage(undefined, requestedScope);
  const after = await remoteUsageStatus();
  console.log(JSON.stringify({ before, reset, after }, null, 2));
}
