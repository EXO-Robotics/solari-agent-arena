export const MAX_REMOTE_BODY_BYTES = 64_000;

function configuredHosts() {
  const explicit = String(process.env.SOLARI_REMOTE_ALLOWED_HOSTS ?? "").split(",").map((value) => value.trim().toLowerCase()).filter(Boolean);
  const deploymentHost = String(process.env.VERCEL_URL ?? "").trim().toLowerCase();
  if (explicit.length) return [...new Set([...explicit, ...(deploymentHost ? [deploymentHost] : [])])];
  const origin = new URL(process.env.ARENA_URL || "https://solari-agent-arena.vercel.app");
  return [...new Set([origin.hostname.toLowerCase(), ...(deploymentHost ? [deploymentHost] : []), ...(process.env.NODE_ENV === "production" ? [] : ["localhost", "127.0.0.1"] )])];
}

function requestHostname(request) {
  const host = String(request.headers.host ?? "");
  try { return new URL(`http://${host}`).hostname.toLowerCase(); }
  catch { return ""; }
}

export function validateRemoteRequestBoundary(request, { requireJson = true } = {}) {
  const hosts = configuredHosts();
  if (!hosts.includes(requestHostname(request))) return { status: 403, error: "Request host is not allowed." };
  const origin = request.headers.origin;
  if (origin) {
    try { if (!hosts.includes(new URL(String(origin)).hostname.toLowerCase())) return { status: 403, error: "Request origin is not allowed." }; }
    catch { return { status: 403, error: "Request origin is not allowed." }; }
  }
  if (requireJson && !String(request.headers["content-type"] ?? "").toLowerCase().startsWith("application/json")) return { status: 415, error: "Content-Type must be application/json." };
  const contentLength = Number(request.headers["content-length"] ?? 0);
  if (!Number.isFinite(contentLength) || contentLength > MAX_REMOTE_BODY_BYTES) return { status: 413, error: "Request body is too large." };
  return null;
}

export async function readBoundedJson(request) {
  let text = "";
  for await (const chunk of request) {
    text += Buffer.from(chunk).toString("utf8");
    if (Buffer.byteLength(text, "utf8") > MAX_REMOTE_BODY_BYTES) throw new Error("Request body is too large.");
  }
  const body = JSON.parse(text || "{}");
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("Request body must be one JSON object.");
  return body;
}

export function sendJson(response, status, body) {
  response.statusCode = status;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.setHeader("cache-control", "no-store");
  response.setHeader("x-content-type-options", "nosniff");
  response.end(JSON.stringify(body));
}
