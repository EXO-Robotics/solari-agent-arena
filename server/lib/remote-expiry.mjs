import {
  abandonAdmissionLease, acquireCleanupLock, cancelPendingAdmission, closeAdmissionLease, getAdmissionLease,
  deferOrPruneFailedLease, listDueLeaseIds, releaseCleanupLock,
} from "./remote-admission.mjs";
import { releaseSolariBrowserSession } from "./solari-browser-rest.mjs";

function dueAt(lease, phase) {
  return Number(phase === "pairing" ? lease.pairingExpiresAt : lease.hardExpiresAt) * 1_000;
}

export async function expirePracticeLease(leaseId, phase, { nowMs = Date.now(), redis, release = releaseSolariBrowserSession } = {}) {
  const lease = await getAdmissionLease(leaseId, redis);
  if (!lease || lease.state === "closed") return { released: false, reason: "already-closed" };
  if (phase === "pairing" && lease.state !== "pairing") return { released: false, reason: "already-redeemed" };
  if (lease.state === "pending") {
    const pendingDeadline = Number(lease.pendingUntil) * 1_000;
    if (!Number.isFinite(pendingDeadline) || nowMs + 1_000 < pendingDeadline) throw new Error("Arena cleanup arrived before its lease deadline.");
    const cancelled = await cancelPendingAdmission({ leaseId, holderHash: lease.holderHash }, redis);
    return { released: cancelled, reason: "pending-cancelled" };
  }
  if (!Number.isFinite(dueAt(lease, phase)) || nowMs + 1_000 < dueAt(lease, phase)) throw new Error("Arena cleanup arrived before its lease deadline.");
  if (lease.state === "creating" && !lease.sessionId) {
    const abandoned = await abandonAdmissionLease(leaseId, "uncertain-provider-window-elapsed", redis, nowMs);
    return { released: false, cleared: abandoned, reason: "uncertain-window-elapsed" };
  }
  if (!lease.sessionId || !lease.sessionIdHash) throw new Error("Arena cleanup lease is incomplete.");
  const cleanupLock = await acquireCleanupLock(leaseId, redis);
  if (!cleanupLock) throw new Error("Arena cleanup is already in progress.");
  try {
    await release(lease.sessionId);
    const closed = await closeAdmissionLease(leaseId, lease.sessionId, redis, nowMs);
    return { released: closed, reason: closed ? phase : "already-closed" };
  } finally {
    await releaseCleanupLock(cleanupLock, redis).catch(() => undefined);
  }
}

export async function reapDuePracticeLeases({ nowMs = Date.now(), limit = 10, redis, release = releaseSolariBrowserSession } = {}) {
  const leaseIds = await listDueLeaseIds(redis, nowMs, limit);
  const results = [];
  for (const leaseId of leaseIds) {
    try {
      const lease = await getAdmissionLease(leaseId, redis);
      if (!lease) {
        const pruned = await deferOrPruneFailedLease(leaseId, redis, nowMs);
        results.push({ leaseId, released: false, reason: pruned.disposition === "pruned" ? "stale-index-pruned" : "cleanup-deferred" });
        continue;
      }
      const phase = lease?.state === "pairing" ? "pairing" : "hard";
      results.push({ leaseId, ...(await expirePracticeLease(leaseId, phase, { nowMs, redis, release })) });
    } catch {
      try {
        const deferred = await deferOrPruneFailedLease(leaseId, redis, nowMs);
        results.push({
          leaseId,
          released: false,
          reason: deferred.disposition === "pruned" ? "stale-index-pruned" : "cleanup-deferred",
          retryAt: deferred.retryAt || undefined,
          failures: deferred.failures || undefined,
        });
      } catch {
        results.push({ leaseId, released: false, reason: "cleanup-failed" });
      }
    }
  }
  return results;
}
