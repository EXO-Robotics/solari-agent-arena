import { isAuthoritativeRun, type AuthoritativeRun } from "./contract";

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return Object.fromEntries(Object.keys(record).sort().map((key) => [key, stableValue(record[key])]));
  }
  return value;
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(stableValue(value));
}

export async function sha256(value: unknown): Promise<string> {
  const text = typeof value === "string" ? value : canonicalJson(value);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function verifyArtifactIntegrity(value: unknown): Promise<{ run: AuthoritativeRun; integrityChecked: true }> {
  if (!isAuthoritativeRun(value)) throw new Error("Artifact does not match a supported Solari Arena evidence contract.");
  const telemetryHash = await sha256(value.telemetry.samples);
  if (telemetryHash !== value.telemetry.hash) throw new Error("Telemetry hash mismatch.");
  const withoutHash = { ...value } as Partial<AuthoritativeRun>;
  delete withoutHash.resultHash;
  const resultHash = await sha256(withoutHash);
  if (resultHash !== value.resultHash) throw new Error("Result hash mismatch.");
  return { run: value, integrityChecked: true };
}
