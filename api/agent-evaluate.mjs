import { randomUUID, timingSafeEqual } from "node:crypto";
import { validateAgentEvaluationRequest, MAX_AGENT_REQUEST_BYTES } from "../server/lib/agent-validation.mjs";
import { evaluateAgentTranscriptInSolari } from "../server/lib/solari-agent-evaluator.mjs";

function send(response, status, body) {
  response.statusCode = status;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.setHeader("cache-control", "no-store");
  response.end(JSON.stringify(body));
}
function authorized(request, expected) {
  const actual = String(request.headers.authorization ?? "").replace(/^Bearer\s+/i, "");
  const left = Buffer.from(actual); const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}
async function readJson(request) {
  let text = "";
  for await (const chunk of request) {
    text += chunk;
    if (Buffer.byteLength(text, "utf8") > MAX_AGENT_REQUEST_BYTES) throw new Error("Request body is too large.");
  }
  return JSON.parse(text || "{}");
}
export default async function handler(request, response) {
  if (request.method !== "POST") { response.setHeader("allow", "POST"); return send(response, 405, { error: "Method not allowed." }); }
  if (process.env.SOLARI_EVALUATION_ENABLED !== "true") return send(response, 503, { error: "Live isolated runs are paused on this deployment." });
  if (!process.env.SOLARI_API_KEY || !process.env.SOLARI_EVALUATION_TOKEN) return send(response, 503, { error: "Agent evaluation is not configured on this deployment." });
  if (!authorized(request, process.env.SOLARI_EVALUATION_TOKEN)) return send(response, 401, { error: "A demo access code is required for live isolated runs." });
  let input;
  try { input = validateAgentEvaluationRequest(await readJson(request)); }
  catch (error) { return send(response, 400, { error: String(error?.message ?? error) }); }
  try {
    const run = await evaluateAgentTranscriptInSolari({
      ...input, runId: randomUUID(), startedAt: new Date().toISOString(), apiKey: process.env.SOLARI_API_KEY,
      template: process.env.SOLARI_SANDBOX_TEMPLATE || "base",
    });
    return send(response, 200, run);
  } catch (error) {
    console.error("Agent evaluation infrastructure failure", error);
    return send(response, 502, { error: "The isolated transcript evaluator did not issue an artifact." });
  }
}
