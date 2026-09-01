import { DEFAULT_ARENA_URL } from "../server/lib/arena-url.mjs";
import { ensureAdmissionSweep, publishAdmissionSweepProbe } from "../server/lib/remote-expiry-scheduler.mjs";
import { assertAdmissionSweepHeartbeat, readAdmissionSweepHeartbeat } from "../server/lib/remote-admission.mjs";

const arenaUrl = process.env.ARENA_URL ?? DEFAULT_ARENA_URL;
const previousHeartbeat = await readAdmissionSweepHeartbeat();
const result = await ensureAdmissionSweep(arenaUrl);
const probe = await publishAdmissionSweepProbe(arenaUrl);
const deadline = Date.now() + 30_000;
let heartbeat;
while (Date.now() < deadline) {
  const current = await readAdmissionSweepHeartbeat();
  if (current > previousHeartbeat) {
    heartbeat = await assertAdmissionSweepHeartbeat();
    break;
  }
  await new Promise((resolve) => setTimeout(resolve, 1_000));
}
if (!heartbeat) throw new Error("The signed QStash sweep probe did not reach the Arena cleanup endpoint within 30 seconds.");
console.log(JSON.stringify({ configured: true, verified: true, ...result, probeMessageId: probe.messageId, heartbeat }, null, 2));
