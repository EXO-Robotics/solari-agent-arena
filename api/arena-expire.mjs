import { expirePracticeLease, reapDuePracticeLeases } from "../server/lib/remote-expiry.mjs";
import { EXPIRY_SCHEMA_VERSION, expiryEndpointUrl, verifyExpiryRequest } from "../server/lib/remote-expiry-scheduler.mjs";
import { sendJson } from "../server/lib/http-guards.mjs";
import { DEFAULT_ARENA_URL } from "../server/lib/arena-url.mjs";
import { recordAdmissionSweepHeartbeat } from "../server/lib/remote-admission.mjs";

const MAX_BODY_BYTES = 1_024;

async function rawBody(request) {
  const chunks = [];
  let length = 0;
  for await (const chunk of request) {
    length += chunk.length;
    if (length > MAX_BODY_BYTES) throw new Error("body-too-large");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function header(request, name) {
  const value = request.headers?.[name] ?? request.headers?.[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}

function validate(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid");
  const keys = Object.keys(value).sort();
  if (value.schemaVersion !== EXPIRY_SCHEMA_VERSION) throw new Error("invalid");
  if (value.phase === "sweep" && keys.join(",") === "phase,schemaVersion") return value;
  if (keys.join(",") !== "leaseId,phase,schemaVersion" || !/^[0-9a-f-]{36}$/i.test(value.leaseId) || !["pairing", "hard"].includes(value.phase)) throw new Error("invalid");
  return value;
}

export default async function handler(request, response) {
  if (request.method !== "POST") { response.setHeader("allow", "POST"); return sendJson(response, 405, { error: "Method not allowed." }); }
  let text;
  try { text = await rawBody(request); }
  catch { return sendJson(response, 413, { error: "Invalid cleanup request." }); }
  const signature = header(request, "upstash-signature");
  const region = header(request, "upstash-region");
  const target = expiryEndpointUrl(process.env.ARENA_URL ?? DEFAULT_ARENA_URL);
  try {
    if (typeof signature !== "string" || !await verifyExpiryRequest({ body: text, signature, url: target, upstashRegion: region })) return sendJson(response, 401, { error: "Invalid cleanup signature." });
  } catch { return sendJson(response, 401, { error: "Invalid cleanup signature." }); }
  let input;
  try { input = validate(JSON.parse(text)); }
  catch { return sendJson(response, 400, { error: "Invalid cleanup request." }); }
  try {
    if (input.phase === "sweep") {
      await recordAdmissionSweepHeartbeat();
      const results = await reapDuePracticeLeases({ limit: 50 });
      const failures = results.filter((entry) => entry.reason === "cleanup-failed").length;
      if (failures) return sendJson(response, 503, { error: "Cleanup will be retried.", processed: results.length, failures });
      return sendJson(response, 200, { cleaned: true, processed: results.length, failures: 0 });
    }
    const result = await expirePracticeLease(input.leaseId, input.phase);
    return sendJson(response, 200, { cleaned: true, released: result.released, reason: result.reason });
  } catch {
    return sendJson(response, 503, { error: "Cleanup will be retried." });
  }
}
