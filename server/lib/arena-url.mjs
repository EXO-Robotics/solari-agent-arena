export const DEFAULT_ARENA_URL = "https://solari-agent-arena.vercel.app/?agent=1";

export function resolveArenaUrl(requestedUrl, configuredUrl = process.env.ARENA_URL || DEFAULT_ARENA_URL) {
  const allowed = new URL(configuredUrl);
  const target = new URL(requestedUrl || configuredUrl);
  if (!/^https?:$/.test(target.protocol) || target.username || target.password) throw new Error("Arena URL must be an uncredentialed HTTP(S) URL.");
  if (target.origin !== allowed.origin) throw new Error(`Arena URL origin must match ${allowed.origin}. Set ARENA_URL to deliberately change the allowed origin.`);
  if (target.pathname !== "/") throw new Error("Arena URL path must be /.");
  target.search = "";
  target.hash = "";
  target.searchParams.set("agent", "1");
  return target.href;
}
