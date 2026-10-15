export const lineTypes = [
  ["CONTINUOUS", "Heldragen", []],
  ["DASHED", "Streckad", [8, -4]],
  ["DOTTED", "Prickad", [0.5, -3]],
  ["CENTER", "Centrumlinje", [12, -3, 2, -3]],
  ["HIDDEN", "Dold linje", [4, -2]],
];
export const validLineType = (value) =>
  value == null ||
  value === "BYLAYER" ||
  lineTypes.some(([id]) => id === value);
export const resolvedLineType = (entity, layer) =>
  entity.lineType && entity.lineType !== "BYLAYER"
    ? entity.lineType
    : layer?.lineType || "CONTINUOUS";
export const linePattern = (entity, layer) => {
  const type = resolvedLineType(entity, layer);
  const source = entity.lineType && entity.lineType !== "BYLAYER" ? entity : layer;
  const pattern = source?.linePatternType === type && source.linePattern ? source.linePattern : lineTypes.find(([id]) => id === type)?.[2] || [];
  return pattern.map(v => (v === 0 ? 0.01 : v) * (entity.lineScale || 1));
};
