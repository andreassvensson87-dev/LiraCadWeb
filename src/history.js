// Document snapshots and undo/redo; independent of the UI and browser.
const clone = structuredClone;
export class History {
  constructor() {
    this.past = [];
    this.future = [];
  }
  commit(before, after, label) {
    if (JSON.stringify(before) === JSON.stringify(after)) return false;
    this.past.push({ before: clone(before), after: clone(after), label });
    if (this.past.length > 80) this.past.shift();
    this.future = [];
    return true;
  }
  undo() {
    const x = this.past.pop();
    if (!x) return null;
    this.future.push(x);
    return clone(x.before);
  }
  redo() {
    const x = this.future.pop();
    if (!x) return null;
    this.past.push(x);
    return clone(x.after);
  }
}
