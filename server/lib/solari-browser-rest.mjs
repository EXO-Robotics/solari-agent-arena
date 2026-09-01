const BASE_URL = "https://api.getsolari.com";

function apiKey() {
  const value = process.env.SOLARI_API_KEY;
  if (!value) throw new Error("Remote practice is not configured.");
  return value;
}

async function request(path, options = {}) {
  const response = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: { authorization: `Bearer ${apiKey()}`, ...(options.body ? { "content-type": "application/json" } : {}) },
    signal: AbortSignal.timeout(options.timeoutMs ?? 60_000),
  });
  return response;
}

function deriveCdpEndpoint(wsEndpoint) {
  const url = new URL(wsEndpoint);
  if (url.pathname.startsWith("/ws/")) url.pathname = `/cdp/${url.pathname.slice(4)}`;
  return url.href;
}

function validateEndpoint(value) {
  const endpoint = new URL(value);
  if (!["wss:", "https:"].includes(endpoint.protocol) || endpoint.username || endpoint.password) throw new Error("Solari returned an unusable Browser endpoint.");
  return endpoint.href;
}

export async function createSolariBrowserSession() {
  const response = await request("/sessions", { method: "POST", body: JSON.stringify({ recording: true }) });
  if (!response.ok) throw new Error("Solari Browser session creation failed.");
  const body = await response.json();
  if (typeof body.sessionId !== "string" || typeof body.wsEndpoint !== "string") throw new Error("Solari Browser returned an invalid session.");
  const expiresAt = typeof body.expiresAt === "string" ? body.expiresAt : new Date(Date.now() + 60 * 60_000).toISOString();
  return Object.freeze({ id: body.sessionId, cdpEndpoint: validateEndpoint(body.cdpEndpoint ?? deriveCdpEndpoint(body.wsEndpoint)), expiresAt });
}

export async function releaseSolariBrowserSession(sessionId) {
  const response = await request(`/sessions/${encodeURIComponent(sessionId)}`, { method: "DELETE", timeoutMs: 15_000 });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    let code;
    try { code = JSON.parse(text)?.code; } catch { /* pre-code gateway response */ }
    if (response.status !== 404 || code === "InvalidSessionId") throw new Error("Solari Browser release was not accepted.");
  }
  return true;
}

export async function downloadSolariBrowserReplay(sessionId) {
  let replayResponse;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const response = await request(`/sessions/${encodeURIComponent(sessionId)}/replay-url`, { method: "GET", timeoutMs: 10_000 });
    if (response.ok) { replayResponse = response; break; }
    if (attempt < 4) await new Promise((resolve) => setTimeout(resolve, 600));
  }
  if (!replayResponse) return null;
  const body = await replayResponse.json();
  if (typeof body.url !== "string") return null;
  const download = await fetch(body.url, { signal: AbortSignal.timeout(20_000) });
  if (!download.ok) return null;
  return new Uint8Array(await download.arrayBuffer());
}
