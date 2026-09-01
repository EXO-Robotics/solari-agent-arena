import puppeteer from "puppeteer-core";
import { sha256 } from "./evidence.mjs";
import { createPairingClaims, createSessionClaims, hashOpaque, openCapability, sealCapability } from "./remote-capability.mjs";
import { getRemoteCourse, remoteCourseHash, REMOTE_TRACKS } from "./remote-courses.mjs";
import { createSolariBrowserSession, downloadSolariBrowserReplay, releaseSolariBrowserSession } from "./solari-browser-rest.mjs";
import { resolveArenaUrl } from "./arena-url.mjs";

const BROWSER_API_VERSION = "0.1.2";

export function remotePracticeEnabled() {
  return process.env.SOLARI_REMOTE_ENABLED === "true";
}

function requireRemoteConfig() {
  if (!remotePracticeEnabled()) throw new Error("Hosted Agent Practice is paused on this deployment.");
  if (!process.env.SOLARI_API_KEY || !process.env.SOLARI_REMOTE_TICKET_SECRET) throw new Error("Hosted Agent Practice is not configured.");
}

function connectOptions(endpoint) {
  const url = new URL(endpoint);
  return url.protocol === "wss:"
    ? { browserWSEndpoint: endpoint, protocolTimeout: 15_000 }
    : { browserURL: endpoint, protocolTimeout: 15_000 };
}

async function withBrowser(claims, callback) {
  const browser = await puppeteer.connect(connectOptions(claims.cdpEndpoint));
  try {
    const pages = await browser.pages();
    const expected = new URL(claims.arenaUrl);
    const page = pages.find((candidate) => {
      try { const current = new URL(candidate.url()); return current.origin === expected.origin && current.pathname === "/"; }
      catch { return false; }
    });
    if (!page) throw new Error("Arena page is unavailable.");
    return await callback(page);
  } finally {
    await browser.disconnect();
  }
}

async function readLoadedState(page) {
  return page.evaluate(() => {
    const arena = window.solariAgentArena;
    if (!arena) throw new Error("Arena tools are not ready.");
    return { manifest: arena.manifest(), observation: arena.observe(), transcript: arena.transcript() };
  });
}

function verifyLoadedState(claims, loaded) {
  if (loaded.manifest.course.courseId !== claims.courseId || sha256(loaded.manifest.course) !== claims.courseHash) throw new Error("Arena course binding failed.");
  if (loaded.observation.courseId !== claims.courseId || loaded.transcript.seed !== claims.seed) throw new Error("Arena seed binding failed.");
}

export function formatPracticeObservation(claims, observation) {
  const shared = {
    schemaVersion: "solari.arena.remote-observation.v1",
    authorityClass: "public-practice",
    authoritative: false,
    execution: "solari-browser",
    courseId: claims.courseId,
    courseHash: claims.courseHash,
    seed: claims.seed,
    track: claims.track,
    phase: observation.phase,
    checkpoints: { ...observation.checkpoints },
    collisions: observation.collisions,
    actionsUsed: observation.actionsUsed,
    actionsRemaining: Math.max(0, claims.maxActions - observation.actionsUsed),
    actionBudget: claims.maxActions,
    simulatedTimeSeconds: observation.simulatedTimeSeconds,
    simulatedTimeRemainingSeconds: Math.max(0, claims.maxSeconds - observation.simulatedTimeSeconds),
    nextExpectedSequence: observation.actionsUsed,
  };
  if (claims.track === "vision-v1") return shared;
  return {
    ...shared,
    position: { ...observation.position },
    yawRadians: observation.yawRadians,
    speedMps: observation.speedMps,
    bodyPitchRadians: observation.bodyPitchRadians,
  };
}

async function viewportPng(page) {
  await page.evaluate(() => document.querySelector(".simulation")?.classList.add("simulation--vision-capture"));
  try {
    const viewport = await page.$("#viewport");
    if (!viewport) throw new Error("Arena viewport is unavailable.");
    return new Uint8Array(await viewport.screenshot({ type: "png" }));
  } finally {
    await page.evaluate(() => document.querySelector(".simulation")?.classList.remove("simulation--vision-capture")).catch(() => undefined);
  }
}

export async function issuePracticeTicket({ courseId, seed, track }) {
  requireRemoteConfig();
  const listing = getRemoteCourse(courseId);
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffff_ffff) throw new Error("seed must be a uint32 integer.");
  if (!REMOTE_TRACKS.includes(track)) throw new Error("track must be state-v1 or vision-v1.");
  const arenaUrl = resolveArenaUrl(undefined, process.env.ARENA_URL, courseId);
  const session = await createSolariBrowserSession();
  let ready = false;
  try {
    const claims = createPairingClaims({ course: listing.course, courseHash: remoteCourseHash(listing.course), seed, track, session, arenaUrl });
    const browser = await puppeteer.connect(connectOptions(session.cdpEndpoint));
    try {
      const pages = await browser.pages();
      const page = pages[0] ?? await browser.newPage();
      await page.goto(arenaUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
      await page.waitForSelector('[data-testid="agent-phase"]', { timeout: 60_000 });
      const loaded = await page.evaluate((requestedSeed) => {
        const arena = window.solariAgentArena;
        if (!arena) throw new Error("Arena tools are not ready.");
        arena.reset(requestedSeed);
        return { manifest: arena.manifest(), observation: arena.observe(), transcript: arena.transcript() };
      }, seed);
      verifyLoadedState(claims, loaded);
    } finally {
      await browser.disconnect();
    }
    ready = true;
    return {
      schemaVersion: "solari.arena.pairing-ticket.v1",
      authorityClass: "public-practice",
      authoritative: false,
      courseId,
      courseHash: claims.courseHash,
      seed,
      track,
      pairingTicket: sealCapability(claims),
      expiresAt: new Date(claims.exp * 1_000).toISOString(),
      replayPolicy: "Ticket redemption reattaches to one recorded Solari Browser. This short-lived prototype ticket is replayable until expiry.",
    };
  } finally {
    if (!ready) await releaseSolariBrowserSession(session.id).catch(() => undefined);
  }
}

