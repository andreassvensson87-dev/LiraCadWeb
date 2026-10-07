import { decodeDXF, importDXF } from "./dxf-import.js";
let runtime;
let diagnosticCount = 0;
function diagnostic(level, message, details) {
  if (diagnosticCount++ < 4000) self.postMessage({ diagnostic: { level, message, details } });
}
for (const level of ['log', 'info', 'warn', 'error']) {
  const original = console[level].bind(console);
  console[level] = (...args) => {
    diagnostic(level, args.map(value => {
      try { return typeof value === 'string' ? value : JSON.stringify(value); }
      catch { return String(value); }
    }).join(' '));
    original(...args);
  };
}
// Keep onmessage unset: .NET 10 otherwise mistakes this worker for a pthread.
self.addEventListener("message", async ({ data }) => {
  try {
    const bytes = new Uint8Array(data.buffer);
    const signature = new TextDecoder().decode(bytes.subarray(0, 6));
    if (!/^AC10\d{2}$/.test(signature))
      throw Error("Filen har ingen giltig DWG-signatur.");
    self.postMessage({ progress: "Laddar DWG-läsaren…" });
    runtime ||= (async () => {
      const { dotnet } = await import("./vendor/dwg/_framework/dotnet.js");
      const host = await dotnet.withDiagnosticTracing(false).create();
      return host.getAssemblyExports(host.getConfig().mainAssemblyName);
    })();
    const exports = await runtime;
    self.postMessage({ progress: "Läser DWG-objekt…" });
    let binary = "";
    for (let i = 0; i < bytes.length; i += 32768)
      binary += String.fromCharCode(...bytes.subarray(i, i + 32768));
    const decoded = JSON.parse(exports.DwgBridge.ConvertDrawing(btoa(binary)));
    for (const message of decoded.messages || []) diagnostic('warn', message);
    if (decoded.error) throw Error(decoded.error);
    const dxf = Uint8Array.from(atob(decoded.dxfBase64), (c) =>
      c.charCodeAt(0),
    );
    const result = importDXF(decodeDXF(dxf), data.name.replace(/\.dwg$/i, ""));
    result.report.unshift(
      ...(decoded.messages || []).map((message) => ({
        message: "DWG-läsare: " + message,
        count: 1,
      })),
    );
    self.postMessage({ result });
  } catch (error) {
    diagnostic("error", error.message, error.stack);
    self.postMessage({ error: "Kunde inte läsa DWG: " + error.message });
  }
});
