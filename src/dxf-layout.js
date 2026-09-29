// Layout ownership, paper blocks and native rectangular VIEWPORT entities.
export function dxfLayouts(doc, pair, custom = []) {
  let next = 256;
  const handle = () => (next++).toString(16).toUpperCase();
  const root = handle(),
    dictionary = handle(),
    table = handle();
  const layouts = [
    { id: "model", name: "Model", width: 420, height: 297 },
    ...(doc.layouts?.length
      ? doc.layouts
      : [{ id: "paper-default", name: "Layout1", width: 420, height: 297 }]),
  ].map((l, i) => ({
    ...l,
    index: i,
    blockName:
      i === 0
        ? "*Model_Space"
        : i === 1
          ? "*Paper_Space"
          : `*Paper_Space${i - 2}`,
    record: handle(),
    object: handle(),
  }));
  for (const b of custom) b.record = handle();
  const owner = (e) =>
    e._owner ||
    layouts.find((l) => l.id === (e.space || "model"))?.record ||
    layouts[0].record;
  const tables = () => {
    pair(0, "TABLE");
    pair(2, "BLOCK_RECORD");
    pair(5, table);
    pair(330, 0);
    pair(100, "AcDbSymbolTable");
    pair(70, layouts.length + custom.length);
    for (const l of [...layouts, ...custom]) {
      pair(0, "BLOCK_RECORD");
      pair(5, l.record);
      pair(330, table);
      pair(100, "AcDbSymbolTableRecord");
      pair(100, "AcDbBlockTableRecord");
      pair(2, l.blockName);
      if (l.object) pair(340, l.object);
      pair(70, 4);
    }
    pair(0, "ENDTAB");
  };
  const blocks = (content = () => {}) => {
    pair(0, "SECTION");
    pair(2, "BLOCKS");
    for (const l of [...layouts, ...custom]) {
      pair(0, "BLOCK");
      pair(5, handle());
      pair(330, l.record);
      pair(100, "AcDbEntity");
      pair(8, "0");
      pair(100, "AcDbBlockBegin");
      pair(2, l.blockName);
      pair(70, l.flags || 0);
      pair(10, 0);
      pair(20, 0);
      pair(30, 0);
      pair(3, l.blockName);
      pair(1, "");
      content(l);
      pair(0, "ENDBLK");
      pair(5, handle());
      pair(330, l.record);
      pair(100, "AcDbEntity");
      pair(8, "0");
      pair(100, "AcDbBlockEnd");
    }
    pair(0, "ENDSEC");
  };
  const objects = () => {
    pair(0, "SECTION");
    pair(2, "OBJECTS");
    pair(0, "DICTIONARY");
    pair(5, root);
    pair(330, "0");
    pair(100, "AcDbDictionary");
    pair(281, 1);
    pair(3, "ACAD_LAYOUT");
    pair(350, dictionary);
    pair(0, "DICTIONARY");
    pair(5, dictionary);
    pair(330, root);
    pair(100, "AcDbDictionary");
    pair(281, 1);
    for (const l of layouts) {
      pair(3, l.name);
      pair(350, l.object);
    }
    for (const l of layouts) {
      pair(0, "LAYOUT");
      pair(5, l.object);
      pair(330, dictionary);
      pair(100, "AcDbPlotSettings");
      pair(1, "");
      pair(2, "");
      pair(4, `ISO ${l.width} x ${l.height} MM`);
      pair(40, 0);
      pair(41, 0);
      pair(42, 0);
      pair(43, 0);
      pair(44, l.width);
      pair(45, l.height);
      pair(46, 0);
      pair(47, 0);
      pair(142, 1);
      pair(143, 1);
      pair(70, 0);
      pair(72, 1);
      pair(73, 0);
      pair(74, 5);
      pair(100, "AcDbLayout");
      pair(1, l.name);
      pair(70, 1);
      pair(71, l.index);
      pair(10, 0);
      pair(20, 0);
      pair(11, l.width);
      pair(21, l.height);
      pair(12, 0);
      pair(22, 0);
      pair(32, 0);
      pair(14, 0);
      pair(24, 0);
      pair(34, 0);
      pair(15, l.width);
      pair(25, l.height);
      pair(35, 0);
      pair(330, l.record);
    }
    pair(0, "ENDSEC");
  };
  return { handle, owner, tables, blocks, objects };
}
