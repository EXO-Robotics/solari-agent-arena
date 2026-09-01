import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const exec = promisify(execFile);

async function runTranscript() {
  const temp = await mkdtemp(join(tmpdir(), "agent-runner-test-"));
  try {
    const transcript = JSON.parse(await readFile("fixtures/agents/valid-transcript.json", "utf8"));
    const input = join(temp, "input.json"); const output = join(temp, "result.json");
    await writeFile(input, JSON.stringify({ transcript }));
    await exec(process.execPath, ["server/runner/agent-runner.mjs", input, "src/model/h1-sagittal.xml", "src/agent/course.json", output], {
      cwd: process.cwd(), maxBuffer: 8 * 1024 * 1024,
    });
    return JSON.parse(await readFile(output, "utf8"));
  } finally { await rm(temp, { recursive: true, force: true }); }
}

describe("authoritative agent transcript runner", () => {
  it("completes the frozen obstacle course with the valid transcript", async () => {
    const artifact = await runTranscript();
    expect(artifact).toMatchObject({ outcome: "course_complete", metrics: { checkpoints: 5, checkpointsTotal: 5, collisions: 0 } });
    expect(artifact.metrics.actionsUsed).toBe(21);
  }, 20_000);

  it("is deterministic for an identical transcript and seed", async () => {
    const first = await runTranscript(); const second = await runTranscript();
    expect(first.telemetry.hash).toBe(second.telemetry.hash);
    expect(first.metrics).toEqual(second.metrics);
    expect(first.actionResults).toEqual(second.actionResults);
  }, 20_000);
});
