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

LiraCAD extends the pinned ACadSharp 3.8.0 source with native readers and DXF
writers for ACDB_TEXTOBJECTCONTEXTDATA_CLASS and
ACDB_MTEXTOBJECTCONTEXTDATA_CLASS. The owned implementation is in
`AnnotationContexts/`; `scripts/prepare-dwg-source.mjs` downloads the pinned MIT
sources and applies guarded registration changes. Downloaded sources are
ignored; clean builds reproduce the same integration. No NuGet binary override
or manual edit of the generated WebAssembly files is required.

The reader preserves default flags, scale handles, text alignment/rotation,
MTEXT insertion/direction, box size, extents and column metadata. The app uses
planar TEXT and MTEXT contexts with a unique default context. MTEXT supports
multiple columns, per-scale widths, gutters, heights and flow direction;
font substitution can still change reflow. Fit/aligned TEXT, 3D contexts and
malformed column data retain base geometry and warn.

Native readers/writers now preserve dimension contexts (ALDIM, ANGDIM, DMDIM,
RADIM, RADIMLG, ORDDIM), including the block handle and placement fields.
The app renders each supported variant from its existing dimension graphics
block; aligned/linear grips use the context's dimension-line point. The public
fixtures independently verify ALDIM (28 and 10 contexts/annotated dimensions).
The other five subtype tails follow the field contract but remain unverified
against independent DWG inputs. Unreadable graphics retain the base dimension
with an import warning. DWG export is still outside the bridge's scope.

Independent integration fixture: Autodesk's public
[annotation scaling exercise](https://help.autodesk.com/cloudhelp/2026/ENU/AutoCAD-DidYouKnow/files/GUID-C33D5B68-5A3F-4AF6-9AFB-F74DAB8B6722.htm),
`architectural_-_annotation_scaling_and_multileaders.dwg`.
The patched converter preserves five MTEXT contexts (scales 1:24 and 1:48),
versus zero with the unmodified package. Browser import produces 1407 entities,
five editable text variants, and a valid DXF/project round trip. A second independent fixture is Wisconsin DOT's
[AutoCAD annotation lesson](https://c3dkb.dot.wi.gov/Content/c3d/acad/acad-annotatn.htm):
`acad-annotatn-end.dwg` from `acad-data-c3d20.zip`. It preserves 23 TEXT and 252
MTEXT contexts; the imported drawing uses 27 editable annotated text objects.
User drawings were also reimported with unchanged counts 6649/3188/2181/2546/178.
Fixture downloads stay in ignored artifacts, not in the distributed app.

Optional native regression check (requires .NET 10, no wasm workload):

```
node scripts/check-dwg-native.mjs /path/to/extracted/fixtures
```

Place both unmodified named fixtures in that directory. The check pins their
SHA-256 hashes, builds the same custom reader used by the worker, checks native
context counts, a centered TEXT alignment point, dynamic-column height data, native ALDIM blocks and variant counts,
project validity, scale resolution and DXF round-trip preservation. Regular
`node scripts/check.mjs` also covers column layout, editing, overflow preservation
and DXF round trips, along with Windows file launch queuing.
