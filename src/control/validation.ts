export const MAX_CONTROLLER_BYTES = 24_000;

const FORBIDDEN_CAPABILITIES = [
  { pattern: /\b(?:process|require|module|exports|Buffer)\b/, label: "Node.js host access" },
  { pattern: /\b(?:fetch|XMLHttpRequest|WebSocket|EventSource)\b/, label: "network access" },
  { pattern: /\b(?:document|window|navigator|location|indexedDB|localStorage)\b/, label: "browser host access" },
  { pattern: /\b(?:Deno|Bun)\b/, label: "alternate runtime access" },
  { pattern: /\bimport\s*(?:\(|[^.(])/, label: "module import" },
] as const;

export interface ControllerValidation {
  valid: boolean;
  byteLength: number;
  reason?: string;
  capability?: string;
}

export function validateControllerSource(source: unknown): ControllerValidation {
  if (typeof source !== "string") return { valid: false, byteLength: 0, reason: "Controller source must be a string." };
  const byteLength = new TextEncoder().encode(source).byteLength;
  if (byteLength === 0) return { valid: false, byteLength, reason: "Controller source is empty." };
  if (byteLength > MAX_CONTROLLER_BYTES) {
    return { valid: false, byteLength, reason: `Controller exceeds the ${MAX_CONTROLLER_BYTES.toLocaleString()} byte limit.` };
  }
  if (!/\bfunction\s+control\s*\(/.test(source)) {
    return { valid: false, byteLength, reason: "Define function control(robot, dt)." };
  }
  for (const rule of FORBIDDEN_CAPABILITIES) {
    if (rule.pattern.test(source)) {
      return {
        valid: false,
        byteLength,
        capability: rule.label,
        reason: `${rule.label} is unavailable in authoritative controllers.`,
      };
    }
  }
  return { valid: true, byteLength };
}
