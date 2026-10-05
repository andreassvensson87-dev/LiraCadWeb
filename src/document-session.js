import { validDocument } from "./document.js";
import { clone } from "./values.js";
import { History } from "./history.js";
import { ownDocument, copyDocumentSnapshot, sealDocument } from './document-snapshot.js';

// Owns the accepted document and its history. A draft is published only after
// validation; failures leave the document and both history stacks untouched.
export class DocumentSession {
  constructor(document, { validate = validDocument } = {}) {
    this.validate = validate;
    if (!validate(document)) throw Error("Ogiltig ritning.");
    this.document = ownDocument(document);
    this.history = new History();
    this.committing = false;
  }
  commit(label, change) {
    if (this.committing) throw Error("En dokumentändring pågår redan.");
    this.committing = true;
    try {
      const draft = clone(this.document);
      const result = change(draft);
      const next = result === undefined ? draft : result;
      if (!this.validate(next)) throw Error("Ändringen ger en ogiltig ritning.");
      const accepted = ownDocument(next);
      const changed = this.history.commitDocument(this.document, accepted, label);
      if (changed) this.document = accepted;
      return changed;
    } finally {
      this.committing = false;
    }
  }
  append(label, entities) {
    if (this.committing) throw Error("En dokumentändring pågår redan.");
    if (!entities.length) return false;
    this.committing = true;
    try {
      const addition = ownDocument({entities}).entities;
      const next = copyDocumentSnapshot(this.document);
      next.entities = next.entities.concat(addition);
      if (!this.validate(next)) throw Error("Ändringen ger en ogiltig ritning.");
      this.history.commitAddition(this.document,next,label);
      this.document = next;
      return true;
    } finally { this.committing = false; }
  }
  // Commands that already produce replacement entities need no mutable copy
  // of the rest of the drawing. Snapshot ownership isolates unfamiliar input.
  replaceEntities(label, entities) {
    if (this.committing) throw Error("En dokumentändring pågår redan.");
    this.committing = true;
    try {
      const before = this.document;
      if (entities.length === before.entities.length && entities.every((e,i) => e === before.entities[i])) return false;
      const next = copyDocumentSnapshot({...before, entities});
      if (!this.validate(next)) throw Error("Ändringen ger en ogiltig ritning.");
      // Compare only changed geometry; preserve redo for equivalent replacements.
      if (next.entities.length === before.entities.length && next.entities.every((e,i) => e === before.entities[i] || JSON.stringify(e) === JSON.stringify(before.entities[i]))) return false;
      this.history.commitAddition(before, next, label);
      this.document = next;
      return true;
    } finally { this.committing = false; }
  }
  undo() {
    if (this.committing) throw Error("En dokumentändring pågår redan.");
    const restored = this.history.undo();
    if (restored) this.document = sealDocument(restored);
    return restored;
  }
  redo() {
    if (this.committing) throw Error("En dokumentändring pågår redan.");
    const restored = this.history.redo();
    if (restored) this.document = sealDocument(restored);
    return restored;
  }
}
