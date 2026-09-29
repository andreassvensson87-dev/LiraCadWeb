// Coordinates tools and application effects; geometry and UI stay in their owners.
export class Editor {
  constructor({ tools, applyChange, notify = () => {}, onState = () => {} }) {
    this.tools = tools;
    this.applyChange = applyChange;
    this.notify = notify;
    this.onState = onState;
    this.state = null;
  }
  supports(name) {
    return Object.hasOwn(this.tools, name);
  }
  owns(state) {
    return this.state !== null && this.state === state;
  }
  start(name) {
    if (!this.supports(name)) return false;
    this.state = this.tools[name].create();
    this.onState(this.state);
    return true;
  }
  cancel() {
    this.state = null;
  }
  dispatch(event) {
    if (!this.state) return false;
    const result = this.tools[this.state.name].handle(this.state, event);
    // Apply before advancing so a failed document transaction retains tool input.
    if (result.change) this.applyChange(structuredClone(result.change));
    this.state = result.state;
    this.onState(this.state);
    if (result.message) this.notify(result.message);
    return true;
  }
  preview(cursor) {
    return this.state
      ? structuredClone(this.tools[this.state.name].preview(this.state, cursor))
      : [];
  }
  describe() {
    return this.state ? this.tools[this.state.name].describe(this.state) : null;
  }
}
