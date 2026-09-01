import { describe, expect, it } from "vitest";
import {
  assertAdmissionSweepReady, ensureAdmissionSweep, EXPIRY_SCHEMA_VERSION, publishAdmissionSweepProbe, SWEEP_CRON, SWEEP_SCHEDULE_ID,
} from "./remote-expiry-scheduler.mjs";

const arenaUrl = "https://arena.example/";
const body = JSON.stringify({ schemaVersion: EXPIRY_SCHEMA_VERSION, phase: "sweep" });

function readySchedule(overrides = {}) {
  return {
    scheduleId: SWEEP_SCHEDULE_ID,
    destination: "https://arena.example/api/arena-expire",
    cron: SWEEP_CRON,
    method: "POST",
    isPaused: false,
    body,
    ...overrides,
  };
}

describe("remote expiry schedule", () => {
  it("creates then reads back the exact active sweep", async () => {
    let createRequest;
    const client = {
      schedules: {
        async create(request) { createRequest = request; return { scheduleId: SWEEP_SCHEDULE_ID }; },
        async get() { return readySchedule({ body: undefined, bodyBase64: Buffer.from(body).toString("base64") }); },
      },
    };
    const result = await ensureAdmissionSweep(arenaUrl, client);
    expect(createRequest).toMatchObject({ scheduleId: SWEEP_SCHEDULE_ID, cron: SWEEP_CRON, method: "POST" });
    expect(result).toEqual({ scheduleId: SWEEP_SCHEDULE_ID, destination: "https://arena.example/api/arena-expire", cron: SWEEP_CRON, method: "POST", active: true });
  });

  it("fails closed when the sweep is paused or targets the wrong deployment", async () => {
    await expect(assertAdmissionSweepReady(arenaUrl, { schedules: { get: async () => readySchedule({ isPaused: true }) } })).rejects.toThrow("not ready");
    await expect(assertAdmissionSweepReady(arenaUrl, { schedules: { get: async () => readySchedule({ destination: "https://wrong.example/api/arena-expire" }) } })).rejects.toThrow("not ready");
  });

  it("fails closed when QStash cannot read the sweep", async () => {
    await expect(assertAdmissionSweepReady(arenaUrl, { schedules: { get: async () => { throw new Error("missing"); } } })).rejects.toThrow("unavailable");
  });

  it("publishes an immediate signed-delivery probe through QStash", async () => {
    let request;
    const result = await publishAdmissionSweepProbe(arenaUrl, { async publishJSON(value) { request = value; return { messageId: "msg_probe" }; } });
    expect(result).toEqual({ messageId: "msg_probe" });
    expect(request).toMatchObject({ url: "https://arena.example/api/arena-expire", retries: 5, body: { schemaVersion: EXPIRY_SCHEMA_VERSION, phase: "sweep" } });
  });
});
