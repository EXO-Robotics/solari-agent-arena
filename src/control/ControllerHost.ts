import { ACTUATOR_NAMES, type ActuatorTargets, type ControllerResult, type SensorFrame } from "../sim/types";

const STEP_TIMEOUT_MS = 80;

export class ControllerHost extends EventTarget {
  private worker: Worker | null = null;
  private pendingStep = 0;
  private timeoutId: number | null = null;
  private source = "";
  targets: Partial<ActuatorTargets> = {};
  drive = 0;
  turn = 0;
  error = "";

  constructor() {
    super();
    this.createWorker();
  }

  compile(source: string): void {
    this.source = source;
    this.error = "";
    this.targets = {};
    this.drive = 0;
    this.turn = 0;
    this.restartWorker();
    this.worker?.postMessage({ type: "compile", source });
  }

  step(frame: SensorFrame, dt: number): void {
    if (!this.worker || this.pendingStep !== 0 || this.error) return;
    const id = Date.now() + Math.random();
    this.pendingStep = id;
    this.worker.postMessage({ type: "step", id, frame, dt });
    this.timeoutId = window.setTimeout(() => {
      if (this.pendingStep !== id) return;
      this.error = "Controller exceeded the 80 ms watchdog and was stopped.";
      this.dispatchEvent(new CustomEvent("error", { detail: this.error }));
      this.restartWorker(false);
    }, STEP_TIMEOUT_MS);
  }

  dispose(): void {
    this.clearTimeout();
    this.worker?.terminate();
    this.worker = null;
  }

  private createWorker(): void {
    this.worker = new Worker(new URL("./controller.worker.ts", import.meta.url), { type: "module" });
    this.worker.onmessage = (event: MessageEvent) => this.onMessage(event.data as Record<string, unknown>);
    this.worker.onerror = (event) => {
      this.error = event.message || "Controller worker failed.";
      this.dispatchEvent(new CustomEvent("error", { detail: this.error }));
    };
  }

  private restartWorker(recompile = true): void {
    this.clearTimeout();
    this.pendingStep = 0;
    this.worker?.terminate();
    this.createWorker();
    if (recompile && this.source) this.worker?.postMessage({ type: "compile", source: this.source });
  }

  private onMessage(message: Record<string, unknown>): void {
    if (message.type === "compiled") {
      this.dispatchEvent(new Event("compiled"));
      return;
    }
    if (message.type === "compile-error") {
      this.error = String(message.error);
      this.dispatchEvent(new CustomEvent("error", { detail: this.error }));
      return;
    }
    if (message.type === "result" && message.id === this.pendingStep) {
      this.clearTimeout();
      this.pendingStep = 0;
      const candidate = (message.result as ControllerResult | undefined)?.targets ?? {};
      const safe: Partial<ActuatorTargets> = {};
      for (const name of ACTUATOR_NAMES) {
        const value = candidate[name];
        if (typeof value === "number" && Number.isFinite(value)) safe[name] = value;
      }
      this.targets = safe;
      const drive = (message.result as ControllerResult | undefined)?.drive;
      this.drive = typeof drive === "number" && Number.isFinite(drive)
        ? Math.max(0, Math.min(3, drive))
        : 0;
      const turn = (message.result as ControllerResult | undefined)?.turn;
      this.turn = typeof turn === "number" && Number.isFinite(turn)
        ? Math.max(-1.8, Math.min(1.8, turn))
        : 0;
      return;
    }
    if (message.type === "step-error" && message.id === this.pendingStep) {
      this.clearTimeout();
      this.pendingStep = 0;
      this.error = String(message.error);
      this.dispatchEvent(new CustomEvent("error", { detail: this.error }));
    }
  }

  private clearTimeout(): void {
    if (this.timeoutId !== null) window.clearTimeout(this.timeoutId);
    this.timeoutId = null;
  }
}
