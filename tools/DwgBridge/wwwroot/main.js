// Development-only bridge smoke page; not included in LiraCAD release assets.
import { dotnet } from './_framework/dotnet.js';
const host = await dotnet.create();
const exports = await host.getAssemblyExports(host.getConfig().mainAssemblyName);
document.getElementById('out').textContent = 'DWG bridge ready: ' + Object.keys(exports).join(', ');
