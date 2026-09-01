import { issuePracticeTicket, remotePracticeEnabled, sanitizeRemoteError } from "../server/lib/remote-arena.mjs";
import { readBoundedJson, sendJson, validateRemoteRequestBoundary } from "../server/lib/http-guards.mjs";
import { getRemoteCourse, REMOTE_TRACKS } from "../server/lib/remote-courses.mjs";

function validateInput(body) {
  const keys = Object.keys(body);
  if (keys.length !== 3 || !["courseId", "seed", "track"].every((key) => keys.includes(key))) throw new Error("Expected courseId, seed, and track.");
  if (typeof body.courseId !== "string" || !Number.isInteger(body.seed) || typeof body.track !== "string") throw new Error("Invalid ticket request.");
  if (body.seed < 0 || body.seed > 0xffff_ffff || !REMOTE_TRACKS.includes(body.track)) throw new Error("Invalid ticket request.");
  getRemoteCourse(body.courseId);
  return body;
}

export default async function handler(request, response) {
  if (request.method !== "POST") { response.setHeader("allow", "POST"); return sendJson(response, 405, { error: "Method not allowed." }); }
  const rejected = validateRemoteRequestBoundary(request);
  if (rejected) return sendJson(response, rejected.status, { error: rejected.error });
  if (!remotePracticeEnabled()) return sendJson(response, 503, { error: "Hosted Agent Practice is paused on this deployment." });
  if (!process.env.SOLARI_API_KEY || !process.env.SOLARI_REMOTE_TICKET_SECRET) return sendJson(response, 503, { error: "Hosted Agent Practice is not configured." });
  let input;
  try { input = validateInput(await readBoundedJson(request)); }
  catch { return sendJson(response, 400, { error: "Invalid course, seed, or track." }); }
  try { return sendJson(response, 201, await issuePracticeTicket(input)); }
  catch (error) { return sendJson(response, 502, { error: sanitizeRemoteError(error) }); }
}
