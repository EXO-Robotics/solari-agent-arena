import puppeteer from "puppeteer-core";
import { randomBytes } from "node:crypto";
import { sha256 } from "./evidence.mjs";
import { createPairingClaims, createSessionClaims, hashOpaque, openCapability, sealCapability } from "./remote-capability.mjs";
import { getRemoteCourse, remoteCourseHash, REMOTE_TRACKS } from "./remote-courses.mjs";
import { createSolariBrowserSession, downloadSolariBrowserReplay, releaseSolariBrowserSession } from "./solari-browser-rest.mjs";
import { resolveArenaUrl } from "./arena-url.mjs";
import {
  abandonAdmissionLease, acquireCommandLock, bindOrphanAdmission, cancelPendingAdmission, closeAdmissionLease,
  commitAdmission, markAdmissionCreating, redeemAdmission, releaseCommandLock, requireActiveAdmission,
  resolvePairingCode, storePairingCode,
} from "./remote-admission.mjs";
import { scheduleAdmissionExpiry } from "./remote-expiry-scheduler.mjs";

const BROWSER_API_VERSION = "0.1.2";
const BROWSER_PROTOCOL_TIMEOUT_MS = 60_000;
const REQUIRED_ARENA_TOOL_METHODS = Object.freeze(["reset", "manifest", "observe", "transcript", "act"]);
const REMOTE_TICKET_PHASES = new Set([
  "admission-creating", "provider-create", "admission-commit", "cleanup-schedule",
  "browser-connect", "arena-navigate", "arena-ready", "binding-verify",
]);

export function arenaToolApiReady(arena) {
  return Boolean(arena && REQUIRED_ARENA_TOOL_METHODS.every((method) => typeof arena[method] === "function"));
}

function tagRemoteFailure(error, phase) {
  const tagged = new Error(error instanceof Error ? error.message : "Remote Arena request failed.", { cause: error });
  tagged.remotePhase = REMOTE_TICKET_PHASES.has(phase) ? phase : "unknown";
  return tagged;
}

export function remoteFailurePhase(error) {
  return error && typeof error === "object" && REMOTE_TICKET_PHASES.has(error.remotePhase) ? error.remotePhase : "unknown";
}

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
    ? { browserWSEndpoint: endpoint, protocolTimeout: BROWSER_PROTOCOL_TIMEOUT_MS }
    : { browserURL: endpoint, protocolTimeout: BROWSER_PROTOCOL_TIMEOUT_MS };
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

