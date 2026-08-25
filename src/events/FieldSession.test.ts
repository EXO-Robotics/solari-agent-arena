import { describe, expect, it } from "vitest";
import { FieldSession } from "./FieldSession";
import type { SensorFrame } from "../sim/types";

function frame(overrides: Partial<SensorFrame> = {}): SensorFrame {
  return {
    time: 0,
    position: 0,
    lateral: 0,
    height: 0.89,
    velocity: 0,
    yaw: 0,
    imu: { pitch: 0, roll: 0, pitchRate: 0, accel: [0, 0, 0] },
    feet: { left: 250, right: 250 },
    joints: {} as SensorFrame["joints"],
    ...overrides,
  };
}

describe("FieldSession", () => {
  it("accumulates two-dimensional exploration distance", () => {
    const session = new FieldSession();
    session.ready();
    session.start(2, frame());
    session.update(frame({ time: 3, position: 3, lateral: 4, velocity: 5 }));
    expect(session.elapsed).toBe(1);
    expect(session.distance).toBe(0);
    session.update(frame({ time: 3.1, position: 3.3, lateral: 4.3, velocity: 5 }));
    expect(session.distance).toBeCloseTo(Math.hypot(0.3, 0.3));
  });

  it("does not advance while paused", () => {
    const session = new FieldSession();
    session.ready();
    session.start(0, frame());
    session.update(frame({ time: 2, position: 0.2 }));
    session.pause();
    session.update(frame({ time: 8, position: 4 }));
    expect(session.elapsed).toBe(2);
    session.resume(8, frame({ time: 8, position: 4 }));
    session.update(frame({ time: 9, position: 4.2 }));
    expect(session.elapsed).toBe(3);
  });

  it("freezes a fall result", () => {
    const session = new FieldSession();
    session.ready();
    session.start(0, frame());
    session.update(frame({ time: 1, position: 0.2 }));
    session.fall(frame({ time: 2, position: 0.3 }), 100);
    expect(session.phase).toBe("fallen");
    expect(session.result).toMatchObject({ time: 2, energy: 100 });
    expect(Object.isFrozen(session.result)).toBe(true);
  });
});
