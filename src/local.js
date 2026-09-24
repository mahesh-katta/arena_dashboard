/* On-device storage for when there is no server — which is every time the app
   runs as the Android build.

   localStorage would be the obvious choice and is the wrong one: it caps out
   around 5MB in most browsers, and a full history of 12,826 attempts plus notes
   goes past that. IndexedDB has room, so everything lives there, keyed by name.
   Anything already in localStorage from an earlier version is carried over once
   and then left alone. */

const DB = "area-drill";
const STORE = "kv";
let dbp = null;

function open() {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbp;
}

export async function idbGet(key) {
  try {
    const db = await open();
    return await new Promise((resolve, reject) => {
      const r = db.transaction(STORE, "readonly").objectStore(STORE).get(key);
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
  } catch { return undefined; }
}

export async function idbSet(key, value) {
  try {
    const db = await open();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(value, key);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
  } catch { return false; }
}

/* One-time lift of whatever the older localStorage build left behind. */
export async function migrateFromLocalStorage(key, lsKey, shape) {
  const have = await idbGet(key);
  if (have !== undefined) return have;
  let old;
  try { old = JSON.parse(localStorage.getItem(lsKey)); } catch { old = null; }
  const value = old && typeof old === "object" ? old : shape;
  await idbSet(key, value);
  return value;
}

/* Android keeps app storage for the life of the install, but a browser can
   still evict it under pressure. Asking costs nothing and usually succeeds once
   the app is installed. */
export async function askToPersist() {
  try {
    if (navigator.storage && navigator.storage.persist && !(await navigator.storage.persisted()))
      return await navigator.storage.persist();
  } catch {}
  return false;
}
