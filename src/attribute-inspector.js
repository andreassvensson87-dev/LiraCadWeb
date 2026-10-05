import { attributeSchema, attributeOptions, sortedAttributes, validAttributeSchema, validAttributeDate } from "./attributes.js";
import { validTag } from "./blocks.js";

export function createAttributeInspector({ document, field, choice, action, log, refresh, editSelected, getDocument, isBlockEditor, selectEntity }) {
  function attributeValueField(root, part, value, change) {
    const spec = attributeSchema(part),
      label = spec.label || part.attributeTag;
    if (spec.type === "choice") {
      const values = [...spec.options];
      if (!values.includes(value)) values.unshift(value);
      const options = values.map((v, i) => [String(i), v || "—"]);
      if (spec.allowCustom) options.push(["custom", "Egen text…"]);
      const control = choice(
        label,
        String(values.indexOf(value)),
        options,
        (key) => {
          if (key === "custom") {
            const custom = field(label + " – egen text", value, change, "text");
            control.replaceWith(custom);
            custom.querySelector("input").focus();
          } else change(values[Number(key)]);
        },
      );
      root.append(control);
    } else if (spec.type === "date") {
      // Preserve legacy text when changing an existing attribute to a date field.
      if (!validAttributeDate(value))
        root.append(field(label + " – befintligt värde", value, change, "text"));
      root.append(
        field(
          label,
          validAttributeDate(value) ? value : "",
          (v) => {
            if (validAttributeDate(v)) change(v);
          },
          "date",
        ),
      );
    } else root.append(field(label, value, change, "text"));
  }
  function attributeDefinitionFields(root, entity) {
    const spec = attributeSchema(entity);
    const editAttribute = (label, patch) => {
      const next = { ...spec, ...patch };
      if (!validAttributeSchema(next)) {
        log("Kontrollera attributets val: max 100 alternativ, ett per rad.");
        refresh();
        return;
      }
      editSelected(label, (n) => ({ ...n, attributeSchema: next }));
    };
    root.append(
      field(
        "Attributnamn",
        entity.attributeTag,
        (v) => {
          const tag = v.trim().toUpperCase();
          if (
            !validTag(tag) ||
            (isBlockEditor() &&
              getDocument().entities.some(
                (e) => e.id !== entity.id && e.attributeTag === tag,
              ))
          ) {
            log("Attributnamnet måste vara giltigt och unikt i blocket.");
            refresh();
            return;
          }
          editSelected("Attributnamn", (n) => ({ ...n, attributeTag: tag }));
        },
        "text",
      ),
    );
    root.append(
      field(
        "Etikett",
        spec.label,
        (v) => editAttribute("Attributetikett", { label: v }),
        "text",
      ),
    );
    root.append(
      choice(
        "Fälttyp",
        spec.type,
        [
          ["text", "Fritext"],
          ["choice", "Dropdown"],
          ["date", "Datum"],
        ],
        (v) => editAttribute("Attributtyp", { type: v }),
      ),
    );
    if (spec.type === "choice") {
      const options = field(
        "Val – ett per rad",
        spec.options.join("\n"),
        (v) => editAttribute("Attributval", { options: attributeOptions(v) }),
        "multiline",
      );
      options.classList.add("attribute-options");
      root.append(options);
      root.append(
        choice(
          "Egen text",
          String(spec.allowCustom),
          [
            ["false", "Nej"],
            ["true", "Tillåt"],
          ],
          (v) =>
            editAttribute("Egna attributvärden", { allowCustom: v === "true" }),
        ),
      );
    }
    attributeValueField(
      root,
      { ...entity, attributeSchema: { ...spec, label: "Standardvärde" } },
      entity.text,
      (v) => editSelected("Attributstandard", (n) => ({ ...n, text: v })),
    );
    root.append(
      field("Ordning", spec.order, (v) =>
        editAttribute("Attributordning", { order: v }),
      ),
    );
    root.append(
      action("Gör till vanlig text", () =>
        editSelected("Ta bort attribut", (n) => {
          delete n.attributeTag;
          delete n.attributeSchema;
          return n;
        }),
      ),
    );
  }
  function renderAttributeManager(root) {
    const parts = sortedAttributes(getDocument().entities);
    if (!parts.length) return;
    const manager = document.createElement("details");
    manager.className = "attribute-manager";
    const summary = document.createElement("summary");
    summary.textContent = `Attribut (${parts.length})`;
    manager.append(summary);
    for (const part of parts) {
      const button = action(
        attributeSchema(part).label || part.attributeTag,
        () => {
          selectEntity(part.id);
        },
      );
      button.title = part.attributeTag;
      manager.append(button);
    }
    root.append(manager);
  }
  return { attributeValueField, attributeDefinitionFields, renderAttributeManager };
}
