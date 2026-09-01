import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";

const exec = promisify(execFile);
const output = "server/runner/runner-dependencies.tgz";
const paths = ["node_modules/@mujoco", "node_modules/@jitl", "node_modules/quickjs-emscripten", "node_modules/quickjs-emscripten-core"];

await exec("tar", ["-czf", output, "-C", ".", ...paths], {
  cwd: process.cwd(),
  env: { ...process.env, COPYFILE_DISABLE: "1" },
});
const hash = createHash("sha256").update(await readFile(output)).digest("hex");
console.log(`${hash}  ${output}`);
