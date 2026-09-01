import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const exec = promisify(execFile);

async function runTranscript(transform: (value: Record<string, unknown>) => Record<string, unknown> = (value) => value) {
  const temp = await mkdtemp(join(tmpdir(), "agent-runner-test-"));
  try {
    const transcript = transform(JSON.parse(await readFile("fixtures/agents/valid-transcript.json", "utf8")));
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

  it("rejects an invalid transcript again inside the runner boundary", async () => {
    await expect(runTranscript((value) => ({ ...value, actions: [{ sequence: 0, drive: 1, turn: 0, durationMs: 5_000 }] }))).rejects.toMatchObject({ code: 1 });
  }, 10_000);

  it("reports only actions actually executed before course completion", async () => {
    const artifact = await runTranscript((value) => {
      const actions = [...value.actions as Array<Record<string, unknown>>, { sequence: 21, drive: 0, turn: 0, durationMs: 100 }];
      return { ...value, actions };
    });
    expect(artifact.metrics.actionsUsed).toBe(artifact.actionResults.length);
    expect(artifact.metrics.actionsUsed).toBe(21);
  }, 20_000);
});
