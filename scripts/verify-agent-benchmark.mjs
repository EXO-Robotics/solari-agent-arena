import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Solari } from "@solarisdk/browser";
import { canonicalJson, sha256 } from "../server/lib/evidence.mjs";

const deploymentUrl = process.env.DEPLOYMENT_URL;
const artifactPath = process.env.EVIDENCE_FILE || "public/evidence/valid-agent.solari-run.json";
const publicArtifactPath = process.env.EVIDENCE_PUBLIC_PATH || "/evidence/valid-agent.solari-run.json";
if (!process.env.SOLARI_API_KEY) throw new Error("SOLARI_API_KEY is required for the agent benchmark verifier.");
if (!deploymentUrl) throw new Error("DEPLOYMENT_URL is required.");

const artifact = JSON.parse(await readFile(artifactPath, "utf8"));
const transcript = JSON.parse(await readFile("fixtures/agents/valid-transcript.json", "utf8"));
if (sha256(artifact.telemetry.samples) !== artifact.telemetry.hash) throw new Error("Agent artifact telemetry hash mismatch.");
const withoutHash = { ...artifact }; delete withoutHash.resultHash;
if (sha256(withoutHash) !== artifact.resultHash) throw new Error("Agent artifact result hash mismatch.");
if (sha256(transcript) !== artifact.transcriptHash) throw new Error("Fixture transcript does not match the authoritative artifact.");

const evidenceDir = join("evidence", "agent-e2e", artifact.runId);
await mkdir(evidenceDir, { recursive: true });
const client = new Solari({ apiKey: process.env.SOLARI_API_KEY });
const browser = await client.launch({ recording: true });
const sessionId = browser.id; const startedAt = new Date().toISOString(); let replayBytes;
const observations = { agentToolApiVersion: "", zeroCostObservation: false, browserTrial: {}, artifact: {}, replayState: "" };

