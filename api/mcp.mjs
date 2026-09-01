import { createMcpHandler } from "@modelcontextprotocol/server";
import { toNodeHandler } from "@modelcontextprotocol/node";
import { buildRemoteMcpServer } from "../server/lib/remote-mcp.mjs";
import { readBoundedJson, sendJson, validateRemoteRequestBoundary } from "../server/lib/http-guards.mjs";

const mcp = createMcpHandler(() => buildRemoteMcpServer(), {
  legacy: "stateless",
  responseMode: "json",
  onerror: () => undefined,
});
const nodeHandler = toNodeHandler(mcp, { onerror: () => undefined });

export default async function handler(request, response) {
  response.setHeader("cache-control", "no-store");
  response.setHeader("x-content-type-options", "nosniff");
  if (request.method !== "POST") { response.setHeader("allow", "POST"); return sendJson(response, 405, { error: "Method not allowed." }); }
  const rejected = validateRemoteRequestBoundary(request);
  if (rejected) return sendJson(response, rejected.status, { error: rejected.error });
  let body;
  try { body = await readBoundedJson(request); }
  catch { return sendJson(response, 400, { error: "Invalid JSON request." }); }
  return nodeHandler(request, response, body);
}
