import { describe, expect, it } from "vitest";
import { TelemetryBuffer } from "./TelemetryBuffer";
import type { TelemetrySample } from "../sim/types";

const sample = (time: number, speed = time): TelemetrySample => ({
  time,
  distance: time,
  speed,
  pitch: 0,
  energy: time * 10,
  leftForce: 200,
  rightForce: 220,
  drive: 0.5,
});

describe("TelemetryBuffer", () => {
  it("is bounded and stores immutable snapshots", () => {
    const buffer = new TelemetryBuffer(2);
    const first = sample(1);
    buffer.push(first);
    first.speed = 99;
    buffer.push(sample(2));
    buffer.push(sample(3));
    expect(buffer.samples()).toHaveLength(2);
    expect(buffer.samples()[0]?.time).toBe(2);
  });

  it("drops non-finite samples and emits valid chart points", () => {
    const buffer = new TelemetryBuffer();
    buffer.push(sample(0, Number.NaN));
    buffer.push(sample(0, 0));
    buffer.push(sample(1, 2));
    expect(buffer.samples()).toHaveLength(2);
    expect(buffer.points("speed", 100, 20)).toBe("0.0,20.0 100.0,0.0");
  });
});
