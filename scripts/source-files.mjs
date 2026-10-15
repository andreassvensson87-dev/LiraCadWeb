import { fileURLToPath } from "node:url";
import { readdir } from "node:fs/promises";
import path from "node:path";

// Build and validation share the same recursive inventory. Vendor assets are
// copied separately; generated and third-party source is not application code.
export async function sourceFiles(directory, prefix = "") {
  if (directory instanceof URL) directory = fileURLToPath(directory);
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name === "vendor") continue;
    const name = prefix ? prefix + "/" + entry.name : entry.name;
    if (entry.isDirectory())
      result.push(
        ...(await sourceFiles(path.join(directory, entry.name), name)),
      );
    else result.push(name);
  }
  return result.sort();
}
