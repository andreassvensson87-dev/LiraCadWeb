import { toDXF } from './dxf-export.js';
import { wblockDocument } from '../model/wblock-document.js';
export { wblockDocument, wblockFileName } from '../model/wblock-document.js';
export function wblockDXF(source,request) {
  const document=wblockDocument(source,request);
  return {name:document.name+'.dxf',text:toDXF(document),type:'application/dxf',count:document.entities.length};
}