async function withActiveCommand(claims, callback) {
  await requireActiveAdmission(claims.leaseId, claims.solariSessionId);
  const lock = await acquireCommandLock(claims.leaseId);
  try {
    await requireActiveAdmission(claims.leaseId, claims.solariSessionId);
    return await callback();
  } finally {
    await releaseCommandLock(lock).catch(() => undefined);
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

export async function settleFailedPracticeTicket(context, dependencies = {}) {
  const cancelPending = dependencies.cancelPending ?? cancelPendingAdmission;
  const releaseProvider = dependencies.releaseProvider ?? releaseSolariBrowserSession;
  const closeLease = dependencies.closeLease ?? closeAdmissionLease;
  const abandonLease = dependencies.abandonLease ?? abandonAdmissionLease;
  const bindOrphan = dependencies.bindOrphan ?? bindOrphanAdmission;
  const scheduleExpiry = dependencies.scheduleExpiry ?? scheduleAdmissionExpiry;
  const { admission, creatingAdmission, session, claims, committed, arenaUrl } = context;
  if (!creatingAdmission) {
    await cancelPending(admission).catch(() => undefined);
    return { retained: false, reason: "provider-not-started" };
  }
  if (!session) return { retained: true, reason: "provider-outcome-unknown" };
  const released = await releaseProvider(session.id).then(() => true).catch(() => false);
  if (released) {
    if (committed) await closeLease(admission.leaseId, session.id).catch(() => undefined);
    else await abandonLease(admission.leaseId, "provider-release-confirmed").catch(() => undefined);
    return { retained: false, reason: "provider-release-confirmed" };
  }
  if (!committed && claims) {
    const hardExpiresAt = Date.parse(claims.hardExpiresAt);
    const bound = await bindOrphan(creatingAdmission, session.id, hardExpiresAt).catch(() => false);
    if (bound) await scheduleExpiry({
      leaseId: admission.leaseId,
      pairingExpiresAt: Math.min(Date.now() + 5 * 60_000, hardExpiresAt),
      hardExpiresAt,
      arenaUrl,
    }).catch(() => undefined);
  }
  return { retained: true, reason: "provider-release-unconfirmed" };
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

export async function issuePracticeTicket({ courseId, seed, track }, admission) {
  requireRemoteConfig();
  if (!admission?.leaseId) throw new Error("Hosted Agent Practice admission is not configured.");
  const listing = getRemoteCourse(courseId);
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffff_ffff) throw new Error("seed must be a uint32 integer.");
  if (!REMOTE_TRACKS.includes(track)) throw new Error("track must be state-v1 or vision-v1.");
  const arenaUrl = resolveArenaUrl(undefined, process.env.ARENA_URL, courseId);
  let session;
  let claims;
  let creatingAdmission;
  let committed;
  let ready = false;
  let phase = "admission-creating";
  try {
    creatingAdmission = await markAdmissionCreating(admission);
    phase = "provider-create";
    session = await createSolariBrowserSession();
    claims = createPairingClaims({ course: listing.course, courseHash: remoteCourseHash(listing.course), seed, track, session, arenaUrl, leaseId: admission.leaseId });
    phase = "admission-commit";
    committed = await commitAdmission(creatingAdmission, session.id, { pairingExpiresAt: claims.exp * 1_000, hardExpiresAt: Date.parse(claims.hardExpiresAt) });
    phase = "cleanup-schedule";
    await scheduleAdmissionExpiry({
      leaseId: admission.leaseId,
      pairingExpiresAt: claims.exp * 1_000,
      hardExpiresAt: Date.parse(claims.hardExpiresAt),
      arenaUrl,
    });
    phase = "browser-connect";
    const browser = await puppeteer.connect(connectOptions(session.cdpEndpoint));
    try {
      const pages = await browser.pages();
      const page = pages[0] ?? await browser.newPage();
      phase = "arena-navigate";
      await page.goto(arenaUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
      phase = "arena-ready";
      await page.waitForFunction((requiredMethods) => {
        const arena = window.solariAgentArena;
        return Boolean(arena && requiredMethods.every((method) => typeof arena[method] === "function"));
      }, { timeout: 60_000 }, REQUIRED_ARENA_TOOL_METHODS);
      phase = "binding-verify";
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
    const pairingTicket = sealCapability(claims);
    const pairingCode = `run_${randomBytes(18).toString("base64url")}`;
    await storePairingCode(pairingCode, pairingTicket, claims.exp * 1_000);
    ready = true;
    return {
      schemaVersion: "solari.arena.pairing-ticket.v1",
      authorityClass: "public-practice",
      authoritative: false,
      courseId,
      courseHash: claims.courseHash,
      seed,
      track,
      pairingCode,
      expiresAt: new Date(claims.exp * 1_000).toISOString(),
      replayPolicy: "This ticket can be redeemed once. It reattaches to one recorded Solari Browser and expires after five minutes if unclaimed.",
    };
  } catch (error) {
    throw tagRemoteFailure(error, phase);
  } finally {
    if (!ready) await settleFailedPracticeTicket({ admission, creatingAdmission, session, claims, committed, arenaUrl });
  }
}

export async function connectPractice(pairingReference) {
  requireRemoteConfig();
  const pairingCode = pairingReference.startsWith("run_") ? pairingReference : null;
  const pairingTicket = pairingCode ? await resolvePairingCode(pairingCode) : pairingReference;
  const pairing = openCapability(pairingTicket, "pairing");
  const listing = getRemoteCourse(pairing.courseId);
  if (remoteCourseHash(listing.course) !== pairing.courseHash) throw new Error("Arena course binding failed.");
  const lock = await acquireCommandLock(pairing.leaseId);
  try {
    const loaded = await withBrowser(pairing, readLoadedState);
    verifyLoadedState(pairing, loaded);
    const image = pairing.track === "vision-v1" ? await withBrowser(pairing, viewportPng) : undefined;
    await redeemAdmission({
      leaseId: pairing.leaseId,
      sessionId: pairing.solariSessionId,
      ticketJtiHash: hashOpaque(pairing.jti),
      pairingCode,
      pairingTicket: pairingCode ? pairingTicket : null,
    });
    const sessionClaims = createSessionClaims(pairing);
    return {
      arenaSession: sealCapability(sessionClaims),
      observation: formatPracticeObservation(sessionClaims, loaded.observation),
      ...(image ? { image } : {}),
    };
  } finally {
    await releaseCommandLock(lock).catch(() => undefined);
  }
}

export async function observePractice(arenaSession) {
  requireRemoteConfig();
  const claims = openCapability(arenaSession, "session");
  return await withActiveCommand(claims, async () => {
    const loaded = await withBrowser(claims, readLoadedState);
    verifyLoadedState(claims, loaded);
    return {
      observation: formatPracticeObservation(claims, loaded.observation),
      ...(claims.track === "vision-v1" ? { image: await withBrowser(claims, viewportPng) } : {}),
    };
  });
}

export async function actPractice(arenaSession, input) {
  requireRemoteConfig();
  const claims = openCapability(arenaSession, "session");
  if (!Number.isInteger(input.expectedSequence) || input.expectedSequence < 0 || input.expectedSequence >= claims.maxActions) throw new Error("expectedSequence is outside the action budget.");
  if (![input.drive, input.turn, input.durationMs].every(Number.isFinite) || Math.abs(input.drive) > claims.maxDrive || Math.abs(input.turn) > claims.maxTurn) throw new Error("Action values are outside the course limits.");
  if (!Number.isInteger(input.durationMs) || input.durationMs < 100 || input.durationMs > claims.maxActionDurationMs) throw new Error("durationMs is outside the course limits.");
  return await withActiveCommand(claims, async () => {
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
  });
}

export async function finishPractice(arenaSession) {
  requireRemoteConfig();
  const claims = openCapability(arenaSession, "session");
  return await withActiveCommand(claims, async () => {
    let loaded; let screenshot; let releaseAccepted = false;
    try {
      ({ loaded, screenshot } = await withBrowser(claims, async (page) => ({ loaded: await readLoadedState(page), screenshot: await viewportPng(page) })));
      verifyLoadedState(claims, loaded);
    } finally {
      releaseAccepted = await releaseSolariBrowserSession(claims.solariSessionId).catch(() => false);
      if (releaseAccepted) await closeAdmissionLease(claims.leaseId, claims.solariSessionId).catch(() => undefined);
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
  });
}

export async function disconnectPractice(arenaSession) {
  requireRemoteConfig();
  const claims = openCapability(arenaSession, "session");
  return await withActiveCommand(claims, async () => {
    const releaseAccepted = await releaseSolariBrowserSession(claims.solariSessionId);
    if (releaseAccepted) await closeAdmissionLease(claims.leaseId, claims.solariSessionId);
    return { disconnected: true, releaseAccepted, authoritative: false };
  });
}

export function sanitizeRemoteError(error) {
  const allowed = [
    "Hosted Agent Practice is paused on this deployment.", "Hosted Agent Practice is not configured.", "Invalid Arena capability.",
    "Arena capability expired or is not active.", "Invalid Arena capability lifetime.", "Unknown built-in course.",
    "Arena course binding failed.", "Arena seed binding failed.", "Arena page is unavailable.", "Arena viewport is unavailable.",
    "Hosted Agent Practice admission is not configured.", "Arena pairing ticket was already redeemed or revoked.", "Arena session was released or expired.",
    "Arena command already in progress.",
    "expectedSequence is outside the action budget.", "Action values are outside the course limits.", "durationMs is outside the course limits.",
  ];
  const message = error instanceof Error ? error.message : String(error);
  if (/^Expected action sequence \d+\.$/.test(message)) return message;
  return allowed.includes(message) ? message : "Arena request failed safely. No authoritative result was created.";
}
