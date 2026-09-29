# Local DWG bridge

ACadSharp 3.8.0 (MIT) compiled with .NET SDK 10.0.401 / runtime 10.0.12.
The app loads only the bundled `_framework` output, inside a module worker.
DWG bytes and intermediate DXF stay on the device. No conversion service.
The template wwwroot page is a build scaffold, not a shipped application page.

To rebuild, install the official .NET 10 SDK and run:

```
dotnet workload install wasm-tools
node scripts/build-dwg.mjs
node scripts/build.mjs
```

Set `DOTNET` to the executable path if it is not on PATH. Regular app builds
use the checked-in runtime and do not require .NET. Keep trimming disabled:
ACadSharp uses reflection when reading/writing CAD entities.

Licenses distributed in `src/vendor/dwg/` and copied to release/PWA:
- ACadSharp: https://github.com/DomCR/ACadSharp (MIT)
- Embedded CSUtilities/CSMath: https://github.com/DomCR/CSUtilities (MIT)
- .NET runtime: https://github.com/dotnet/runtime (MIT, third-party notices)

Keep these notices with redistributions. This integration does not use LibreDWG.

Worker startup intentionally uses addEventListener rather than onmessage:
https://github.com/dotnet/runtime/issues/114918

Manual integration test: open ACadSharp's samples/sample_AC1032.dwg through
Open project, expect an import report with 111 objects plus reported unsupported
entities. This is a stress fixture, not a promise of complete DWG fidelity.
