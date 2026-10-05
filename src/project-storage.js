// Persistence orchestration: migration, debounce, ordered writes and feedback.
import {createDocumentPatch,applyDocumentPatch} from './document-journal.js';
export class ProjectStorage {
  constructor(store, { legacyStorage = null, journalStorage = null, key = "liracad-v1", delay = 350 } = {}) {
    this.store = store;
    this.legacyStorage = legacyStorage;
    this.key = key;
    this.delay = delay;
    this.timer = null;
    this.pending = null;
    this.revision = 0;
    this.tail = Promise.resolve();
    this.writeAllowed = true;
    this.journalStorage = journalStorage;
    this.journalKey = key+'-pending-additions';
    this.records = [];
    this.documentRevision = null;
  }
  async restore(validate) {
    try {
      const current = await this.store.read();
      if (current !== undefined && current !== null) {
        if (!validate(current)) throw Error('Det lokala utkastet är ogiltigt.');
        this.writeAllowed = true;
        return await this.recoverJournal(current,validate);
      }
      if(this.journalStorage?.()?.getItem(this.journalKey)!=null)throw Error('Basritningen för väntande ändringar saknas.');
      const legacy = this.legacyStorage?.();
      const raw = legacy?.getItem(this.key);
      if (raw == null) { this.writeAllowed = true; return { document: null, error: false }; }
      const document = JSON.parse(raw);
      if (!validate(document)) throw Error('Det äldre utkastet är ogiltigt.');
      this.writeAllowed = true;
      try { await this.store.write(document); }
      catch (migrationError) { return {document,error:false,migrationError}; }
      try { legacy.removeItem(this.key); } catch {} // committed copy is safe
      return {document,error:false,migrated:true};
    } catch (cause) {
      this.writeAllowed = false; // never overwrite an unreadable draft
      return { document: null, error: true, cause };
    }
  }
  async recoverJournal(document,validate) {
    const raw=this.journalStorage?.()?.getItem(this.journalKey);
    if(raw==null)return {document,error:false};
    const journal=JSON.parse(raw),checkpoint=this.store.checkpoint;
    if((journal.version!==undefined&&journal.version!==2)||typeof journal.base!=='string'||!Array.isArray(journal.records))throw Error('Sparloggen är ogiltig.');
    let expected=journal.base;const seen=new Set([expected]);
    for(const record of journal.records){
      if(record.before!==expected||typeof record.after!=='string'||seen.has(record.after)||(!record.patch&&!Array.isArray(record.entities)))throw Error('Sparloggen är ofullständig.');
      seen.add(record.after);
      expected=record.after;
    }
    if(journal.base!==checkpoint) {
      const position=journal.records.findIndex(record=>record.after===checkpoint);
      if(position<0)throw Error('Väntande ändringar hör till ett annat utkast.');
      journal.records=journal.records.slice(position+1);
    }
    let next=document;
    for(const record of journal.records){
      next=record.patch?applyDocumentPatch(next,record.patch):{...next,entities:next.entities.concat(record.entities)};
      if(!validate(next))throw Error('Väntande ändringar är ogiltiga.');
    }
    try { await this.store.write(next,journal.records.at(-1)?.after || checkpoint); }
    catch(recoveryError) {
      this.records=journal.records;
      this.documentRevision=journal.records.at(-1)?.after || checkpoint;
      return {document:next,error:false,recovered:true,recoveryError};
    }
    try { this.journalStorage().removeItem(this.journalKey); } catch {} // committed checkpoint prevents duplicates
    return {document:next,error:false,recovered:true};
  }
  async initialize(document) {
    this.observedDocument=document;
    this.documentRevision ||= this.store.checkpoint || crypto.randomUUID();
    if(this.writeAllowed && !this.store.checkpoint)await this.save(document);
  }
  observe(document) {
    if(this.observedDocument===document)return;
    const patch=this.observedDocument?createDocumentPatch(this.observedDocument,document):null;
    this.observedDocument=document;
    if(patch)this.recordChange({patch});
  }
  recordAddition(document,entities) {
    this.observedDocument=document;
    this.recordChange({entities});
  }
  recordChange(change) {
    if(!this.journalStorage || !this.writeAllowed)return;
    const before=this.documentRevision,after=crypto.randomUUID();
    this.records.push({before,after,...structuredClone(change)});
    this.documentRevision=after;
    try {
      if(!this.store.checkpoint)throw Error('Basritningen måste autosparas innan ändringsloggen kan skydda ändringen.');
      this.journalStorage().setItem(this.journalKey,JSON.stringify({version:2,base:this.records[0].before,records:this.records}));
      this.journalError=null;
    } catch(error){this.journalError=error;throw error;}
  }
  cancel() {
    clearTimeout(this.timer);
    this.timer = null;
    this.pending = null;
    this.revision++;
  }
  enqueue(document, revision, onComplete = () => {}) {
    const checkpoint=this.documentRevision;
    const start = () => {
      if (!this.writeAllowed) throw Error('Autosparning är pausad för att skydda ett oläsbart utkast.');
      return this.store.write(document,checkpoint);
    };
    let write;
    if(this.store.orderedWrites) {
      try { write=Promise.resolve(start()); }
      catch(error){write=Promise.reject(error);}
    } else write=this.tail.catch(() => {}).then(start);
    this.tail = write;
    return write.then(() => {
      const position=this.records.findIndex(record=>record.after===checkpoint);
      if(position>=0) {
        this.records=this.records.slice(position+1);
        try {
          if(!this.records.length)this.journalStorage?.()?.removeItem(this.journalKey);
          else this.journalStorage?.()?.setItem(this.journalKey,JSON.stringify({version:2,base:checkpoint,records:this.records}));
        } catch {} // the committed document is still saved; keep any old recovery log
      }
      if (revision === this.revision) {this.journalError=null;onComplete(null);}
    }, error => {
      if (revision === this.revision) onComplete(error);
      throw error;
    });
  }
  save(document, onComplete) {
    this.cancel();
    return this.enqueue(document,this.revision,onComplete);
  }
  schedule(getDocument, onComplete) {
    this.cancel();
    this.pending = {getDocument,onComplete,revision:this.revision};
    this.timer = setTimeout(() => { this.flush().catch(() => {}); },this.delay);
  }
  flush() {
    if (!this.pending) return this.tail;
    const {getDocument,onComplete,revision} = this.pending;
    clearTimeout(this.timer); this.timer = null; this.pending = null;
    try { return this.enqueue(getDocument(),revision,onComplete); }
    catch (error) {
      if (revision === this.revision) onComplete(error);
      return Promise.reject(error);
    }
  }
}
