import { readdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
function run(args) {
  const result = spawnSync(process.execPath, args, { cwd: root, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}
// Check every owned module, including workers and newly added modules.
for (const directory of ["src", "scripts"]) {
  for (const file of (await readdir(path.join(root, directory))).sort())
    if (/\.(js|mjs)$/.test(file)) run(["--check", path.join(directory, file)]);
}
run(["--check", "server.mjs"]);
const tests = (await readdir(path.join(root, "tests")))
  .filter((f) => f.endsWith(".test.mjs")).sort().map((f) => path.join("tests", f));
run(["--test", ...tests]);
