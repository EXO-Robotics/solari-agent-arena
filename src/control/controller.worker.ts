import type { ControllerResult, SensorFrame } from "../sim/types";

type ControllerFn = (robot: SensorFrame, dt: number) => ControllerResult;
let controller: ControllerFn | null = null;

self.onmessage = (event: MessageEvent) => {
  const message = event.data as
    | { type: "compile"; source: string }
    | { type: "step"; id: number; frame: SensorFrame; dt: number };

  if (message.type === "compile") {
    try {
      const factory = new Function(
        `"use strict";\n${message.source}\nif (typeof control !== "function") throw new Error("Define function control(robot, dt)");\nreturn control;`,
      ) as () => ControllerFn;
      controller = factory();
      self.postMessage({ type: "compiled" });
    } catch (error) {
      self.postMessage({ type: "compile-error", error: String(error) });
    }
    return;
  }

  if (!controller) {
    self.postMessage({ type: "step-error", id: message.id, error: "Controller is not compiled." });
    return;
  }

  try {
    const result = controller(message.frame, message.dt);
    self.postMessage({ type: "result", id: message.id, result });
  } catch (error) {
    self.postMessage({ type: "step-error", id: message.id, error: String(error) });
  }
};