try {
  const page = await browser.newPage();
  const trialUrl = new URL(deploymentUrl); trialUrl.searchParams.set("agent", "1");
  await page.goto(trialUrl.href, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.getByTestId("agent-phase").waitFor({ timeout: 60_000 });
  observations.agentToolApiVersion = await page.getByTestId("agent-interface").getAttribute("data-api-version");
  if (observations.agentToolApiVersion !== "solari.arena.agent-tools.v1") throw new Error("Agent tool API version mismatch.");
  await page.locator("#agent-seed").fill(String(transcript.seed));
  await page.getByRole("button", { name: "RESET TRIAL" }).click();
  const before = await page.getByTestId("agent-time").innerText();
  await new Promise((resolve) => setTimeout(resolve, 750));
  const after = await page.getByTestId("agent-time").innerText();
  observations.zeroCostObservation = before.trim() === "0.00 S" && after.trim() === "0.00 S";
  if (!observations.zeroCostObservation) throw new Error("Observation/thinking advanced simulated time.");
  const execute = page.getByTestId("agent-execute");
  for (const action of transcript.actions) {
    await page.locator("#agent-drive").fill(String(action.drive));
    await page.locator("#agent-turn").fill(String(action.turn));
    await page.locator("#agent-duration").fill(String(action.durationMs));
    await execute.click();
    await page.waitForFunction((receipt) => document.querySelector('[data-testid="agent-execute"]')?.getAttribute("data-receipt") === receipt, String(action.sequence), { timeout: 10_000 });
  }
  const observedTranscript = JSON.parse(await page.getByTestId("agent-transcript-json").inputValue());
  if (canonicalJson(observedTranscript) !== canonicalJson(transcript)) throw new Error("Rendered browser trial transcript differs from the fixture.");
  const finalObservation = {
    phase: (await page.getByTestId("agent-phase").innerText()).trim().toLowerCase(),
    checkpoints: (await page.getByTestId("agent-checkpoints").innerText()).trim(),
    collisions: Number((await page.getByTestId("agent-collisions").innerText()).trim()),
    actions: (await page.getByTestId("agent-actions").innerText()).trim(),
    simulatedTime: (await page.getByTestId("agent-time").innerText()).trim(),
  };
  if (finalObservation.phase !== "complete" || finalObservation.checkpoints !== "5 / 5" || finalObservation.collisions !== 0) {
    throw new Error(`Browser trial did not complete cleanly: ${JSON.stringify(finalObservation)}`);
  }
  observations.browserTrial = finalObservation;
  await page.screenshot({ path: join(evidenceDir, "agent-course-complete.png"), fullPage: true });

  const replayUrl = new URL(deploymentUrl); replayUrl.searchParams.set("evidence", publicArtifactPath);
  await page.goto(replayUrl.href, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForFunction((expectedHash) => document.querySelector('[data-testid="controller-hash"]')?.textContent?.trim() === expectedHash, artifact.controllerHash, { timeout: 60_000 });
  const fields = ["run-id", "controller-hash", "outcome", "checkpoints", "score", "time", "collisions", "seed", "telemetry-hash", "result-hash"];
  for (const field of fields) observations.artifact[field] = (await page.getByTestId(field).innerText()).trim();
  const expected = {
    "run-id": artifact.runId, "controller-hash": artifact.controllerHash, outcome: artifact.outcome.status.toUpperCase(),
    checkpoints: `${artifact.metrics.checkpoints} / ${artifact.metrics.checkpointsTotal}`, score: artifact.metrics.score.toLocaleString("en-US"),
    time: `${artifact.metrics.timeSeconds.toFixed(2)} S`, collisions: String(artifact.metrics.collisions), seed: String(artifact.seed),
    "telemetry-hash": artifact.telemetry.hash, "result-hash": artifact.resultHash,
  };
  for (const [field, value] of Object.entries(expected)) if (observations.artifact[field] !== value) throw new Error(`${field} mismatch.`);
  await page.screenshot({ path: join(evidenceDir, "authoritative-artifact-loaded.png"), fullPage: true });
  await page.getByRole("button", { name: "PLAY INTEGRITY-CHECKED REPLAY" }).click();
  await page.waitForFunction(() => document.querySelector('[data-testid="replay-state"]')?.getAttribute("data-state") === "complete", null, { timeout: 45_000 });
  observations.replayState = (await page.getByTestId("replay-state").innerText()).trim();
  if (observations.replayState !== "COMPLETE") throw new Error("Authoritative replay did not complete.");
  await page.screenshot({ path: join(evidenceDir, "authoritative-replay-complete.png"), fullPage: true });
} finally { await browser.close(); }

try {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try { replayBytes = await client.sessions.downloadReplay(sessionId); break; }
    catch (error) { if (attempt === 19) throw error; await new Promise((resolve) => setTimeout(resolve, 1_500)); }
  }
} finally { await client.close(); }
if (!replayBytes) throw new Error("Solari Browser recording was unavailable.");
await writeFile(join(evidenceDir, "solari-browser-replay.ndjson"), replayBytes);
const hashes = {
  artifact: artifact.resultHash, transcript: artifact.transcriptHash,
  trialScreenshot: sha256(await readFile(join(evidenceDir, "agent-course-complete.png"))),
  artifactScreenshot: sha256(await readFile(join(evidenceDir, "authoritative-artifact-loaded.png"))),
  replayScreenshot: sha256(await readFile(join(evidenceDir, "authoritative-replay-complete.png"))), browserReplay: sha256(replayBytes),
};
await writeFile(join(evidenceDir, "hashes.json"), `${JSON.stringify(hashes, null, 2)}\n`);
await writeFile(join(evidenceDir, "assertions.json"), `${JSON.stringify({
  schemaVersion: "solari.arena.agent-browser-proof.v1", deployedUrl: deploymentUrl,
  deploymentCommit: process.env.DEPLOYMENT_COMMIT || "unreported", runId: artifact.runId, sessionIdHash: sha256(sessionId),
  startedAt, completedAt: new Date().toISOString(), observations, hashes, passed: true,
}, null, 2)}\n`);
console.log(`Solari agent benchmark verification passed: ${evidenceDir}`);
