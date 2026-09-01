import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";

const PREFIX = "saa1";
const AAD = Buffer.from("solari-agent-arena.remote-capability.v1");
const ISSUER = "solari-agent-arena";
const AUDIENCE = "remote-practice-mcp";
const AUTHORITY = "public-practice";
const PAIRING_TTL_SECONDS = 5 * 60;
const SESSION_TTL_SECONDS = 20 * 60;

const COMMON_FIELDS = [
  "v", "kind", "iss", "aud", "jti", "iat", "exp", "authorityClass", "courseId", "courseHash", "seed", "track",
  "maxActions", "maxSeconds", "maxActionDurationMs", "maxDrive", "maxTurn", "solariSessionId", "cdpEndpoint",
  "providerExpiresAt", "hardExpiresAt", "leaseId", "arenaUrl",
];
const PAIRING_FIELDS = new Set(COMMON_FIELDS);
const SESSION_FIELDS = new Set([...COMMON_FIELDS, "ticketJtiHash"]);

function secretKey(secret = process.env.SOLARI_REMOTE_TICKET_SECRET) {
  if (typeof secret !== "string" || secret.length < 32) throw new Error("Remote practice is not configured.");
  return createHash("sha256").update(secret).digest();
}

function b64(value) {
  return Buffer.from(value).toString("base64url");
}

function fromB64(value) {
  return Buffer.from(value, "base64url");
}

function strictKeys(value, allowed) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid Arena capability.");
  const keys = Object.keys(value);
  if (keys.some((key) => !allowed.has(key)) || keys.some((key) => value[key] === undefined)) throw new Error("Invalid Arena capability.");
}

function validateClaims(value, expectedKind, nowSeconds = Math.floor(Date.now() / 1_000)) {
  strictKeys(value, expectedKind === "pairing" ? PAIRING_FIELDS : SESSION_FIELDS);
  const required = expectedKind === "pairing" ? COMMON_FIELDS : [...COMMON_FIELDS, "ticketJtiHash"];
  if (required.some((key) => !(key in value))) throw new Error("Invalid Arena capability.");
  if (value.v !== 1 || value.kind !== expectedKind || value.iss !== ISSUER || value.aud !== AUDIENCE || value.authorityClass !== AUTHORITY) throw new Error("Invalid Arena capability.");
  if (!/^[0-9a-f-]{36}$/i.test(value.jti) || !/^[a-f0-9]{64}$/.test(value.courseHash)) throw new Error("Invalid Arena capability.");
  if (!Number.isInteger(value.iat) || !Number.isInteger(value.exp) || value.iat > nowSeconds + 30 || value.exp <= nowSeconds) throw new Error("Arena capability expired or is not active.");
  const maximumTtl = expectedKind === "pairing" ? PAIRING_TTL_SECONDS : SESSION_TTL_SECONDS;
  if (value.exp - value.iat > maximumTtl || value.exp - value.iat < 1) throw new Error("Invalid Arena capability lifetime.");
  if (!Number.isInteger(value.seed) || value.seed < 0 || value.seed > 0xffff_ffff) throw new Error("Invalid Arena capability.");
  if (!Number.isInteger(value.maxActions) || !Number.isFinite(value.maxSeconds) || !Number.isInteger(value.maxActionDurationMs)) throw new Error("Invalid Arena capability.");
  if (!["state-v1", "vision-v1"].includes(value.track)) throw new Error("Invalid Arena capability.");
  if (typeof value.solariSessionId !== "string" || value.solariSessionId.length < 8 || typeof value.cdpEndpoint !== "string") throw new Error("Invalid Arena capability.");
  if (!/^[0-9a-f-]{36}$/i.test(value.leaseId) || !Number.isFinite(Date.parse(value.hardExpiresAt))) throw new Error("Invalid Arena capability.");
  if (value.exp > Math.floor(Date.parse(value.hardExpiresAt) / 1_000)) throw new Error("Invalid Arena capability lifetime.");
  if (expectedKind === "session" && !/^[a-f0-9]{64}$/.test(value.ticketJtiHash)) throw new Error("Invalid Arena capability.");
  return Object.freeze(value);
}

export function sealCapability(claims, secret) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", secretKey(secret), iv);
  cipher.setAAD(AAD);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(claims), "utf8"), cipher.final()]);
  return `${PREFIX}.${b64(iv)}.${b64(encrypted)}.${b64(cipher.getAuthTag())}`;
}

export function openCapability(token, expectedKind, secret, nowSeconds) {
  if (typeof token !== "string" || token.length > 8_192) throw new Error("Invalid Arena capability.");
  const [prefix, ivText, encryptedText, tagText, extra] = token.split(".");
  if (prefix !== PREFIX || extra !== undefined) throw new Error("Invalid Arena capability.");
  try {
    const iv = fromB64(ivText); const encrypted = fromB64(encryptedText); const tag = fromB64(tagText);
    if (iv.length !== 12 || tag.length !== 16) throw new Error("invalid");
    const decipher = createDecipheriv("aes-256-gcm", secretKey(secret), iv);
    decipher.setAAD(AAD); decipher.setAuthTag(tag);
    const plain = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return validateClaims(JSON.parse(plain.toString("utf8")), expectedKind, nowSeconds);
  } catch {
    throw new Error("Invalid Arena capability.");
  }
}

export function createPairingClaims({ course, courseHash, seed, track, session, arenaUrl, leaseId }, nowSeconds = Math.floor(Date.now() / 1_000)) {
  const providerExpiry = Math.floor(Date.parse(session.expiresAt) / 1_000);
  const sessionExpiry = Math.min(providerExpiry, nowSeconds + SESSION_TTL_SECONDS);
  const hardExpiresAt = new Date(sessionExpiry * 1_000).toISOString();
  return {
    v: 1, kind: "pairing", iss: ISSUER, aud: AUDIENCE, jti: randomUUID(), iat: nowSeconds,
    exp: Math.min(sessionExpiry, nowSeconds + PAIRING_TTL_SECONDS), authorityClass: AUTHORITY,
    courseId: course.courseId, courseHash, seed, track,
    maxActions: course.maxActions, maxSeconds: course.maxSeconds, maxActionDurationMs: course.maxActionDurationMs,
    maxDrive: course.maxDrive, maxTurn: course.maxTurn,
    solariSessionId: session.id, cdpEndpoint: session.cdpEndpoint, providerExpiresAt: session.expiresAt, hardExpiresAt, leaseId, arenaUrl,
  };
}

export function createSessionClaims(pairing, nowSeconds = Math.floor(Date.now() / 1_000)) {
  const providerExpiry = Math.floor(Date.parse(pairing.providerExpiresAt) / 1_000);
  const hardExpiry = Math.floor(Date.parse(pairing.hardExpiresAt) / 1_000);
  const claims = { ...pairing, kind: "session", jti: randomUUID(), iat: nowSeconds, exp: Math.min(providerExpiry, hardExpiry, nowSeconds + SESSION_TTL_SECONDS), ticketJtiHash: hashOpaque(pairing.jti) };
  return claims;
}

export function hashOpaque(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

export function equalOpaque(left, right) {
  const a = Buffer.from(String(left)); const b = Buffer.from(String(right));
  return a.length === b.length && timingSafeEqual(a, b);
}
