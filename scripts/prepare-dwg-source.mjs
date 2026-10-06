// Build a pinned ACadSharp source tree with LiraCAD's narrowly scoped readers.
import { access, mkdir, writeFile, readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '..');
const vendor = path.join(root, 'tools/DwgBridge/vendor/ACadSharp');
async function unpack(repository, revision, target, members) {
  await mkdir(target, { recursive: true });
  const archive = path.join(target, 'source.tar.gz');
  const response = await fetch(`https://codeload.github.com/DomCR/${repository}/tar.gz/${revision}`);
  if (!response.ok) throw new Error(`Downloading ${repository}: ${response.status}`);
  await writeFile(archive, Buffer.from(await response.arrayBuffer()));
  const prefix = `${repository}-${revision.replace(/^v/, '')}`;
  execFileSync('tar', ['-xzf', archive, '-C', target, '--strip-components=1', ...members.map(m => `${prefix}/${m}`)]);
  const { unlink } = await import('node:fs/promises');
  await unlink(archive);
}
try { await access(path.join(vendor, 'src/ACadSharp/ACadSharp.csproj')); }
catch { await unpack('ACadSharp', '3a1c66b9932f9e2dbfbbf3f03660c97d52e49b02', vendor, ['src/ACadSharp', 'src/Directory.Build.props', 'LICENSE']); }
try { await access(path.join(vendor, 'src/CSUtilities/CSMath/CSMath.projitems')); }
catch { await unpack('CSUtilities', 'b1f53ee2c68143173100d031adcdb275f524aea9', path.join(vendor, 'src/CSUtilities'), ['CSMath', 'CSUtilities', 'LICENSE']); }
async function patch(file, before, after) {
  const target = path.join(vendor, file), text = await readFile(target, 'utf8');
  if (text.includes(after)) return;
  if (!text.includes(before)) throw new Error(`ACadSharp patch anchor changed: ${file}`);
  await writeFile(target, text.replace(before, after));
}
await patch('src/ACadSharp/IO/DWG/DwgStreamReaders/DwgObjectReader.cs',
  'case DxfFileToken.BlkRefObjectContextData:',
  'case "ACDB_TEXTOBJECTCONTEXTDATA_CLASS":\n                    template = this.readLiraTextContext(); break;\n                case "ACDB_MTEXTOBJECTCONTEXTDATA_CLASS":\n                    template = this.readLiraMTextContext(); break;\n                case DxfFileToken.BlkRefObjectContextData:');
await patch('src/ACadSharp/IO/DXF/DxfStreamWriter/DxfObjectsSectionWriter.cs',
  'internal class DxfObjectsSectionWriter :', 'internal partial class DxfObjectsSectionWriter :');
await patch('src/ACadSharp/IO/DXF/DxfStreamWriter/DxfObjectsSectionWriter.cs',
  'case BlockReferenceObjectContextData blockContextData:',
  'case LiraTextObjectContextData textContext:\n                this.writeLiraTextContext(textContext); break;\n            case LiraMTextObjectContextData mtextContext:\n                this.writeLiraMTextContext(mtextContext); break;\n            case BlockReferenceObjectContextData blockContextData:');
const dimensionReaders = ['ALDIM', 'ANGDIM', 'DMDIM', 'RADIM', 'RADIMLG', 'ORDDIM'].map(kind =>
  `case "ACDB_${kind}OBJECTCONTEXTDATA_CLASS":\n                    template = this.readLiraDimensionContext("${kind}"); break;`).join('\n                ');
await patch('src/ACadSharp/IO/DWG/DwgStreamReaders/DwgObjectReader.cs',
  'case DxfFileToken.MTextAttributeObjectContextData:',
  dimensionReaders + '\n                case DxfFileToken.MTextAttributeObjectContextData:');
await patch('src/ACadSharp/IO/DXF/DxfStreamWriter/DxfObjectsSectionWriter.cs',
  'case MTextAttributeObjectContextData mtextContextData:',
  'case LiraDimensionObjectContextData dimensionContext:\n                this.writeLiraDimensionContext(dimensionContext); break;\n            case MTextAttributeObjectContextData mtextContextData:');
await writeFile(path.join(vendor, 'src/ACadSharp/ACadSharp.Lira.csproj'), `<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <TargetFramework>net10.0</TargetFramework><AssemblyName>ACadSharp</AssemblyName>
    <AllowUnsafeBlocks>true</AllowUnsafeBlocks><EnableDefaultCompileItems>true</EnableDefaultCompileItems>
    <GenerateAssemblyInfo>false</GenerateAssemblyInfo>
  </PropertyGroup>
  <ItemGroup><Compile Include="../../../../AnnotationContexts/*.cs" /></ItemGroup>
  <Import Project="../CSUtilities/CSMath/CSMath.projitems" />
  <Import Project="../CSUtilities/CSUtilities/CSUtilities.projitems" />
</Project>\n`);
