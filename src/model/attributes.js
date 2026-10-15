const singleLine = (value) =>
  typeof value === "string" && value.length <= 1000 && !/[\r\n]/.test(value);
export function validAttributeSchema(schema) {
  return (
    schema == null ||
    (typeof schema === "object" &&
      !Array.isArray(schema) &&
      ["text", "choice", "date"].includes(schema.type) &&
      singleLine(schema.label) &&
      Number.isFinite(schema.order) &&
      Array.isArray(schema.options) &&
      schema.options.length <= 100 &&
      schema.options.every((v) => singleLine(v) && v.trim().length > 0) &&
      new Set(schema.options).size === schema.options.length &&
      (schema.allowCustom == null || typeof schema.allowCustom === "boolean"))
  );
}
export function attributeSchema(part) {
  return {
    label: part.attributeTag,
    type: "text",
    options: [],
    order: 0,
    allowCustom: false,
    ...part.attributeSchema,
  };
}
export function sortedAttributes(entities) {
  return entities
    .filter((e) => e.attributeTag)
    .sort((a, b) => attributeSchema(a).order - attributeSchema(b).order);
}
export function attributeOptions(text) {
  return [
    ...new Set(
      text
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  ];
}
export function validAttributeDate(value) {
  if (value === "") return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + "T00:00:00Z");
  return (
    Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}
