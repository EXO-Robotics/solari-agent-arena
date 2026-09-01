export const MAX_CONTROLLER_BYTES = 24_000;

export function validateEvaluationRequest(body) {
  if (!body || typeof body !== "object") throw new Error("Request body must be an object.");
  if (typeof body.controller !== "string") throw new Error("Controller source must be a string.");
  const bytes = Buffer.byteLength(body.controller, "utf8");
  if (bytes === 0 || bytes > MAX_CONTROLLER_BYTES) throw new Error(`Controller must be between 1 and ${MAX_CONTROLLER_BYTES} bytes.`);
  if (!/\bfunction\s+control\s*\(/.test(body.controller)) throw new Error("Define function control(robot, dt).");
  const seed = Number(body.seed);
  if (!Number.isSafeInteger(seed) || seed < 0 || seed > 0xffff_ffff) throw new Error("Seed must be an integer from 0 through 4294967295.");
  return { controller: body.controller, seed, bytes };
}
