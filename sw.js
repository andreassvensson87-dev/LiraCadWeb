const CACHE = "liracad-" + "222cf4d9e2e2041d";
const FILES = ["index.html","src/app.js","src/core.js","src/dimensions.js","src/dxf-layout.js","src/editing.js","src/grips.js","src/layout.js","src/navigation.js","src/plot.js","src/pwa.js","src/snapping.js","src/style.css","src/text.js","src/tracking.js","src/trim-extend.js","manifest.webmanifest","icon-192.png","icon-512.png"];
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
