// Browser adapter. A write succeeds only when the transaction commits.
export class IndexedDBProjectStore {
  constructor(factory = () => globalThis.indexedDB, { name = 'liracad-projects', timeout = 10000, key = 'current' } = {}) {
    this.factory = factory;
    this.name = name;
    this.timeout = timeout;
    this.key = key;
    this.connection = null;
    this.database = null;
    // Same-scope IndexedDB transactions execute in creation order. Register
    // queued writes immediately so a reload's read cannot slip between them.
    this.orderedWrites = true;
  }
  open() {
    if (this.connection) return this.connection;
    this.connection = new Promise((resolve, reject) => {
      let request, settled = false;
      const fail = error => { if (!settled) { settled = true; clearTimeout(timer); reject(error); } };
      const timer = setTimeout(() => fail(Error('Lokal lagring svarar inte.')), this.timeout);
      try {
        const factory = this.factory();
        if (!factory) throw Error('IndexedDB är inte tillgängligt.');
        request = factory.open(this.name, 1);
        request.onupgradeneeded = () => {
          if (!request.result.objectStoreNames.contains('drafts')) request.result.createObjectStore('drafts');
        };
        request.onblocked = () => fail(Error('Lokal lagring blockeras av ett annat appfönster.'));
        request.onerror = () => fail(request.error || Error('Lokal lagring kunde inte öppnas.'));
        request.onsuccess = () => {
          const db = request.result;
          if (settled) { db.close(); return; }
          settled = true; clearTimeout(timer);
          this.database = db;
          db.onversionchange = () => { db.close(); this.connection = null; this.database = null; };
          resolve(db);
        };
      } catch (error) { fail(error); }
    }).catch(error => { this.connection = null; throw error; });
    return this.connection;
  }
  transaction(mode, operation) {
    // pagehide must start a transaction synchronously on the open connection.
    // Deferring put() to a promise continuation can lose the final change.
    if (this.database) return this.performTransaction(this.database,mode,operation);
    return this.open().then(db=>this.performTransaction(db,mode,operation));
  }
  performTransaction(db,mode,operation) {
    return new Promise((resolve, reject) => {
      let transaction, value, operationError;
      const timer = setTimeout(() => {
        operationError = Error('Lokal sparning tog för lång tid.');
        try { transaction?.abort(); } catch {}
        reject(operationError);
      }, this.timeout);
      try {
        transaction = db.transaction('drafts', mode);
        transaction.oncomplete = () => { clearTimeout(timer); resolve(value); };
        transaction.onabort = () => { clearTimeout(timer); reject(operationError || transaction.error || Error('Lokal sparning avbröts.')); };
        const request = operation(transaction.objectStore('drafts'));
        request.onsuccess = () => { value = request.result; };
        request.onerror = () => { operationError = request.error; };
      } catch (error) {
        clearTimeout(timer);
        if (transaction) { operationError = error; transaction.abort(); }
        else reject(error);
      }
    });
  }
  async read() {
    const record = await this.transaction('readonly', store => store.get(this.key));
    this.checkpoint = record?.storageVersion === 1 ? record.revision : null;
    return record?.storageVersion === 1 ? record.document : record;
  }
  async write(document, revision = crypto.randomUUID()) {
    await this.transaction('readwrite', store => store.put({storageVersion:1,revision,document}, this.key));
    this.checkpoint = revision;
  }
  clear() { return this.transaction('readwrite', store => store.delete(this.key)); }
  async close() {
    const connection = this.connection;
    this.connection = null;
    this.database = null;
    if (connection) (await connection).close();
  }
}
