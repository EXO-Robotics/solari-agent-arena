import { randomUUID, timingSafeEqual } from "node:crypto";
import { evaluateInSolari } from "../server/lib/solari-evaluator.mjs";
import { validateEvaluationRequest } from "../server/lib/request-validation.mjs";

function send(response, status, body) {
  response.statusCode = status;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.setHeader("cache-control", "no-store");
  response.end(JSON.stringify(body));
}

let evaluationInFlight = false;

function authorized(request, expected) {
  const actual = String(request.headers.authorization ?? "").replace(/^Bearer\s+/i, "");
  const left = Buffer.from(actual);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

async function readJson(request) {
  let text = "";
  for await (const chunk of request) {
    text += chunk;
    if (Buffer.byteLength(text, "utf8") > 32_000) throw new Error("Request body is too large.");
  }
  return JSON.parse(text || "{}");
}

export default async function handler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("allow", "POST");
    return send(response, 405, { error: "Method not allowed." });
  }
  if (process.env.SOLARI_EVALUATION_ENABLED !== "true") {
    return send(response, 503, { error: "Live isolated runs are paused on this deployment. Checked-in evidence, when present, remains replayable." });
  }
  if (!process.env.SOLARI_API_KEY) return send(response, 503, { error: "Isolated Evaluation is not configured on this deployment." });
  if (!process.env.SOLARI_EVALUATION_TOKEN) return send(response, 503, { error: "Isolated Evaluation admission control is not configured." });
  if (!authorized(request, process.env.SOLARI_EVALUATION_TOKEN)) return send(response, 401, { error: "A demo access code is required for live isolated runs." });
  if (evaluationInFlight) return send(response, 429, { error: "One isolated run is already in progress. Try again shortly." });

  let input;
  try {
    input = validateEvaluationRequest(await readJson(request));
  } catch (error) {
    return send(response, 400, { error: String(error?.message ?? error) });
  }

  evaluationInFlight = true;
  try {
    const startedAt = new Date().toISOString();
    const run = await evaluateInSolari({
      ...input,
      runId: randomUUID(),
      startedAt,
      apiKey: process.env.SOLARI_API_KEY,
      template: process.env.SOLARI_SANDBOX_TEMPLATE || "base",
    });
    return send(response, 200, run);
  } catch (error) {
    console.error("Isolated Evaluation infrastructure failure", error);
    return send(response, 502, { error: "The isolated evaluator did not issue an artifact. No authoritative result was created." });
  } finally {
    evaluationInFlight = false;
  }
}
