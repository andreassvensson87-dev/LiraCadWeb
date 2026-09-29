import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
test("release contains noindex and all precached files exist",async()=>{
 const html=await readFile("dist/index.html","utf8");
 assert.match(html,/name="robots" content="noindex"/);
 assert.ok(!html.includes('src="/'));
 assert.ok(!html.includes('href="/'));
 const manifest=JSON.parse(await readFile("dist/manifest.webmanifest","utf8"));
 assert.equal(manifest.scope,"./");
 assert.equal(manifest.display,"standalone");
 for(const icon of manifest.icons) assert.ok((await readFile("dist/"+icon.src)).length>100);
 const worker=await readFile("dist/sw.js","utf8");
 const files=JSON.parse(worker.match(/const FILES = (.*);/)[1]);
 for(const file of files) await readFile("dist/"+file);
 assert.ok(files.includes("pwa.js"));
 assert.ok(!files.some(file=>file.includes("artifacts")));
});
test("worker keeps versions atomic, serves offline navigation under repository path, blocks multi-window activation",async()=>{
 const handlers={};let installed,activated=false,reply;
 const scope="https://example.github.io/LiraCadWeb/";
 const cache={addAll:async urls=>{installed=urls;},match:async url=>"cached:"+url};
 const clients=[{url:scope},{url:scope+"index.html"}];
 vm.runInNewContext(await readFile("dist/sw.js","utf8"),{
 URL,caches:{open:async()=>cache},fetch:()=>{throw Error("offline");},
 self:{registration:{scope},addEventListener:(name,fn)=>handlers[name]=fn,
 clients:{matchAll:async()=>clients},skipWaiting:async()=>{activated=true;}}
 });
 let work;
 handlers.install({waitUntil:p=>work=p});await work;
 assert.ok(installed.every(url=>url.startsWith(scope)));
 assert.equal(activated,false);
 let response;
 handlers.fetch({request:{method:"GET",mode:"navigate",url:scope},respondWith:p=>response=p});
 assert.equal(await response,"cached:"+scope+"index.html");
 const event={data:{type:"ACTIVATE_UPDATE"},source:{postMessage:m=>reply=m},waitUntil:p=>work=p};
 handlers.message(event);await work;
 assert.equal(reply.type,"UPDATE_BLOCKED");assert.equal(activated,false);
 clients.pop();handlers.message(event);await work;
 assert.equal(activated,true);
});
