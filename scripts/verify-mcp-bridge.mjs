import { spawn } from "node:child_process";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const child = spawn(process.execPath, ["scripts/arena-mcp-server.mjs"], { cwd: process.cwd(), env: process.env, stdio: ["pipe", "pipe", "pipe"] });
let nextId = 1; let buffer = ""; let stderr = "";
const pending = new Map();
child.stderr.setEncoding("utf8"); child.stderr.on("data", (chunk) => { stderr += chunk; });
child.stdout.setEncoding("utf8");
child.stdout.on("data", (chunk) => {
  buffer += chunk;
  while (buffer.includes("\n")) {
    const index = buffer.indexOf("\n"); const line = buffer.slice(0, index); buffer = buffer.slice(index + 1);
    if (!line.trim()) continue;
    const message = JSON.parse(line); const entry = pending.get(message.id);
    if (!entry) continue;
    pending.delete(message.id); clearTimeout(entry.timer);
    if (message.error) entry.reject(new Error(JSON.stringify(message.error))); else entry.resolve(message.result);
  }
});
child.on("exit", (code) => {
  for (const entry of pending.values()) { clearTimeout(entry.timer); entry.reject(new Error(`MCP server exited ${code}: ${stderr.slice(0, 1_000)}`)); }
  pending.clear();
});

function request(method, params) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`MCP ${method} timed out.`)); }, 180_000);
    pending.set(id, { resolve, reject, timer });
    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
  });
}
function notify(method, params) { child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method, params })}\n`); }
async function callTool(name, args = {}) {
  const result = await request("tools/call", { name, arguments: args });
  if (result.isError) throw new Error(`${name} failed: ${result.content?.[0]?.text ?? "unknown error"}`);
  return result.structuredContent;
}

let arenaOpened = false;
let arenaClosed = false;
try {
  await request("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "arena-bridge-verifier", version: "1.0.0" } });
  notify("notifications/initialized", {});
  const listed = await request("tools/list", {});
  const names = listed.tools.map((tool) => tool.name).sort();
  const expected = ["arena_act", "arena_close", "arena_look", "arena_observe", "arena_open", "arena_reset", "arena_transcript"];
  if (JSON.stringify(names) !== JSON.stringify(expected)) throw new Error(`MCP tool list mismatch: ${names.join(",")}`);
  const opened = await callTool("arena_open", { seed: 42 });
  arenaOpened = true;
  const before = await callTool("arena_observe");
  await new Promise((resolve) => setTimeout(resolve, 750));
  const after = await callTool("arena_observe");
  if (opened.simulatedTimeSeconds !== 0 || before.simulatedTimeSeconds !== 0 || after.simulatedTimeSeconds !== 0) throw new Error("MCP observation advanced simulated time.");
  const boundaryAction = await callTool("arena_act", { drive: 1.2, turn: 0, durationMs: 800 });
  if (boundaryAction.actionsUsed !== 1 || Math.abs(boundaryAction.simulatedTimeSeconds - 0.8) > 0.01) throw new Error(`MCP action receipt mismatch: ${JSON.stringify(boundaryAction)}`);
  const resetObservation = await callTool("arena_reset", { seed: 42 });
  if (resetObservation.actionsUsed !== 0 || resetObservation.simulatedTimeSeconds !== 0) throw new Error(`MCP reset receipt mismatch: ${JSON.stringify(resetObservation)}`);
  const validTranscript = JSON.parse(await readFile("fixtures/agents/valid-transcript.json", "utf8"));
  let finalObservation = resetObservation;
  for (const action of validTranscript.actions) finalObservation = await callTool("arena_act", action);
  if (finalObservation.phase !== "complete" || finalObservation.checkpoints.reached !== finalObservation.checkpoints.total || finalObservation.collisions !== 0 || finalObservation.actionsUsed !== validTranscript.actions.length) {
    throw new Error(`MCP full-course receipt mismatch: ${JSON.stringify(finalObservation)}`);
  }
  const transcript = await callTool("arena_transcript");
  if (JSON.stringify(transcript) !== JSON.stringify(validTranscript)) throw new Error("MCP full-course transcript mismatch.");
  const closed = await callTool("arena_close", { retainEvidence: true });
  arenaClosed = true;
  if (!closed.receipt?.replayHash || !closed.receipt?.screenshotHash || !closed.receipt?.transcriptHash) throw new Error("MCP close receipt is incomplete.");
  const proofDir = join("evidence", "mcp", closed.receipt.sessionIdHash.slice(0, 16));
  await mkdir(proofDir, { recursive: true });
  await copyFile(join(closed.evidenceDirectory, "final.png"), join(proofDir, "final.png"));
  await copyFile(join(closed.evidenceDirectory, "receipt.json"), join(proofDir, "receipt.json"));
  await writeFile(join(proofDir, "assertions.json"), `${JSON.stringify({
    schemaVersion: "solari.arena.mcp-proof.v1", completedAt: new Date().toISOString(), tools: names,
    zeroCostObservation: true, boundaryAction, resetObservation, finalObservation, transcript, receipt: closed.receipt, passed: true,
  }, null, 2)}\n`);
  console.log(`MCP bridge verification passed: ${proofDir}`);
} finally {
  if (arenaOpened && !arenaClosed) await callTool("arena_close", { retainEvidence: false }).catch(() => undefined);
  child.stdin.end();
  await new Promise((resolve) => { if (child.exitCode !== null) resolve(); else child.once("exit", resolve); });
}
