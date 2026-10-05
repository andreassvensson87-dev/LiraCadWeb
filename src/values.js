// Shared value operations; neither function owns application state.
export const clone = (value) => structuredClone(value);
export const uid = () => globalThis.crypto.randomUUID();
