import type { TelemetrySample } from "../sim/types";

export class TelemetryBuffer {
  private readonly values: TelemetrySample[] = [];

  constructor(private readonly capacity = 600) {}

  push(sample: TelemetrySample): void {
    if (Object.values(sample).some((value) => !Number.isFinite(value))) return;
    this.values.push(Object.freeze({ ...sample }));
    if (this.values.length > this.capacity) this.values.shift();
  }

  clear(): void {
    this.values.length = 0;
  }

  samples(): readonly TelemetrySample[] {
    return this.values;
  }

  points(key: keyof TelemetrySample, width: number, height: number): string {
    if (this.values.length < 2) return "";
    const values = this.values.map((sample) => sample[key]);
    const min = Math.min(...values, 0);
    const max = Math.max(...values, 1e-6);
    const span = Math.max(1e-6, max - min);
    return values
      .map((value, index) => {
        const x = (index / (values.length - 1)) * width;
        const y = height - ((value - min) / span) * height;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");
  }
}
