import { describe, expect, it } from "vitest";
import type { SensorFrame } from "../sim/types";
import { AgentTrial } from "./AgentTrial";
import { AGENT_COURSE } from "./contract";

function frame(x = 0, y = 0, time = 0): SensorFrame {
  return {
    time, position: x, lateral: y, height: 0.89, velocity: 0, yaw: 0,
    imu: { pitch: 0, roll: 0, pitchRate: 0, accel: [0, 0, 0] },
    feet: { left: 0, right: 0 }, joints: {} as SensorFrame["joints"],
  };
}

describe("AgentTrial", () => {
  it("records bounded actions and sequential checkpoints", () => {
    const trial = new AgentTrial();
    trial.reset(42, 0);
    trial.recordAction({ drive: 1, turn: 0.2, durationMs: 500 });
    for (const checkpoint of AGENT_COURSE.checkpoints) trial.update(frame(checkpoint.x, checkpoint.y, 1), false, false);
    expect(trial.observation(frame()).phase).toBe("complete");
    expect(trial.transcript()).toMatchObject({ seed: 42, actions: [{ sequence: 0, durationMs: 500 }] });
  });

  it("counts collision edges and rejects out-of-contract actions", () => {
    const trial = new AgentTrial();
    trial.reset(0xffffffff, 0);
    trial.update(frame(), true, false);
    trial.update(frame(), true, false);
    trial.update(frame(), false, false);
    trial.update(frame(), true, false);
    expect(trial.observation(frame()).collisions).toBe(2);
    expect(() => trial.recordAction({ drive: 99, turn: 0, durationMs: 500 })).toThrow(/drive/);
    expect(() => trial.recordAction({ drive: 0, turn: 0, durationMs: 99 })).toThrow(/durationMs/);
  });

  it("enforces the total simulated-time budget before recording an action", () => {
    const trial = new AgentTrial();
    trial.reset(42, 0);
    for (let index = 0; index < 30; index += 1) trial.recordAction({ drive: 0, turn: 0, durationMs: 2_000 });
    expect(() => trial.recordAction({ drive: 0, turn: 0, durationMs: 100 })).toThrow(/time budget/);
  });

  it("executes a repeated expected sequence at most once", () => {
    const trial = new AgentTrial();
    trial.reset(42, 0);
    expect(trial.recordAction({ expectedSequence: 0, drive: 1, turn: 0, durationMs: 400 })).toMatchObject({ sequence: 0 });
    expect(() => trial.recordAction({ expectedSequence: 0, drive: 1, turn: 0, durationMs: 400 })).toThrow(/Expected action sequence 1/);
    expect(trial.transcript().actions).toHaveLength(1);
  });
});
