// Coordinates tools and application effects; geometry and UI stay in their owners.
export class Editor {
  constructor({
    tools,
    applyChange,
    getContext = () => ({}),
    notify = () => {},
    onState = () => {},
    setSelection = () => {},
    onEffect = () => {},
  }) {
    this.tools = tools;
    this.applyChange = applyChange;
    this.getContext = getContext;
    this.notify = notify;
    this.onState = onState;
    this.setSelection = setSelection;
    this.onEffect = onEffect;
    this.state = null;
    this.defaults = {};
  }
  supports(name) {
    return Object.hasOwn(this.tools, name);
  }
  owns(state) {
    return this.state !== null && this.state === state;
  }
  start(name) {
    if (!this.supports(name)) return false;
    this.state = this.tools[name].create({ ...structuredClone(this.getContext()), defaults: structuredClone(this.defaults[name]) });
    this.onState(this.state);
    return true;
  }
  cancel() {
    this.state = null;
  }
  dispatch(event) {
    if (!this.state) return false;
    const result = this.tools[this.state.name].handle(
      this.state,
      event,
      structuredClone(this.getContext()),
    );
    // Apply before advancing so a failed document transaction retains tool input.
    if (result.change) this.applyChange(structuredClone(result.change));
    if (result.defaults) this.defaults[this.state.name] = structuredClone(result.defaults);
    if (result.selection) this.setSelection([...result.selection]);
    this.state = result.state;
    this.onState(this.state);
    if (result.message) this.notify(result.message);
    if (result.effect) this.onEffect(structuredClone(result.effect));
    return true;
  }
  preview(cursor) {
    return this.state
      ? structuredClone(
          this.tools[this.state.name].preview(
            this.state,
            cursor,
            structuredClone(this.getContext()),
          ),
        )
      : [];
  }
  describe() {
    return this.state ? this.tools[this.state.name].describe(this.state) : null;
  }
}
