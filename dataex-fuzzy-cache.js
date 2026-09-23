/* Snapshot cache with an atomic IndexedDB fallback. Legacy entries are never removed. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory;
  else root.DataExFuzzyCache = factory(root);
})(typeof window !== 'undefined' ? window : globalThis, function (environment) {
  'use strict';
  const DB = 'dataex-fuzzy-snapshot-cache', TABLE = 'entries';
  let opening, pending = Promise.resolve();
  function open() {
    if (!opening) opening = new Promise((resolve, reject) => {
      const request = environment.indexedDB.open(DB, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(TABLE, {keyPath:'key'});
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(Error('抽出履歴の保存先を開けません。'));
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => { db.close(); opening = null; };
        resolve(db);
      };
    }).catch(error => { opening = null; throw error; });
    return opening;
  }
  async function readDatabase(key) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const request = db.transaction(TABLE).objectStore(TABLE).get(key);
      request.onsuccess = () => resolve(request.result?.value ?? null);
      request.onerror = () => reject(request.error);
    });
  }
  function readLegacy(key) {
    try { const value = environment.localStorage.getItem(key); return value ? JSON.parse(value) : null; }
    catch (_) { return null; }
  }
  async function writeDatabase(key, latestKey, value) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(TABLE, 'readwrite'), store = tx.objectStore(TABLE);
      let failure;
      tx.oncomplete = () => resolve({backend:'IndexedDB'});
      tx.onerror = () => reject(failure || tx.error || Error('抽出履歴を保存できません。'));
      tx.onabort = () => reject(failure || tx.error || Error('抽出履歴の保存を中断しました。'));
      try {
        store.put({key, value});
        store.put({key:latestKey, value:{key}});
      } catch (error) { failure = error; tx.abort(); }
    });
  }
  function writeSnapshot(key, latestKey, value) {
    // Capture the exact request before a PDF/review switch changes the caller's state.
    const json = JSON.stringify(value), captured = JSON.parse(json);
    const task = pending.then(async () => {
      let fallback;
      try { fallback = await readDatabase(latestKey); } catch (_) { /* localStorage can still work. */ }
      // Once a scope uses the fallback, keep its latest pointer in that same backend.
      if (!fallback) {
        try {
          environment.localStorage.setItem(key, json);
          environment.localStorage.setItem(latestKey, JSON.stringify({key}));
          return {backend:'localStorage'};
        } catch (_) { /* Never evict another request or review to create space. */ }
      }
      return writeDatabase(key, latestKey, captured);
    });
    pending = task.catch(() => {});
    return task;
  }
  async function readSnapshot(latestKey, legacyLatestKey) {
    await pending;
    try {
      const latest = await readDatabase(latestKey);
      if (latest?.key) {
        const saved = await readDatabase(latest.key);
        if (saved) return saved;
      }
    } catch (_) { /* Keep older localStorage results readable if IndexedDB is unavailable. */ }
    const latest = readLegacy(latestKey) || (legacyLatestKey ? readLegacy(legacyLatestKey) : null);
    return latest?.key ? readLegacy(latest.key) : null;
  }
  async function removeReview(reviewId) {
    await pending;
    const marker = ':review:' + encodeURIComponent(reviewId) + ':';
    let removed = 0;
    const db = await open();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(TABLE, 'readwrite'), store = tx.objectStore(TABLE), keys = store.getAllKeys();
      let failure;
      tx.oncomplete = resolve;
      tx.onabort = () => reject(failure || tx.error || Error('抽出履歴をクリアできませんでした。'));
      keys.onsuccess = () => { try { for (const key of keys.result) if (String(key).includes(marker)) { store.delete(key); removed++; } } catch (error) { failure = error; tx.abort(); } };
      keys.onerror = () => { failure = keys.error; tx.abort(); };
    });
    try {
      const keys = [];
      for (let i = 0; i < environment.localStorage.length; i++) keys.push(environment.localStorage.key(i));
      for (const key of keys) if (key && key.includes(marker)) { environment.localStorage.removeItem(key); removed++; }
    } catch (_) { /* IndexedDB deletion remains authoritative. */ }
    return removed;
  }
  return Object.freeze({writeSnapshot, readSnapshot, removeReview, whenIdle:() => pending});
});
