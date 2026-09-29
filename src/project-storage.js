// Owns persistence timing and serialization. UI decides how to report failures.
export class ProjectStorage {
  constructor(storage, { key = "liracad-v1", delay = 350 } = {}) {
    this.storage = storage;
    this.key = key;
    this.delay = delay;
    this.timer = null;
  }
  restore(validate) {
    try {
      const raw = this.storage().getItem(this.key);
      if (raw == null) return { document: null, error: false };
      const document = JSON.parse(raw);
      return validate(document)
        ? { document, error: false }
        : { document: null, error: true };
    } catch {
      return { document: null, error: true };
    }
  }
  cancel() {
    clearTimeout(this.timer);
    this.timer = null;
  }
  save(document) {
    this.cancel();
    this.storage().setItem(this.key, JSON.stringify(document));
  }
  schedule(getDocument, onComplete) {
    this.cancel();
    this.timer = setTimeout(() => {
      let error = null;
      try {
        this.save(getDocument());
      } catch (cause) {
        error = cause;
      }
      onComplete(error);
    }, this.delay);
  }
}
