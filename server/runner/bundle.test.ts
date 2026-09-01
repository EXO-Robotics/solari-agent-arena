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
      const [runner, agentRunner, model, controller, course, transcript] = await Promise.all([
        readFile("server/runner/arena-runner.mjs", "utf8"),
        readFile("server/runner/agent-runner.mjs", "utf8"),
        readFile("src/model/h1-sagittal.xml", "utf8"),
        readFile("qualification/fixtures/valid-controller.js", "utf8"),
        readFile("src/agent/course.json", "utf8"),
        readFile("fixtures/agents/valid-transcript.json", "utf8"),
      ]);
      await Promise.all([
        writeFile(join(temp, "arena-runner.mjs"), runner),
        writeFile(join(temp, "agent-runner.mjs"), agentRunner),
        writeFile(join(temp, "model.xml"), model),
        writeFile(join(temp, "course.json"), course),
        writeFile(join(temp, "input.json"), JSON.stringify({ controller, seed: 42 })),
        writeFile(join(temp, "agent-input.json"), JSON.stringify({ transcript: JSON.parse(transcript) })),
      ]);
      await exec(process.execPath, [join(temp, "arena-runner.mjs"), join(temp, "input.json"), join(temp, "model.xml"), join(temp, "result.json")], { maxBuffer: 5 * 1024 * 1024 });
      await exec(process.execPath, [join(temp, "agent-runner.mjs"), join(temp, "agent-input.json"), join(temp, "model.xml"), join(temp, "course.json"), join(temp, "agent-result.json")], { maxBuffer: 8 * 1024 * 1024 });
      const artifact = JSON.parse(await readFile(join(temp, "result.json"), "utf8"));
      const agentArtifact = JSON.parse(await readFile(join(temp, "agent-result.json"), "utf8"));
      expect(artifact).toMatchObject({ metrics: { checkpoints: 4, collisions: 0 }, telemetry: { sampleCount: 200 } });
      expect(agentArtifact).toMatchObject({ outcome: "course_complete", metrics: { checkpoints: 5, collisions: 0 } });
    } finally {
      await rm(temp, { recursive: true, force: true });
    }
  }, 20_000);
});
