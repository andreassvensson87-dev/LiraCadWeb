import { clone } from './values.js';

// Only objects owned here may be shared by snapshots. Arrays and metadata stay
// private to each snapshot; accepted entity contents cannot be changed outside
// a transaction. Drafts are still ordinary mutable structured clones.
const owned = new WeakSet();
function freezeOwned(value) {
  if (!value || typeof value !== 'object' || owned.has(value)) return value;
  owned.add(value);
  for (const child of Object.values(value)) freezeOwned(child);
  Object.freeze(value);
  return value;
}
export function ownDocument(document) {
  return sealDocument(clone(document));
}
export function sealDocument(document) {
  for (const entity of document.entities) freezeOwned(entity);
  return document;
}
export function copyDocumentSnapshot(document) {
  const { entities, ...metadata } = document;
  return { ...clone(metadata), entities: entities.map(entity => owned.has(entity) ? entity : freezeOwned(clone(entity))) };
}
