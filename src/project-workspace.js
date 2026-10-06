import { DocumentSession } from './document-session.js';
import { validDocument } from './document.js';

const manifestKey = 'liracad-workspace-v1';
const validId = id => id === 'current' || /^project-[a-zA-Z0-9-]+$/.test(id);

// Sessions/history belong to projects. Rendering indexes belong only to the
// active canvas. Closed projects keep their saved record, but release sessions.
export class ProjectWorkspace {
  constructor({ createStorage, metadata, fallback, onError = () => {} }) {
    this.createStorage = createStorage;
    this.metadata = metadata;
    this.fallback = fallback;
    this.onError = onError;
    this.entries = [];
    this.closed = [];
    this.activeId = null;
    this.manifestAllowed = true;
  }
  get active() { return this.entries.find(entry => entry.id === this.activeId); }
  async restore() {
    let manifest = { open: [{id:'current'}], closed: [], active: 'current' };
    try {
      const raw = this.metadata()?.getItem(manifestKey);
      if (raw != null) {
        const value = JSON.parse(raw);
        const all = [...(value.open || []), ...(value.closed || [])];
        if (value.version !== 1 || !Array.isArray(value.open) || !value.open.length || !Array.isArray(value.closed) ||
          all.some(entry => !entry || !validId(entry.id)) || new Set(all.map(entry => entry.id)).size !== all.length ||
          !value.open.some(entry => entry.id === value.active)) throw Error('Projektflikarnas sparade lista är ogiltig.');
        manifest = value;
      }
    } catch(error) { this.manifestAllowed = false; this.manifestError = error; this.onError(error); }
    for (const item of manifest.open) this.entries.push(await this.readEntry(item));
    this.closed = manifest.closed;
    this.activeId = manifest.active;
    return this.active;
  }
  async readEntry(item) {
    const storage = this.createStorage(item.id);
    const restored = await storage.restore(validDocument);
    const entry = { id: item.id, storage, session: new DocumentSession(restored.document || this.fallback()),
      context: item.context || null, restored, saveState: restored.error ? 'Autosparning pausad' : 'Autosparat lokalt',
      saveError: restored.cause || restored.migrationError || restored.recoveryError || null, registered: true };
    try { await storage.initialize(entry.session.document); }
    catch(error) { entry.saveError = error; }
    if (entry.saveError && !restored.error) entry.saveState = 'Kunde inte autospara';
    return entry;
  }
  add(document) {
    const id = 'project-' + crypto.randomUUID(), storage = this.createStorage(id);
    const entry = {id,storage,session:new DocumentSession(document),context:null,
      saveState:'Sparar…',saveError:null,registered:false};
    this.entries.push(entry);
    this.activeId = id;
    entry.ready = storage.initialize(entry.session.document).then(() => {
      entry.registered = true;
      entry.saveState = 'Autosparat lokalt';
      this.persist();
    }, error => { entry.saveError = error; entry.saveState = 'Kunde inte autospara'; this.onError(error); });
    return entry;
  }
  activate(id) {
    if (!this.entries.some(entry => entry.id === id)) throw Error('Projektfliken saknas.');
    this.activeId = id;
    this.persist();
  }
  async close(id) {
    const index = this.entries.findIndex(entry => entry.id === id);
    if (index < 0 || this.entries.length === 1) return false;
    const entry = this.entries[index];
    if (!entry.storage.writeAllowed) throw Error('Projektet kan inte autosparas. Spara till fil innan du stänger fliken.');
    await entry.ready;
    await entry.storage.save(entry.session.document);
    // Persist the recovery destination before releasing the session.
    const previousClosed = this.closed;
    this.closed = [...this.closed, this.describe(entry)];
    this.entries.splice(index,1);
    const previousActive = this.activeId;
    if (this.activeId === id) this.activeId = this.entries[Math.min(index,this.entries.length-1)].id;
    try { this.persist(true); }
    catch(error) {
      this.entries.splice(index,0,entry); this.closed = previousClosed; this.activeId = previousActive; throw error;
    }
    await entry.storage.store.close?.();
    return true;
  }
  async reopen(id) {
    const item = this.closed.find(entry => entry.id === id);
    if (!item) return null;
    const entry = await this.readEntry(item);
    this.entries.push(entry);
    this.closed = this.closed.filter(entry => entry.id !== id);
    this.activeId = id;
    this.persist();
    return entry;
  }
  describe(entry) {
    // Selection may contain 100,000 IDs. It belongs to the live session rather
    // than the small, synchronous startup manifest.
    const context = entry.context && {...entry.context,selection:undefined};
    return {id:entry.id,name:entry.session.document.name,context};
  }
  persist(strict = false) {
    try {
      if (!this.manifestAllowed) throw Error('Fliklistan kan inte sparas utan att skriva över en oläsbar lista.');
      const open = this.entries.filter(entry => entry.registered).map(entry => this.describe(entry));
      if (!open.length) return;
      const active = open.some(entry => entry.id === this.activeId) ? this.activeId : open[0].id;
      this.metadata().setItem(manifestKey,JSON.stringify({version:1,open,closed:this.closed,active}));
      this.manifestError = null;
    } catch(error) { this.manifestError = error; this.onError(error); if(strict)throw error; }
  }
  flush() { return Promise.all(this.entries.map(entry => entry.storage.flush())); }
}
