import { openDB } from 'idb';

export const DB_NAME = 'offline-ops-portal';
export const DB_VERSION = 1;

export async function getDb() {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('catalog')) {
        db.createObjectStore('catalog', { keyPath: 'code' });
      }
      if (!db.objectStoreNames.contains('meta')) {
        db.createObjectStore('meta', { keyPath: 'key' });
      }
      if (!db.objectStoreNames.contains('favorites')) {
        db.createObjectStore('favorites', { keyPath: 'code' });
      }
      if (!db.objectStoreNames.contains('history')) {
        db.createObjectStore('history', { keyPath: 'id', autoIncrement: true });
      }
      if (!db.objectStoreNames.contains('queue')) {
        const s = db.createObjectStore('queue', { keyPath: 'idempotencyKey' });
        s.createIndex('createdAt', 'createdAt');
        s.createIndex('status', 'status');
      }
    },
  });
}

export async function putMeta(key, value) {
  const db = await getDb();
  await db.put('meta', { key, value, at: Date.now() });
}

export async function getMeta(key) {
  const db = await getDb();
  return (await db.get('meta', key))?.value;
}

export async function upsertCatalog(entries) {
  const db = await getDb();
  const tx = db.transaction('catalog', 'readwrite');
  for (const e of entries) await tx.store.put(e);
  await tx.done;
  await putMeta('catalogLastSync', new Date().toISOString());
}

export async function getCatalog() {
  const db = await getDb();
  return db.getAll('catalog');
}

export async function toggleFavorite(code) {
  const db = await getDb();
  const existing = await db.get('favorites', code);
  if (existing) await db.delete('favorites', code);
  else await db.put('favorites', { code, at: Date.now() });
}

export async function getFavorites() {
  const db = await getDb();
  return (await db.getAll('favorites')).map(f => f.code);
}

export async function recordHistory(code) {
  const db = await getDb();
  await db.add('history', { code, at: Date.now() });
  // trim older than 90 days
  const cutoff = Date.now() - 90 * 24 * 3600 * 1000;
  const all = await db.getAll('history');
  const tx = db.transaction('history', 'readwrite');
  for (const h of all) if (h.at < cutoff) await tx.store.delete(h.id);
  await tx.done;
}

export async function getHistory() {
  const db = await getDb();
  const all = await db.getAll('history');
  return all.sort((a, b) => b.at - a.at).slice(0, 50);
}
