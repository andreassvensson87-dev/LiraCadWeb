// Document snapshots and undo/redo; independent of the UI and browser.
import { copyDocumentSnapshot } from './document-snapshot.js';
export class History {
  constructor() {
    this.past = [];
    this.future = [];
  }
  commit(before, after, label) {
    if (JSON.stringify(before) === JSON.stringify(after)) return false;
    this.past.push({ before: structuredClone(before), after: structuredClone(after), label });
    if (this.past.length > 80) this.past.shift();
    this.future = [];
    return true;
  }
  commitDocument(before,after,label) {
    if (JSON.stringify(before) === JSON.stringify(after)) return false;
    this.commitAddition(before,after,label);
    return true;
  }
  // Caller has validated a known non-empty addition. Share only recursively
  // immutable owned entities; keep metadata and entity arrays isolated.
  commitAddition(before, after, label) {
    this.past.push({before:copyDocumentSnapshot(before),after:copyDocumentSnapshot(after),label,owned:true});
    if (this.past.length > 80) this.past.shift();
    this.future = [];
  }
  undo() {
    const x = this.past.pop();
    if (!x) return null;
    this.future.push(x);
    return x.owned ? copyDocumentSnapshot(x.before) : structuredClone(x.before);
  }
  redo() {
    const x = this.future.pop();
    if (!x) return null;
    this.past.push(x);
    return x.owned ? copyDocumentSnapshot(x.after) : structuredClone(x.after);
  }
}
