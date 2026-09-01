import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { Solari } from "@solarisdk/browser";
import * as z from "zod/v4";
import { canonicalJson } from "../server/lib/evidence.mjs";
import { DEFAULT_ARENA_URL, resolveArenaUrl } from "../server/lib/arena-url.mjs";

function hash(value) {
  return createHash("sha256").update(value).digest("hex");
}

class ArenaBrowser {
  client;
  browser;
  page;
  url;
  startedAt;

  async open(url = process.env.ARENA_URL || DEFAULT_ARENA_URL, seed = 42) {
    if (!process.env.SOLARI_API_KEY) throw new Error("SOLARI_API_KEY is required by the local MCP bridge.");
    const target = resolveArenaUrl(url);
    await this.close(false);
    this.client = new Solari({ apiKey: process.env.SOLARI_API_KEY });
    this.browser = await this.client.launch({ recording: true });
    this.page = await this.browser.newPage();
    this.url = target;
    this.startedAt = new Date().toISOString();
    await this.page.goto(this.url, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await this.page.getByTestId("agent-observation-json").waitFor({ timeout: 60_000 });
    return this.reset(seed);
  }

  async reset(seed = 42) {
    const page = this.requirePage();
    await page.locator("#agent-seed").fill(String(seed));
    await page.getByRole("button", { name: "RESET TRIAL" }).click();
    return this.observe();
  }

  requirePage() {
    if (!this.page) throw new Error("Call arena_open before using the agent tools.");
    return this.page;
  }

  async observe() {
    return JSON.parse(await this.requirePage().getByTestId("agent-observation-json").inputValue());
  }

  async act(input) {
    const page = this.requirePage();
    const transcript = await this.transcript();
    const sequence = transcript.actions.length;
    await page.locator("#agent-drive").fill(String(input.drive));
    await page.locator("#agent-turn").fill(String(input.turn));
    await page.locator("#agent-duration").fill(String(input.durationMs));
    await page.getByTestId("agent-execute").click();
    await page.waitForFunction((receipt) => document.querySelector('[data-testid="agent-execute"]')?.getAttribute("data-receipt") === receipt, String(sequence), { timeout: 10_000 });
    return this.observe();
  }

  async transcript() {
    return JSON.parse(await this.requirePage().getByTestId("agent-transcript-json").inputValue());
  }

  screenshot() {
    return this.requirePage().screenshot({ type: "png" });
  }

  async close(retainEvidence = true) {
    if (!this.browser || !this.client) return { closed: true, evidenceDirectory: null };
    const sessionId = this.browser.id;
    const page = this.page;
    const transcript = page ? await this.transcript().catch(() => null) : null;
    const screenshot = page ? await this.screenshot().catch(() => null) : null;
    await this.browser.close();
    let replay = null;
    if (retainEvidence) {
      for (let attempt = 0; attempt < 20; attempt += 1) {
        try { replay = await this.client.sessions.downloadReplay(sessionId); break; }
        catch (error) {
          if (attempt === 19) throw error;
          await new Promise((resolve) => setTimeout(resolve, 1_000));
        }
      }
    }
    await this.client.close();
    this.browser = undefined;
    this.client = undefined;
    this.page = undefined;
    if (!retainEvidence) return { closed: true, evidenceDirectory: null };
    const directory = join(process.cwd(), "evidence", "agent-sessions", hash(sessionId).slice(0, 16));
    await mkdir(directory, { recursive: true });
    if (transcript) await writeFile(join(directory, "transcript.json"), `${JSON.stringify(transcript, null, 2)}\n`);
    if (screenshot) await writeFile(join(directory, "final.png"), screenshot);
    if (replay) await writeFile(join(directory, "solari-browser-replay.ndjson"), replay);
    const receipt = {
      schemaVersion: "solari.arena.agent-session.v1",
      sessionIdHash: hash(sessionId),
      arenaUrl: this.url,
      startedAt: this.startedAt,
      completedAt: new Date().toISOString(),
      transcriptHash: transcript ? hash(canonicalJson(transcript)) : null,
      screenshotHash: screenshot ? hash(screenshot) : null,
      replayHash: replay ? hash(replay) : null,
    };
    await writeFile(join(directory, "receipt.json"), `${JSON.stringify(receipt, null, 2)}\n`);
    return { closed: true, evidenceDirectory: directory, receipt };
  }
}

const arena = new ArenaBrowser();
const textResult = (value) => ({
  content: [{ type: "text", text: JSON.stringify(value, null, 2) }],
  structuredContent: value,
});
const visualResult = async (value) => {
  const png = await arena.screenshot();
  return {
    content: [
      { type: "text", text: JSON.stringify(value, null, 2) },
      { type: "image", mimeType: "image/png", data: Buffer.from(png).toString("base64") },
    ],
    structuredContent: value,
  };
};

function buildServer() {
  const server = new McpServer({ name: "solari-agent-arena", version: "1.0.0" }, { capabilities: { tools: {} } });
  server.registerTool("arena_open", {
    title: "Open Solari Agent Arena",
    description: "Launch a recording-enabled Solari Browser, open the robot benchmark, reset it, and return the first observation plus screenshot.",
    inputSchema: z.object({
      seed: z.number().int().min(0).max(0xffff_ffff).default(42),
      url: z.string().url().optional(),
    }),
  }, async ({ seed, url }) => visualResult(await arena.open(url, seed)));
  server.registerTool("arena_observe", {
    title: "Observe robot state",
    description: "Read structured robot state without advancing simulated time.",
    inputSchema: z.object({}),
    annotations: { readOnlyHint: true },
  }, async () => textResult(await arena.observe()));
  server.registerTool("arena_reset", {
    title: "Reset robot trial",
    description: "Reset the current browser trial to a uint32 seed without launching a new Solari Browser session.",
    inputSchema: z.object({ seed: z.number().int().min(0).max(0xffff_ffff).default(42) }),
  }, async ({ seed }) => visualResult(await arena.reset(seed)));
  server.registerTool("arena_look", {
    title: "Look at robot arena",
    description: "Read structured robot state and capture the current visual arena without advancing simulated time.",
    inputSchema: z.object({}),
    annotations: { readOnlyHint: true },
  }, async () => visualResult(await arena.observe()));
  server.registerTool("arena_act", {
    title: "Act in robot arena",
    description: "Apply one bounded action for simulated time, then return the observation and updated visual arena.",
    inputSchema: z.object({
      drive: z.number().min(-1.6).max(1.6),
      turn: z.number().min(-1.4).max(1.4),
      durationMs: z.number().int().min(100).max(2_000),
    }),
  }, async (input) => visualResult(await arena.act(input)));
  server.registerTool("arena_transcript", {
    title: "Read action transcript",
    description: "Return the exact non-authoritative action transcript for isolated deterministic scoring.",
    inputSchema: z.object({}),
    annotations: { readOnlyHint: true },
  }, async () => textResult(await arena.transcript()));
  server.registerTool("arena_close", {
    title: "Close arena session",
    description: "Close Solari Browser and retain transcript, final screenshot, rrweb replay, and a hash receipt locally.",
    inputSchema: z.object({ retainEvidence: z.boolean().default(true) }),
  }, async ({ retainEvidence }) => textResult(await arena.close(retainEvidence)));
  return server;
}

process.once("SIGINT", () => void arena.close(false).finally(() => process.exit(0)));
process.once("SIGTERM", () => void arena.close(false).finally(() => process.exit(0)));
serveStdio(() => buildServer(), { onerror: (error) => console.error(error) });
