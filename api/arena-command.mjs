import { readBoundedJson, sendJson, validateRemoteRequestBoundary } from "../server/lib/http-guards.mjs";
import { executeRemoteHttpCommand, remoteHttpError, validateRemoteHttpCommand } from "../server/lib/remote-http.mjs";

export default async function handler(request, response) {
  if (request.method !== "POST") { response.setHeader("allow", "POST"); return sendJson(response, 405, { error: "Method not allowed." }); }
  const rejected = validateRemoteRequestBoundary(request);
  if (rejected) return sendJson(response, rejected.status, { error: rejected.error });
  let command;
  try { command = validateRemoteHttpCommand(await readBoundedJson(request)); }
  catch { return sendJson(response, 400, { error: "Invalid Arena HTTP command." }); }
  try { return sendJson(response, 200, await executeRemoteHttpCommand(command)); }
  catch (error) { const failure = remoteHttpError(error); return sendJson(response, failure.status, { error: failure.error }); }
}
