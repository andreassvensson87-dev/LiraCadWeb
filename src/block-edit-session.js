import { DocumentSession } from "./document-session.js";
import { updateBlockDefinition } from "./blocks.js";
import { clone } from "./values.js";

// Retains the editable draft until the parent has accepted the entire block change.
export class BlockEditSession {
  constructor(parent, definition, context = {}) {
    this.documentSession = parent;
    this.id = definition.id;
    this.context = clone(context);
    this.closed = false;
    this.draft = new DocumentSession({
      version: 1, name: definition.name, layers: clone(parent.document.layers),
      entities: clone(definition.entities).map((e) => ({ ...e, space: "model" })),
      blockBase: { x: 0, y: 0 }, stretchParameters:clone(definition.stretchParameters||[]),
    });
  }
  get document() { return this.documentSession.document; }
  finish(save) {
    if (this.closed) throw Error("Blocksessionen är redan avslutad.");
    const changed = save ? this.documentSession.commit("Redigera block", (draft) => updateBlockDefinition(draft, this.id, this.draft.document)) : false;
    this.closed = true;
    return { documentSession: this.documentSession, context: clone(this.context), changed };
  }
}
