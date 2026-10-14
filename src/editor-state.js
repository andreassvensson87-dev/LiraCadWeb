// Transient editor and view state. The document and history remain in DocumentSession.
export function createEditorState() {
  return {
    trimShift: false,
    selection: new Set(),
    tool: null,
    lastCommand: "LINE",
    cursor: { x: 0, y: 0 },
    rawCursor: { x: 0, y: 0 },
    mouse: { x: 0, y: 0 },
    snap: null,
    drag: null,
    space: false,
    spaceUsed: false,
    showGrid: true,
    osnap: true,
    ortho: false,
    polarEnabled: true,
    tracking: true,
    trackAnchors: [],
    gridSnap: false,
    hover: null,
    commandHistory: [],
    historyCursor: 0,
    width: 1,
    height: 1,
    dpr: 1,
    camera: { x: 0, y: 0, scale: 0.075 },
    activeSpace: "model",
    activeViewportId: null,
    paperCamera: null,
  };
}

// Tool implementations may return null when a command finishes. Keep the shared
// editor state distinct from that next tool state and clear phase-local tracking.
export function updateToolState(state, next, clearTracking) {
  if (
    state.tool?.phase !== next?.phase ||
    (next?.name === "DIMCONTINUE" &&
      (state.tool?.source !== next.source || state.tool?.end !== next.end))
  )
    clearTracking();
  state.tool = next;
}
