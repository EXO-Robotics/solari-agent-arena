import { createHash } from "node:crypto";

export function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
  }
  return value;
}

export function canonicalJson(value) {
  return JSON.stringify(stableValue(value));
}

export function sha256(value) {
  const bytes = typeof value === "string" || value instanceof Uint8Array ? value : canonicalJson(value);
  return createHash("sha256").update(bytes).digest("hex");
}

export function finalizeRun(run) {
  const withoutHash = { ...run };
  delete withoutHash.resultHash;
  return { ...withoutHash, resultHash: sha256(withoutHash) };
}
