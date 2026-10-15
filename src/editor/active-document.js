// The active session is the single source of accepted document and history.
// File and block switches change this session; they cannot leave stale aliases.
export function createActiveDocument() {
  return {
    session: null,
    storage: null,
    blockEditor: null,
    parameterEdit: null,
    activeLayer: null,
    dirty: false,
    get document() {
      return this.session.document;
    },
    get history() {
      return this.session.history;
    },
  };
}
