import { describe, expect, it } from "vitest";
import { REMOTE_HTTP_OPERATIONS, remoteHttpError, validateRemoteHttpCommand } from "./remote-http.mjs";

const capability = `saa1.${"a".repeat(48)}`;

describe("zero-install Arena HTTP commands", () => {
  it("accepts the exact five-operation command surface", () => {
    expect(REMOTE_HTTP_OPERATIONS).toEqual(["connect", "observe", "act", "finish", "disconnect"]);
    expect(validateRemoteHttpCommand({ schemaVersion: "solari.arena.http-command.v1", operation: "connect", ticket: capability })).toMatchObject({ operation: "connect" });
    expect(validateRemoteHttpCommand({ schemaVersion: "solari.arena.http-command.v1", operation: "observe", arenaSession: capability })).toMatchObject({ operation: "observe" });
    expect(validateRemoteHttpCommand({ schemaVersion: "solari.arena.http-command.v1", operation: "act", arenaSession: capability, expectedSequence: 0, drive: 1, turn: -0.2, durationMs: 800 })).toMatchObject({ operation: "act" });
    expect(validateRemoteHttpCommand({ schemaVersion: "solari.arena.http-command.v1", operation: "finish", arenaSession: capability })).toMatchObject({ operation: "finish" });
    expect(validateRemoteHttpCommand({ schemaVersion: "solari.arena.http-command.v1", operation: "disconnect", arenaSession: capability })).toMatchObject({ operation: "disconnect" });
  });

  it("rejects unknown fields, missing capabilities, and actions outside public bounds", () => {
    expect(() => validateRemoteHttpCommand({ schemaVersion: "solari.arena.http-command.v1", operation: "connect", ticket: capability, extra: true })).toThrow(/Invalid Arena HTTP command/);
    expect(() => validateRemoteHttpCommand({ schemaVersion: "solari.arena.http-command.v1", operation: "observe", arenaSession: "short" })).toThrow(/Invalid Arena HTTP command/);
    expect(() => validateRemoteHttpCommand({ schemaVersion: "solari.arena.http-command.v1", operation: "act", arenaSession: capability, expectedSequence: 0, drive: 99, turn: 0, durationMs: 800 })).toThrow(/Invalid Arena HTTP command/);
    expect(() => validateRemoteHttpCommand({ schemaVersion: "solari.arena.http-command.v0", operation: "disconnect", arenaSession: capability })).toThrow(/Invalid Arena HTTP command/);
  });

  it("maps configuration, capability, and sequencing failures without reflecting infrastructure", () => {
    expect(remoteHttpError(new Error("Hosted Agent Practice is paused on this deployment."))).toMatchObject({ status: 503 });
    expect(remoteHttpError(new Error("Invalid Arena capability."))).toMatchObject({ status: 401 });
    expect(remoteHttpError(new Error("expectedSequence is outside the action budget."))).toMatchObject({ status: 409 });
    expect(remoteHttpError(new Error("wss://private.example/session"))).toEqual({ status: 502, error: "Arena request failed safely. No authoritative result was created." });
  });
});
