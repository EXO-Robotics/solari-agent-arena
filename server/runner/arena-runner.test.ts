import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const exec = promisify(execFile);

async function runFixture(name: string, seed = 42) {
  const temp = await mkdtemp(join(tmpdir(), "arena-runner-test-"));
  const input = join(temp, "input.json");
  const output = join(temp, "result.json");
  const controller = await readFile(join(process.cwd(), "qualification/fixtures", name), "utf8");
  await writeFile(input, JSON.stringify({ controller, seed }));
  try {
    const result = await exec(process.execPath, ["server/runner/arena-runner.mjs", input, "src/model/h1-sagittal.xml", output], {
      cwd: process.cwd(), maxBuffer: 5 * 1024 * 1024,
    });
    return { ...result, artifact: JSON.parse(await readFile(output, "utf8")) };
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
}

describe("authoritative runner", () => {
  it("is deterministic for an identical controller and seed", async () => {
    const first = (await runFixture("valid-controller.js")).artifact;
    const second = (await runFixture("valid-controller.js")).artifact;
    expect(first.telemetry.hash).toBe(second.telemetry.hash);
    expect(first.metrics).toEqual(second.metrics);
    expect(first.metrics).toMatchObject({ checkpoints: 4, checkpointsTotal: 4, collisions: 0 });
  }, 20_000);

  it("preserves the full uint32 seed space, including zero", async () => {
    const zero = (await runFixture("valid-controller.js", 0)).artifact;
    const high = (await runFixture("valid-controller.js", 0xffff_ffff)).artifact;
    expect(zero.telemetry.hash).not.toBe(high.telemetry.hash);
  }, 20_000);

  it("interrupts a hanging controller", async () => {
    await expect(runFixture("hanging-controller.js")).rejects.toMatchObject({ code: 124 });
  }, 10_000);

  it("does not expose Node capabilities to the controller", async () => {
    await expect(runFixture("capability-attempt-controller.js")).rejects.toMatchObject({ code: 1 });
  }, 10_000);
});
