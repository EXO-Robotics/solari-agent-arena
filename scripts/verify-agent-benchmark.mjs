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
const observations = { siteTools: [], zeroCostObservation: false, browserTrial: {}, artifact: {}, replayState: "" };

try {
  const page = await browser.newPage();
  await page.addInitScript(() => {
    const tools = new Map();
    Object.defineProperty(window, "__arenaSiteTools", { value: tools });
    Object.defineProperty(document, "modelContext", { value: { registerTool: async (tool) => { tools.set(tool.name, tool); } } });
  });
  const trialUrl = new URL(deploymentUrl); trialUrl.searchParams.set("agent", "1");
  await page.goto(trialUrl.href, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForFunction(() => window.__arenaSiteTools?.size === 4, null, { timeout: 60_000 });
  observations.siteTools = await page.evaluate(() => Array.from(window.__arenaSiteTools.keys()).sort());
  const expectedTools = ["arena_act", "arena_observe", "arena_reset", "arena_transcript"];
  if (JSON.stringify(observations.siteTools) !== JSON.stringify(expectedTools)) throw new Error(`Site tool registration mismatch: ${observations.siteTools.join(",")}`);
  const invoke = (name, input = {}) => page.evaluate(({ toolName, toolInput }) => window.__arenaSiteTools.get(toolName).execute(toolInput), { toolName: name, toolInput: input });
  await invoke("arena_reset", { seed: transcript.seed });
  const before = await invoke("arena_observe");
  await new Promise((resolve) => setTimeout(resolve, 750));
  const after = await invoke("arena_observe");
  observations.zeroCostObservation = before.simulatedTimeSeconds === 0 && after.simulatedTimeSeconds === 0;
  if (!observations.zeroCostObservation) throw new Error("Observation/thinking advanced simulated time.");
  let finalObservation = after;
  for (const action of transcript.actions) finalObservation = await invoke("arena_act", { drive: action.drive, turn: action.turn, durationMs: action.durationMs });
  const observedTranscript = await invoke("arena_transcript");
  if (canonicalJson(observedTranscript) !== canonicalJson(transcript)) throw new Error("Rendered browser trial transcript differs from the fixture.");
  if (finalObservation.phase !== "complete" || finalObservation.checkpoints.reached !== 5 || finalObservation.collisions !== 0) {
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
