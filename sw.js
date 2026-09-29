const CACHE = "liracad-" + "f2107b9e4daa1668";
const FILES = ["index.html","app.js","core.js","dimensions.js","dxf-layout.js","editing.js","grips.js","layout.js","navigation.js","plot.js","pwa.js","snapping.js","style.css","text.js","tracking.js","trim-extend.js","manifest.webmanifest","icon-192.png","icon-512.png"];
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
