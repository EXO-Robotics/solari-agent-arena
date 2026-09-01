import { access, readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const serverName = "solari-agent-arena";
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const envFile = join(root, ".env.local");
const serverFile = join(root, "scripts", "arena-mcp-server.mjs");

await access(serverFile);
const envText = await readFile(envFile, "utf8").catch(() => "");
if (!/^SOLARI_API_KEY=\S+/m.test(envText)) {
  throw new Error(`Missing SOLARI_API_KEY in ${envFile}. Save it there before connecting Codex.`);
}

function runCodex(args, options = {}) {
  const result = spawnSync("codex", args, { encoding: "utf8", ...options });
  if (result.error?.code === "ENOENT") throw new Error("Codex CLI was not found. Open Codex Settings → MCP servers and add this repository's stdio command manually.");
  return result;
}

const expectedCommand = process.execPath;
const expectedArgs = [`--env-file-if-exists=${envFile}`, serverFile];
const current = runCodex(["mcp", "get", serverName, "--json"]);
if (current.status === 0) {
  const configured = JSON.parse(current.stdout);
  const transport = configured.transport ?? configured;
  const matches = transport.command === expectedCommand && JSON.stringify(transport.args ?? []) === JSON.stringify(expectedArgs);
  if (!matches) {
    throw new Error(`Codex already has a different ${serverName} entry. Review it with \`codex mcp get ${serverName} --json\`; remove it deliberately before replacing it.`);
  }
  console.log("Solari Agent Arena is already connected. Restart Codex, open a new task, and paste the mission prompt.");
  process.exit(0);
}

const added = runCodex(["mcp", "add", serverName, "--", expectedCommand, ...expectedArgs], { stdio: "inherit" });
if (added.status !== 0) throw new Error(`Codex MCP setup failed with exit code ${added.status}.`);

const verified = runCodex(["mcp", "get", serverName, "--json"]);
if (verified.status !== 0) throw new Error("Codex did not retain the Solari Agent Arena MCP configuration.");
console.log("Connected without copying the Solari key into Codex config. Restart Codex, open a new task, and paste the mission prompt.");
