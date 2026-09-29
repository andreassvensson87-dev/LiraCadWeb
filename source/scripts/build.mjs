import {
  readFile,
  writeFile,
  mkdir,
  readdir,
  copyFile,
} from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
const root = path.resolve(import.meta.dirname, "..");
const out = path.join(root, "dist");
await mkdir(out, { recursive: true });
const sourceFiles = (await readdir(path.join(root, "src"))).filter((f) =>
  /\.(js|css)$/.test(f),
);
for (const file of sourceFiles)
  await copyFile(path.join(root, "src", file), path.join(out, file));
const shared = ["manifest.webmanifest", "icon-192.png", "icon-512.png"];
for (const file of shared)
  await copyFile(path.join(root, file), path.join(out, file));
const html = await readFile(path.join(root, "index.html"), "utf8");
await writeFile(path.join(out, "index.html"), html.replaceAll("./src/", "./"));
await writeFile(path.join(out, ".nojekyll"), "");
async function worker(directory, files) {
  const hash = createHash("sha256");
  for (const file of files)
    hash.update(await readFile(path.join(directory, file)));
  const version = hash.digest("hex").slice(0, 16);
  const code = `const CACHE = "liracad-" + ${JSON.stringify(version)};
const FILES = ${JSON.stringify(files)};
const urls = FILES.map(file => new URL(file, self.registration.scope).href);
self.addEventListener("install", event => {
 event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(urls)));
});
self.addEventListener("message", event => {
 if(event.data?.type !== "ACTIVATE_UPDATE") return;
 event.waitUntil((async () => {
  const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  const own = windows.filter(client => client.url.startsWith(self.registration.scope));
  if(own.length > 1) { event.source?.postMessage({type:"UPDATE_BLOCKED"}); return; }
  await self.skipWaiting();
 })());
});
self.addEventListener("fetch", event => {
 if(event.request.method !== "GET") return;
 const url = new URL(event.request.url);
 if(!url.href.startsWith(self.registration.scope)) return;
 const target = event.request.mode === "navigate"
   ? new URL("index.html",self.registration.scope).href : url.href;
 if(!urls.includes(target)) return;
 event.respondWith(caches.open(CACHE).then(async cache =>
  (await cache.match(target)) || fetch(event.request)));
});
`;
  await writeFile(path.join(directory, "sw.js"), code);
  return version;
}
const release = await worker(out, ["index.html", ...sourceFiles, ...shared]);
await worker(root, [
  "index.html",
  ...sourceFiles.map((f) => "src/" + f),
  ...shared,
]);
console.log("Release ready: dist/ — " + release);
