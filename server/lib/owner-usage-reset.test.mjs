import { describe, expect, it, vi } from "vitest";
import {
  authorizeOwnerUsageReset, executeOwnerUsageReset, hasBearerAuthorization,
  OWNER_RESET_CONFIRMATION, OWNER_RESET_SCHEMA_VERSION, ownerUsageResetToken, validateOwnerUsageReset,
} from "./owner-usage-reset.mjs";

const valid = Object.freeze({
  schemaVersion: OWNER_RESET_SCHEMA_VERSION,
  operation: "reset-daily-usage",
  scope: "production",
  confirm: OWNER_RESET_CONFIRMATION,
});

describe("owner usage reset", () => {
  it("requires a dedicated owner token whenever live evaluation is enabled", () => {
    const evaluationToken = "e".repeat(48);
    const ownerToken = "o".repeat(48);
    expect(ownerUsageResetToken({ SOLARI_EVALUATION_ENABLED: "false", SOLARI_EVALUATION_TOKEN: evaluationToken })).toBe(evaluationToken);
    expect(ownerUsageResetToken({ SOLARI_EVALUATION_ENABLED: "true", SOLARI_EVALUATION_TOKEN: evaluationToken })).toBeUndefined();
    expect(ownerUsageResetToken({ SOLARI_EVALUATION_ENABLED: "true", SOLARI_EVALUATION_TOKEN: evaluationToken, SOLARI_REMOTE_OWNER_TOKEN: ownerToken })).toBe(ownerToken);
  });

  it("requires an exact constant-time-capable bearer secret", () => {
    const token = "a".repeat(48);
    expect(hasBearerAuthorization(`Bearer ${token}`)).toBe(true);
    expect(hasBearerAuthorization("")).toBe(false);
    expect(authorizeOwnerUsageReset(`Bearer ${token}`, token)).toBe(true);
    expect(authorizeOwnerUsageReset(`Bearer ${"b".repeat(48)}`, token)).toBe(false);
    expect(authorizeOwnerUsageReset(`Bearer ${token}x`, token)).toBe(false);
    expect(authorizeOwnerUsageReset(`Basic ${token}`, token)).toBe(false);
    expect(authorizeOwnerUsageReset(`Bearer ${token}`, "short")).toBe(false);
  });

  it("accepts only the exact destructive confirmation contract", () => {
    expect(validateOwnerUsageReset(valid)).toEqual(valid);
    for (const input of [
      { ...valid, confirm: "YES" },
      { ...valid, operation: "reset" },
      { ...valid, scope: "../production" },
      { ...valid, extra: true },
    ]) expect(() => validateOwnerUsageReset(input)).toThrow("invalid");
  });

  it("captures before and after status without touching active leases itself", async () => {
    const remoteUsageStatus = vi.fn().mockResolvedValueOnce({ epoch: 2, dailySessions: 2 }).mockResolvedValueOnce({ epoch: 3, dailySessions: 0 });
    const resetDailyUsage = vi.fn().mockResolvedValue({ reset: true, previousEpoch: 2, epoch: 3 });
    const result = await executeOwnerUsageReset(valid, { remoteUsageStatus, resetDailyUsage });
    expect(resetDailyUsage).toHaveBeenCalledWith(undefined, "production");
    expect(result).toMatchObject({ reset: true, before: { epoch: 2 }, resetArtifact: { epoch: 3 }, after: { epoch: 3, dailySessions: 0 } });
  });
});
