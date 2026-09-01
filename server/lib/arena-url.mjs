export const DEFAULT_ARENA_URL = "https://solari-agent-arena.vercel.app/?agent=1";
export const BUILT_IN_COURSE_IDS = [
  "arena-slalom-ramp-v1",
  "practice-first-steps-v1",
  "practice-east-sprint-v1",
];

export function resolveArenaUrl(requestedUrl, configuredUrl = process.env.ARENA_URL || DEFAULT_ARENA_URL, courseId) {
  const allowed = new URL(configuredUrl);
  const target = new URL(requestedUrl || configuredUrl);
  if (!/^https?:$/.test(target.protocol) || target.username || target.password) throw new Error("Arena URL must be an uncredentialed HTTP(S) URL.");
  if (target.origin !== allowed.origin) throw new Error(`Arena URL origin must match ${allowed.origin}. Set ARENA_URL to deliberately change the allowed origin.`);
  if (target.pathname !== "/") throw new Error("Arena URL path must be /.");
  if (courseId !== undefined && !BUILT_IN_COURSE_IDS.includes(courseId)) throw new Error("Arena courseId must identify an allow-listed built-in course.");
  target.search = "";
  target.hash = "";
  target.searchParams.set("agent", "1");
  if (courseId !== undefined) target.searchParams.set("course", courseId);
  return target.href;
}
