import { Client, Receiver } from "@upstash/qstash";

export const EXPIRY_SCHEMA_VERSION = "solari.arena.remote-expiry.v1";
export const SWEEP_SCHEDULE_ID = "solari-agent-arena-sweep-v1";
export const SWEEP_CRON = "*/5 * * * *";

let qstashClient;

function clientFromEnv() {
  if (!process.env.QSTASH_TOKEN) throw new Error("Hosted Agent Practice cleanup is not configured.");
  qstashClient ??= new Client({ token: process.env.QSTASH_TOKEN, enableTelemetry: false });
  return qstashClient;
}

export function expiryEndpointUrl(arenaUrl) {
  const endpoint = new URL("/api/arena-expire", arenaUrl);
  if (endpoint.protocol !== "https:" && endpoint.hostname !== "localhost" && endpoint.hostname !== "127.0.0.1") throw new Error("Hosted Agent Practice cleanup requires HTTPS.");
  endpoint.search = "";
  endpoint.hash = "";
  return endpoint.href;
}

export async function scheduleAdmissionExpiry({ leaseId, pairingExpiresAt, hardExpiresAt, arenaUrl }, client = clientFromEnv(), nowMs = Date.now()) {
  const url = expiryEndpointUrl(arenaUrl);
  const messages = [
    { phase: "hard", at: hardExpiresAt },
    { phase: "pairing", at: pairingExpiresAt },
  ];
  const receipts = [];
  for (const message of messages) {
    const delay = Math.max(1, Math.ceil((message.at - nowMs) / 1_000));
    const result = await client.publishJSON({
      url,
      body: { schemaVersion: EXPIRY_SCHEMA_VERSION, leaseId, phase: message.phase },
      delay,
      retries: 5,
      deduplicationId: `saa-${leaseId}-${message.phase}`,
      label: ["solari-agent-arena", `expiry-${message.phase}`],
    });
    if (!result?.messageId) throw new Error("Hosted Agent Practice cleanup could not be scheduled.");
    receipts.push({ phase: message.phase, messageId: result.messageId });
  }
  return receipts;
}

export async function ensureAdmissionSweep(arenaUrl, client = clientFromEnv()) {
  const destination = expiryEndpointUrl(arenaUrl);
  const body = JSON.stringify({ schemaVersion: EXPIRY_SCHEMA_VERSION, phase: "sweep" });
  await client.schedules.create({
    scheduleId: SWEEP_SCHEDULE_ID,
    destination,
    body,
    headers: { "content-type": "application/json" },
    method: "POST",
    cron: SWEEP_CRON,
    retries: 5,
    label: ["solari-agent-arena", "expiry-sweep"],
  });
  return await assertAdmissionSweepReady(arenaUrl, client);
}

export async function publishAdmissionSweepProbe(arenaUrl, client = clientFromEnv()) {
  const result = await client.publishJSON({
    url: expiryEndpointUrl(arenaUrl),
    body: { schemaVersion: EXPIRY_SCHEMA_VERSION, phase: "sweep" },
    retries: 5,
    deduplicationId: `saa-sweep-probe-${Date.now()}`,
    label: ["solari-agent-arena", "expiry-sweep-probe"],
  });
  if (!result?.messageId) throw new Error("Hosted Agent Practice cleanup probe could not be scheduled.");
  return Object.freeze({ messageId: result.messageId });
}

function decodedScheduleBody(schedule) {
  if (typeof schedule?.body === "string") return schedule.body;
  if (typeof schedule?.bodyBase64 === "string") return Buffer.from(schedule.bodyBase64, "base64").toString("utf8");
  return "";
}

export async function assertAdmissionSweepReady(arenaUrl, client = clientFromEnv()) {
  const expectedDestination = expiryEndpointUrl(arenaUrl);
  const expectedBody = JSON.stringify({ schemaVersion: EXPIRY_SCHEMA_VERSION, phase: "sweep" });
  let schedule;
  try { schedule = await client.schedules.get(SWEEP_SCHEDULE_ID); }
  catch { throw new Error("Hosted Agent Practice cleanup schedule is unavailable."); }
  const ready = schedule?.scheduleId === SWEEP_SCHEDULE_ID
    && schedule.destination === expectedDestination
    && schedule.cron === SWEEP_CRON
    && String(schedule.method).toUpperCase() === "POST"
    && schedule.isPaused === false
    && decodedScheduleBody(schedule) === expectedBody;
  if (!ready) throw new Error("Hosted Agent Practice cleanup schedule is not ready.");
  return Object.freeze({
    scheduleId: schedule.scheduleId,
    destination: schedule.destination,
    cron: schedule.cron,
    method: "POST",
    active: true,
  });
}

export async function verifyExpiryRequest({ body, signature, url, upstashRegion }) {
  if (!process.env.QSTASH_CURRENT_SIGNING_KEY || !process.env.QSTASH_NEXT_SIGNING_KEY) throw new Error("Hosted Agent Practice cleanup is not configured.");
  const receiver = new Receiver({
    currentSigningKey: process.env.QSTASH_CURRENT_SIGNING_KEY,
    nextSigningKey: process.env.QSTASH_NEXT_SIGNING_KEY,
  });
  return await receiver.verify({ body, signature, url, upstashRegion });
}
