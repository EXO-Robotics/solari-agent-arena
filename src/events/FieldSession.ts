import type { RunPhase, SensorFrame } from "../sim/types";

export interface FieldResult {
  phase: "fallen";
  time: number;
  distance: number;
  topSpeed: number;
  energy: number;
  score: number;
}

export class FieldSession extends EventTarget {
  phase: RunPhase = "loading";
  startTime = 0;
  elapsed = 0;
  distance = 0;
  topSpeed = 0;
  result: FieldResult | null = null;
  private previousPosition: [number, number] | null = null;

  ready(): void {
    this.phase = "ready";
    this.emit();
  }

  countdown(): void {
    if (this.phase !== "ready") return;
    this.phase = "countdown";
    this.emit();
  }

  start(simulationTime: number, frame: SensorFrame): void {
    if (this.phase !== "countdown" && this.phase !== "ready") return;
    this.startTime = simulationTime;
    this.previousPosition = [frame.position, frame.lateral];
    this.phase = "running";
    this.emit();
  }

  pause(): void {
    if (this.phase !== "running") return;
    this.phase = "paused";
    this.emit();
  }

  resume(simulationTime: number, frame: SensorFrame): void {
    if (this.phase !== "paused") return;
    this.startTime = simulationTime - this.elapsed;
    this.previousPosition = [frame.position, frame.lateral];
    this.phase = "running";
    this.emit();
  }

  update(frame: SensorFrame): void {
    if (this.phase !== "running" || this.result) return;
    this.elapsed = frame.time - this.startTime;
    this.topSpeed = Math.max(this.topSpeed, Math.max(0, frame.velocity));
    if (this.previousPosition) {
      const stepDistance = Math.hypot(
        frame.position - this.previousPosition[0],
        frame.lateral - this.previousPosition[1],
      );
      if (stepDistance < 0.5) this.distance += stepDistance;
    }
    this.previousPosition = [frame.position, frame.lateral];
  }

  fall(frame: SensorFrame, energy: number): void {
    if (this.phase !== "running" || this.result) return;
    this.phase = "fallen";
    this.elapsed = frame.time - this.startTime;
    this.result = Object.freeze({
      phase: "fallen",
      time: this.elapsed,
      distance: this.distance,
      topSpeed: this.topSpeed,
      energy,
      score: Math.max(0, Math.round(this.distance * 1000 + this.elapsed * 10 - energy * 0.1)),
    });
    this.emit();
  }

  reset(): void {
    this.phase = "ready";
    this.startTime = 0;
    this.elapsed = 0;
    this.distance = 0;
    this.topSpeed = 0;
    this.result = null;
    this.previousPosition = null;
    this.emit();
  }

  private emit(): void {
    this.dispatchEvent(new Event("change"));
  }
}
