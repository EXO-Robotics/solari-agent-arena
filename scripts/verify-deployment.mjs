import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Solari } from "@solarisdk/browser";
import { canonicalJson, sha256 } from "../server/lib/evidence.mjs";

const deploymentUrl = process.env.DEPLOYMENT_URL;
const artifactPath = process.env.EVIDENCE_FILE;
const publicArtifactPath = process.env.EVIDENCE_PUBLIC_PATH;
if (!process.env.SOLARI_API_KEY) throw new Error("SOLARI_API_KEY is required server-side for the verifier.");
if (!deploymentUrl || !artifactPath || !publicArtifactPath) {
  throw new Error("Set DEPLOYMENT_URL, EVIDENCE_FILE, and EVIDENCE_PUBLIC_PATH.");
}

const artifact = JSON.parse(await readFile(artifactPath, "utf8"));
const telemetryHash = sha256(artifact.telemetry.samples);
const withoutResultHash = { ...artifact };
delete withoutResultHash.resultHash;
if (telemetryHash !== artifact.telemetry.hash) throw new Error("Local artifact telemetry hash mismatch.");
if (sha256(withoutResultHash) !== artifact.resultHash) throw new Error("Local artifact result hash mismatch.");

const evidenceDir = join("evidence", "e2e", artifact.runId);
await mkdir(evidenceDir, { recursive: true });
const target = new URL(deploymentUrl);
target.searchParams.set("evidence", publicArtifactPath);
const client = new Solari({ apiKey: process.env.SOLARI_API_KEY });
const browser = await client.launch({ recording: true });
const sessionId = browser.id;
const startedAt = new Date().toISOString();
const observations = {};
let replayBytes;

try {
  const page = await browser.newPage();
  await page.goto(target.href, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForFunction((expectedHash) => document.querySelector('[data-testid="controller-hash"]')?.textContent?.trim() === expectedHash, artifact.controllerHash, { timeout: 60_000 });
  const fields = ["run-id", "controller-hash", "outcome", "checkpoints", "score", "time", "collisions", "seed", "telemetry-hash", "result-hash"];
  for (const field of fields) observations[field] = (await page.getByTestId(field).innerText()).trim();
  const expected = {
    "run-id": artifact.runId,
    "controller-hash": artifact.controllerHash,
    outcome: artifact.outcome.status.toUpperCase(),
    checkpoints: `${artifact.metrics.checkpoints} / ${artifact.metrics.checkpointsTotal}`,
    score: artifact.metrics.score.toLocaleString("en-US"),
    time: `${artifact.metrics.timeSeconds.toFixed(2)} S`,
    collisions: String(artifact.metrics.collisions),
    seed: String(artifact.seed),
    "telemetry-hash": artifact.telemetry.hash,
    "result-hash": artifact.resultHash,
  };
  for (const [field, value] of Object.entries(expected)) {
    if (observations[field] !== value) throw new Error(`${field} mismatch: expected ${value}, observed ${observations[field]}`);
  }
  await page.screenshot({ path: join(evidenceDir, "loaded.png"), fullPage: true });
  await page.getByRole("button", { name: "PLAY INTEGRITY-CHECKED REPLAY" }).click();
  await page.waitForFunction(() => document.querySelector('[data-testid="replay-state"]')?.getAttribute("data-state") === "complete", null, { timeout: 30_000 });
  observations.replayState = (await page.getByTestId("replay-state").innerText()).trim();
  if (observations.replayState !== "COMPLETE") throw new Error("Replay did not complete.");
  await page.screenshot({ path: join(evidenceDir, "replay-complete.png"), fullPage: true });
} finally {
  await browser.close();
}

try {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try { replayBytes = await client.sessions.downloadReplay(sessionId); break; }
    catch (error) {
      if (attempt === 19) throw error;
      await new Promise((resolve) => setTimeout(resolve, 1_500));
    }
  }
} finally {
  await client.close();
}

if (!replayBytes) throw new Error("Solari Browser replay recording was not available.");
await writeFile(join(evidenceDir, "solari-browser-replay.ndjson"), replayBytes);
const hashes = {
  artifact: artifact.resultHash,
  telemetry: telemetryHash,
  loadedScreenshot: sha256(await readFile(join(evidenceDir, "loaded.png"))),
  completedScreenshot: sha256(await readFile(join(evidenceDir, "replay-complete.png"))),
  browserReplay: sha256(replayBytes),
};
await writeFile(join(evidenceDir, "hashes.json"), `${canonicalJson(hashes)}\n`);
await writeFile(join(evidenceDir, "assertions.json"), `${JSON.stringify({
  schemaVersion: "solari.arena.browser-proof.v1",
  deployedUrl: target.href,
  deploymentCommit: process.env.DEPLOYMENT_COMMIT ?? "unreported",
  runId: artifact.runId,
  sessionIdHash: sha256(sessionId),
  startedAt,
  completedAt: new Date().toISOString(),
  assertions: observations,
  hashes,
  passed: true,
}, null, 2)}\n`);

console.log(`Solari Browser verification passed: ${evidenceDir}`);