export async function connectPractice(pairingTicket) {
  requireRemoteConfig();
  const pairing = openCapability(pairingTicket, "pairing");
  const listing = getRemoteCourse(pairing.courseId);
  if (remoteCourseHash(listing.course) !== pairing.courseHash) throw new Error("Arena course binding failed.");
  const loaded = await withBrowser(pairing, readLoadedState);
  verifyLoadedState(pairing, loaded);
  const sessionClaims = createSessionClaims(pairing);
  return {
    arenaSession: sealCapability(sessionClaims),
    observation: formatPracticeObservation(sessionClaims, loaded.observation),
    ...(sessionClaims.track === "vision-v1" ? { image: await withBrowser(sessionClaims, viewportPng) } : {}),
  };
}

export async function observePractice(arenaSession) {
  requireRemoteConfig();
  const claims = openCapability(arenaSession, "session");
  const loaded = await withBrowser(claims, readLoadedState);
  verifyLoadedState(claims, loaded);
  return {
    observation: formatPracticeObservation(claims, loaded.observation),
    ...(claims.track === "vision-v1" ? { image: await withBrowser(claims, viewportPng) } : {}),
  };
}

export async function actPractice(arenaSession, input) {
  requireRemoteConfig();
  const claims = openCapability(arenaSession, "session");
  if (!Number.isInteger(input.expectedSequence) || input.expectedSequence < 0 || input.expectedSequence >= claims.maxActions) throw new Error("expectedSequence is outside the action budget.");
  if (![input.drive, input.turn, input.durationMs].every(Number.isFinite) || Math.abs(input.drive) > claims.maxDrive || Math.abs(input.turn) > claims.maxTurn) throw new Error("Action values are outside the course limits.");
  if (!Number.isInteger(input.durationMs) || input.durationMs < 100 || input.durationMs > claims.maxActionDurationMs) throw new Error("durationMs is outside the course limits.");
  const loaded = await withBrowser(claims, async (page) => page.evaluate(async (action) => {
    const arena = window.solariAgentArena;
    if (!arena) throw new Error("Arena tools are not ready.");
    const observation = await arena.act(action);
    return { manifest: arena.manifest(), observation, transcript: arena.transcript() };
  }, input));
  verifyLoadedState(claims, loaded);
  return {
    observation: formatPracticeObservation(claims, loaded.observation),
    ...(claims.track === "vision-v1" ? { image: await withBrowser(claims, viewportPng) } : {}),
  };
}

export async function finishPractice(arenaSession) {
  requireRemoteConfig();
  const claims = openCapability(arenaSession, "session");
  let loaded; let screenshot; let releaseAccepted = false;
  try {
    ({ loaded, screenshot } = await withBrowser(claims, async (page) => ({ loaded: await readLoadedState(page), screenshot: await viewportPng(page) })));
    verifyLoadedState(claims, loaded);
  } finally {
    releaseAccepted = await releaseSolariBrowserSession(claims.solariSessionId).catch(() => false);
  }
  const replay = releaseAccepted ? await downloadSolariBrowserReplay(claims.solariSessionId).catch(() => null) : null;
  const receipt = {
    schemaVersion: "solari.arena.remote-practice-run.v1",
    runId: `practice_${hashOpaque(`${claims.jti}:${Date.now()}`).slice(0, 24)}`,
    authoritative: false,
    authorityClass: "public-practice",
    execution: { provider: "solari", product: "browser", sdkVersion: BROWSER_API_VERSION, sessionIdHash: hashOpaque(claims.solariSessionId) },
    ticketJtiHash: claims.ticketJtiHash,
    courseId: claims.courseId,
    courseHash: claims.courseHash,
    seed: claims.seed,
    track: claims.track,
    outcome: { phase: loaded.observation.phase, checkpoints: loaded.observation.checkpoints, collisions: loaded.observation.collisions, simulatedTimeSeconds: loaded.observation.simulatedTimeSeconds },
    transcript: loaded.transcript,
    transcriptHash: sha256(loaded.transcript),
    screenshotHash: screenshot ? sha256(screenshot) : null,
    replayHash: replay ? sha256(replay) : null,
    releaseAccepted,
    completedAt: new Date().toISOString(),
  };
  receipt.resultHash = sha256(receipt);
  return { receipt, image: screenshot };
}

export async function disconnectPractice(arenaSession) {
  requireRemoteConfig();
  const claims = openCapability(arenaSession, "session");
  return { disconnected: true, releaseAccepted: await releaseSolariBrowserSession(claims.solariSessionId), authoritative: false };
}

export function sanitizeRemoteError(error) {
  const allowed = [
    "Hosted Agent Practice is paused on this deployment.", "Hosted Agent Practice is not configured.", "Invalid Arena capability.",
    "Arena capability expired or is not active.", "Invalid Arena capability lifetime.", "Unknown built-in course.",
    "Arena course binding failed.", "Arena seed binding failed.", "Arena page is unavailable.", "Arena viewport is unavailable.",
    "expectedSequence is outside the action budget.", "Action values are outside the course limits.", "durationMs is outside the course limits.",
  ];
  const message = error instanceof Error ? error.message : String(error);
  return allowed.includes(message) ? message : "Arena request failed safely. No authoritative result was created.";
}
