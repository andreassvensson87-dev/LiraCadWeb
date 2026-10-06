// Requires .NET SDK 10.0.401 and the wasm-tools workload.
import { mkdtemp, readdir, copyFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
const root = path.resolve(import.meta.dirname, "..");
await import("./prepare-dwg-source.mjs");
const temporary = await mkdtemp(path.join(tmpdir(), "liracad-dwg-"));
const target = path.join(root, "src/vendor/dwg/_framework");
try {
  execFileSync(
    process.env.DOTNET || "dotnet",
    [
      "publish",
      path.join(root, "tools/DwgBridge"),
      "-c",
      "Release",
      "-o",
      temporary,
    ],
    { stdio: "inherit" },
  );
  const source = path.join(temporary, "wwwroot/_framework");
  const files = (await readdir(source)).filter(
    (f) => !/\.(gz|br|pdb)$/.test(f),
  );
  // Only replace generated runtime files after a successful build.
  for (const old of await readdir(target))
    if (!files.includes(old)) await rm(path.join(target, old));
  for (const file of files)
    await copyFile(path.join(source, file), path.join(target, file));
} finally {
  await rm(temporary, { recursive: true, force: true });
}
