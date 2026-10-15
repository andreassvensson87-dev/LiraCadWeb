import { clone } from "./values.js";
import { dist } from "./geometry.js";

// Editable geometry is described without DOM. The inspector consumes this schema;
// accepted changes are still validated and published by DocumentSession.
export function geometryProperties(entity) {
  const fields = [];
  const point = (path, label, value) => {
    if (!value) return;
    for (const axis of ["x", "y"])
      fields.push({
        key: `${path}.${axis}`,
        label: `${label} ${axis.toUpperCase()} · mm`,
        value: value[axis],
      });
  };
  if (entity.type === "line") {
    point("points.0", "Startpunkt", entity.points[0]);
    point("points.1", "Slutpunkt", entity.points[1]);
  }
  if (["circle", "arc"].includes(entity.type)) {
    point("center", "Centrum", entity.center);
    fields.push({ key: "radius", label: "Radie · mm", value: entity.radius });
  }
  if (entity.type === "text") point("point", "Insättning", entity.point);
  return fields;
}

export function changeEntityGeometry(entity, key, value) {
  if (!Number.isFinite(value)) throw Error("Ange ett ändligt tal.");
  if (!geometryProperties(entity).some((field) => field.key === key))
    throw Error("Egenskapen kan inte redigeras.");
  if (key === "radius" && value <= 0)
    throw Error("Radien måste vara större än noll.");
  const next = clone(entity),
    path = key.split(".");
  let target = next;
  for (const part of path.slice(0, -1)) target = target[part];
  target[path.at(-1)] = value;
  if (next.type === "line" && dist(...next.points) < 1e-8)
    throw Error("Linjens ändpunkter måste vara olika.");
  return next;
}
