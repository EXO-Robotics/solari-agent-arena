import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const exec = promisify(execFile);

describe("offline Sandbox runner bundle", () => {
  it("executes the evaluator with no package install", async () => {
    const temp = await mkdtemp(join(tmpdir(), "arena-bundle-test-"));
    try {
      await exec("tar", ["-xzf", "server/runner/runner-dependencies.tgz", "-C", temp], { cwd: process.cwd() });
      const [runner, model, controller] = await Promise.all([
        readFile("server/runner/arena-runner.mjs", "utf8"),
        readFile("src/model/h1-sagittal.xml", "utf8"),
        readFile("qualification/fixtures/valid-controller.js", "utf8"),
      ]);
      await Promise.all([
        writeFile(join(temp, "arena-runner.mjs"), runner),
        writeFile(join(temp, "model.xml"), model),
        writeFile(join(temp, "input.json"), JSON.stringify({ controller, seed: 42 })),
      ]);
      await exec(process.execPath, [join(temp, "arena-runner.mjs"), join(temp, "input.json"), join(temp, "model.xml"), join(temp, "result.json")], { maxBuffer: 5 * 1024 * 1024 });
      const artifact = JSON.parse(await readFile(join(temp, "result.json"), "utf8"));
      expect(artifact).toMatchObject({ metrics: { checkpoints: 4, collisions: 0 }, telemetry: { sampleCount: 200 } });
    } finally {
      await rm(temp, { recursive: true, force: true });
    }
  }, 20_000);
});
