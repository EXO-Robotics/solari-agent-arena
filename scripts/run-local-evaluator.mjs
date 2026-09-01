import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";

const fixture = process.argv[2] ?? "qualification/fixtures/valid-controller.js";
const seed = Number(process.argv[3] ?? 42);
const controller = await readFile(fixture, "utf8");
const temp = await mkdtemp(join(tmpdir(), "solari-arena-local-"));
const input = join(temp, "input.json");
const output = join(temp, "result.json");
await writeFile(input, JSON.stringify({ controller, seed }));

try {
  const child = spawn(process.execPath, ["server/runner/arena-runner.mjs", input, "src/model/h1-sagittal.xml", output], {
    stdio: "inherit",
  });
  const code = await new Promise((resolve) => child.once("exit", resolve));
  process.exitCode = typeof code === "number" ? code : 1;
} finally {
  await rm(temp, { recursive: true, force: true });
}
