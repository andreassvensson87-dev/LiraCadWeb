// Application edit gateway. DocumentSession owns validation, snapshots and history.
// Read the active session for each operation so file/block switches cannot capture
// a stale document. Presentation and persistence subscribe after acceptance.
export function createDocumentEditor({ getSession, onChange = () => {} }) {
  function change(kind, label, perform) {
    const session = getSession();
    const previous = session.document;
    const result = perform(session);
    if (session.document !== previous) {
      onChange({ kind, label, previous, document: session.document });
    }
    return result;
  }
  return {
    commit: (label, edit) =>
      change("commit", label, (session) => session.commit(label, edit)),
    append: (label, entities) =>
      change("append", label, (session) => session.append(label, entities)),
    replaceEntities: (label, entities) =>
      change("replace", label, (session) =>
        session.replaceEntities(label, entities),
      ),
    updateViewportView: (id, view) =>
      change("navigation", "Viewportvy", (session) =>
        session.updateViewportView(id, view),
      ),
    undo: () => change("undo", "Ångra", (session) => session.undo()),
    redo: () => change("redo", "Gör om", (session) => session.redo()),
  };
}
