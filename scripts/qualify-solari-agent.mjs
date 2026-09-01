import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { evaluateAgentTranscriptInSolari } from "../server/lib/solari-agent-evaluator.mjs";

const apiKey = process.env.SOLARI_API_KEY;
if (!apiKey) throw new Error("SOLARI_API_KEY is required for live agent qualification.");
const template = process.env.SOLARI_SANDBOX_TEMPLATE || "base";
const outputDir = resolve(process.argv[2] ?? "public/evidence");
const transcript = JSON.parse(await readFile("fixtures/agents/valid-transcript.json", "utf8"));
await mkdir(outputDir, { recursive: true });

const runs = [];
for (const label of ["valid-agent", "valid-agent-repeat"]) {
  const run = await evaluateAgentTranscriptInSolari({
    transcript, agentLabel: "qualification-scripted-agent", runId: randomUUID(), startedAt: new Date().toISOString(), apiKey, template,
  });
  if (run.outcome.status !== "succeeded" || run.outcome.reason !== "course_complete") throw new Error(`${label}: course did not complete.`);
  if (run.metrics.checkpoints !== 5 || run.metrics.collisions !== 0) throw new Error(`${label}: qualification metrics mismatch.`);
  if (!run.execution.sandboxTerminated) throw new Error(`${label}: Sandbox teardown was not confirmed.`);
  const path = resolve(outputDir, `${label}.solari-run.json`);
  await writeFile(path, `${JSON.stringify(run, null, 2)}\n`, { mode: 0o644 });
  runs.push(run);
}
if (runs[0].telemetry.hash !== runs[1].telemetry.hash || JSON.stringify(runs[0].metrics) !== JSON.stringify(runs[1].metrics)) {
  throw new Error("Repeated isolated transcript replay was not deterministic.");
}
await writeFile(resolve(outputDir, "agent-qualification-summary.json"), `${JSON.stringify({
  schemaVersion: "solari.arena.agent-qualification.v1", generatedAt: new Date().toISOString(), seed: transcript.seed,
  courseId: transcript.courseId, transcriptHash: runs[0].transcriptHash, deterministicRepeat: true,
  cases: runs.map((run, index) => ({
    case: index === 0 ? "valid-agent" : "valid-agent-repeat", runId: run.runId, outcome: run.outcome,
    metrics: run.metrics, telemetryHash: run.telemetry.hash, resultHash: run.resultHash, sandboxTerminated: run.execution.sandboxTerminated,
  })),
}, null, 2)}\n`, { mode: 0o644 });
console.log(JSON.stringify(runs.map((run) => ({ runId: run.runId, outcome: run.outcome, metrics: run.metrics, telemetryHash: run.telemetry.hash })), null, 2));
