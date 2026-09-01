import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { evaluateInSolari } from "../server/lib/solari-evaluator.mjs";

const apiKey = process.env.SOLARI_API_KEY;
if (!apiKey) throw new Error("SOLARI_API_KEY is required for live qualification.");

const outputDir = resolve(process.argv[2] ?? "public/evidence");
const template = process.env.SOLARI_SANDBOX_TEMPLATE || "base";
const cases = [
  { name: "valid", fixture: "qualification/fixtures/valid-controller.js", expected: "succeeded" },
  { name: "hanging", fixture: "qualification/fixtures/hanging-controller.js", expected: "timeout" },
  { name: "capability-attempt", fixture: "qualification/fixtures/capability-attempt-controller.js", expected: "rejected" },
  { name: "valid-after-failures", fixture: "qualification/fixtures/valid-controller.js", expected: "succeeded" },
];

await mkdir(outputDir, { recursive: true });
const completed = [];

for (const item of cases) {
  const controller = await readFile(item.fixture, "utf8");
  const run = await evaluateInSolari({
    controller,
    seed: 42,
    runId: randomUUID(),
    startedAt: new Date().toISOString(),
    apiKey,
    template,
  });

  if (run.outcome.status !== item.expected) {
    throw new Error(`${item.name}: expected ${item.expected}, received ${run.outcome.status} (${run.outcome.reason})`);
  }
  if (!run.execution.sandboxTerminated) throw new Error(`${item.name}: Sandbox teardown was not confirmed.`);
  if (item.expected === "succeeded" && (run.metrics.checkpoints !== 4 || run.metrics.collisions !== 0)) {
    throw new Error(`${item.name}: unexpected successful-run metrics.`);
  }

  const path = resolve(outputDir, `${item.name}.solari-run.json`);
  await writeFile(path, `${JSON.stringify(run, null, 2)}\n`, { mode: 0o644 });
  completed.push({
    case: item.name,
    path: relative(process.cwd(), path),
    status: run.outcome.status,
    resultHash: run.resultHash,
    telemetryHash: run.telemetry.hash,
    sandboxTerminated: run.execution.sandboxTerminated,
  });
}

const first = JSON.parse(await readFile(resolve(outputDir, "valid.solari-run.json"), "utf8"));
const last = JSON.parse(await readFile(resolve(outputDir, "valid-after-failures.solari-run.json"), "utf8"));
if (first.telemetry.hash !== last.telemetry.hash || JSON.stringify(first.metrics) !== JSON.stringify(last.metrics)) {
  throw new Error("The post-failure valid run did not reproduce the original deterministic result.");
}

await writeFile(resolve(outputDir, "qualification-summary.json"), `${JSON.stringify({
  generatedAt: new Date().toISOString(),
  schemaVersion: "solari.arena.qualification.v1",
  seed: 42,
  hostRecoveryProvedBy: "valid-after-failures",
  cases: completed,
}, null, 2)}\n`, { mode: 0o644 });

console.log(JSON.stringify(completed, null, 2));
