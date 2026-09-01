import { describe, expect, it } from "vitest";
import { createPairingClaims, createSessionClaims, openCapability, sealCapability } from "./remote-capability.mjs";
import { getRemoteCourse, remoteCourseHash } from "./remote-courses.mjs";

const secret = "test-only-remote-ticket-secret-at-least-32-bytes";
const now = 1_800_000_000;

function pairing() {
  const course = getRemoteCourse("practice-first-steps-v1").course;
  return createPairingClaims({
    course, courseHash: remoteCourseHash(course), seed: 42, track: "state-v1",
    session: { id: "session_private_123", cdpEndpoint: "wss://browser.getsolari.com/cdp/private", expiresAt: new Date((now + 3_600) * 1_000).toISOString() },
    leaseId: "11111111-1111-4111-8111-111111111111",
    arenaUrl: "https://solari-agent-arena.vercel.app/?agent=1&course=practice-first-steps-v1",
  }, now);
}

describe("remote Arena capabilities", () => {
  it("encrypts provider capabilities and binds the expected token kind", () => {
    const claims = pairing();
    const token = sealCapability(claims, secret);
    expect(token).not.toContain(claims.solariSessionId);
    expect(token).not.toContain("getsolari");
    expect(openCapability(token, "pairing", secret, now + 1)).toMatchObject({ courseId: claims.courseId, seed: 42, authorityClass: "public-practice" });
    expect(() => openCapability(token, "session", secret, now + 1)).toThrow(/Invalid Arena capability/);
  });

  it("rejects tampering, expiry, and unknown claims", () => {
    const claims = pairing();
    const token = sealCapability(claims, secret);
    const parts = token.split(".");
    parts[2] = `${parts[2][0] === "a" ? "b" : "a"}${parts[2].slice(1)}`;
    expect(() => openCapability(parts.join("."), "pairing", secret, now + 1)).toThrow(/Invalid Arena capability/);
    expect(() => openCapability(token, "pairing", secret, claims.exp + 1)).toThrow(/Invalid Arena capability/);
    expect(() => openCapability(sealCapability({ ...claims, authorityClass: "authoritative" }, secret), "pairing", secret, now + 1)).toThrow(/Invalid Arena capability/);
    expect(() => openCapability(sealCapability({ ...claims, unexpected: true }, secret), "pairing", secret, now + 1)).toThrow(/Invalid Arena capability/);
  });

  it("mints a distinct session capability tied to the pairing jti", () => {
    const session = createSessionClaims(pairing(), now + 5);
    const opened = openCapability(sealCapability(session, secret), "session", secret, now + 6);
    expect(opened.ticketJtiHash).toMatch(/^[a-f0-9]{64}$/);
    expect(opened.kind).toBe("session");
    expect(opened.exp - opened.iat).toBeLessThanOrEqual(20 * 60);
    expect(opened.exp).toBe(Math.floor(Date.parse(opened.hardExpiresAt) / 1_000));
  });
});
