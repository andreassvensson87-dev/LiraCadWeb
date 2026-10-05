import { clone } from "./values.js";

// Owns pending text/style; acceptance happens before the draft is closed.
export class TextEditSession {
  constructor(entity, isNew = false) {
    this.entity = clone(entity);
    this.isNew = isNew;
    this.closed = false;
  }
  finish(save, text, applyChange) {
    if (this.closed) throw Error("Textsessionen är redan avslutad.");
    let selection, message;
    if (save) {
      const entity = { ...clone(this.entity), text: text.replace(/\r\n?/g, "\n") };
      if (entity.attributeTag && /\n/.test(entity.text)) throw Error("Attributet behöver en enda textrad.");
      if (entity.text.trim()) {
        applyChange({ kind: "editing", label: this.isNew ? "Skapa text" : "Redigera text",
          entities: [entity], ...(!this.isNew ? { replaceId: entity.id } : {}) });
        selection = [entity.id];
      } else if (!this.isNew) message = "Tom text sparades inte. Använd Radera för att ta bort objektet.";
    }
    this.closed = true;
    return { selection, message };
  }
}
