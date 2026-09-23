/* Review workspace metadata only. Study/PDF/Raw storage remains in studiesDB1. */
(function (root) {
  'use strict';

  const DB_NAME = 'dataex-review-projects';
  const DB_VERSION = 1;
  const ACTIVE_KEY = 'activeReview';
  let opening = null;

  function clone(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
  }

  function validId(value) {
    if (typeof value !== 'string' || !value.trim()) {
      throw new Error('レビューIDが正しくありません。');
    }
    // Existing study records may use older, non-UUID IDs. Preserve them exactly.
    return value;
  }

  function validLabel(value) {
    const label = typeof value === 'string' ? value.trim() : '';
    if (!label || label.length > 500) {
      throw new Error('レビュー名は1～500文字で入力してください。');
    }
    return label;
  }

  function contextOnly(value, label) {
    const source = value == null ? {} : value;
    if (typeof source !== 'object' || Array.isArray(source)) {
      throw new Error('レビューの入力内容が正しくありません。');
    }
    const context = {};
    for (const key of ['reviewName', 'population', 'intervention', 'comparator']) {
      const field = source[key];
      if (field != null && typeof field !== 'string') {
        throw new Error('レビューの入力内容は文字列で指定してください。');
      }
      context[key] = field == null ? (key === 'reviewName' ? label : '') : field;
    }
    const outcomes = source.outcomes == null ? [] : source.outcomes;
    if (!Array.isArray(outcomes) || outcomes.some(item => typeof item !== 'string')) {
      throw new Error('アウトカムは文字列の配列で指定してください。');
    }
    context.outcomes = outcomes.slice();
    return context;
  }

  function openDB() {
    if (opening) return opening;
    const pending = new Promise((resolve, reject) => {
      if (!root.indexedDB) {
        reject(new Error('このブラウザではレビューを保存できません。'));
        return;
      }
      const request = root.indexedDB.open(DB_NAME, DB_VERSION);
      let blocked = false;
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('projects')) db.createObjectStore('projects', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('settings')) db.createObjectStore('settings', { keyPath: 'id' });
      };
      request.onerror = () => reject(request.error || new Error('レビュー保存領域を開けませんでした。'));
      request.onblocked = () => {
        blocked = true;
        reject(new Error('レビュー保存領域を開けませんでした。ほかのDataExタブを閉じて再試行してください。'));
      };
      request.onsuccess = () => {
        const db = request.result;
        if (blocked) { db.close(); return; }
        db.onversionchange = () => { db.close(); opening = null; };
        db.onclose = () => { opening = null; };
        resolve(db);
      };
    });
    opening = pending;
    pending.catch(() => { if (opening === pending) opening = null; });
    return pending;
  }

  async function transact(names, mode, work) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(names, mode);
      let result;
      let failure;
      // Request success is provisional. Only a committed transaction succeeds.
      tx.oncomplete = () => resolve(clone(result));
      tx.onabort = () => reject(failure || tx.error || new Error('レビューを保存できませんでした。'));
      function fail(error) {
        failure = error;
        try { tx.abort(); } catch (_) { reject(error); }
      }
      function guard(callback) {
        return event => {
          try { callback(event); } catch (error) { fail(error); }
        };
      }
      try { work(tx, value => { result = value; }, fail, guard); }
      catch (error) { fail(error); }
    });
  }

  async function all() {
    return transact(['projects'], 'readonly', (tx, done, fail, guard) => {
      const request = tx.objectStore('projects').getAll();
      request.onsuccess = guard(() => done(request.result));
    });
  }

  async function get(id) {
    id = validId(id);
    return transact(['projects'], 'readonly', (tx, done, fail, guard) => {
      const request = tx.objectStore('projects').get(id);
      request.onsuccess = guard(() => done(request.result || null));
    });
  }

  async function create(label) {
    label = validLabel(label);
    if (!root.crypto || typeof root.crypto.randomUUID !== 'function') {
      throw new Error('レビューIDを作成できません。ブラウザの対応状況を確認してください。');
    }
    const project = { id: 'review:' + root.crypto.randomUUID(), label, createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(), context: contextOnly(null, label) };
    return transact(['projects', 'settings'], 'readwrite', (tx, done, fail, guard) => {
      const projects = tx.objectStore('projects');
      const request = projects.getAll();
      request.onsuccess = guard(() => {
        if (request.result.some(item => item.label === label)) {
          fail(new Error('同じ名前のレビューがあります。既存のレビューを選ぶか、別の名前を入力してください。'));
          return;
        }
        projects.add(project);
        tx.objectStore('settings').put({ id: ACTIVE_KEY, reviewId: project.id });
        done(project);
      });
    });
  }

  async function ensure(project, context) {
    if (!project || typeof project !== 'object') throw new Error('レビューが正しくありません。');
    const candidate = {
      id: validId(project.id),
      label: validLabel(project.label),
      context: contextOnly(context === undefined ? project.context : context, validLabel(project.label))
    };
    return transact(['projects'], 'readwrite', (tx, done, fail, guard) => {
      const projects = tx.objectStore('projects');
      const request = projects.get(candidate.id);
      request.onsuccess = guard(() => {
        if (request.result) { done(request.result); return; }
        projects.add(candidate);
        done(candidate);
      });
    });
  }

  async function saveContext(id, context) {
    id = validId(id);
    // Snapshot the caller's fields before the first asynchronous boundary.
    const snapshot = contextOnly(context, '');
    const defaultName = !context || context.reviewName == null;
    return transact(['projects'], 'readwrite', (tx, done, fail, guard) => {
      const projects = tx.objectStore('projects');
      const request = projects.get(id);
      request.onsuccess = guard(() => {
        const current = request.result;
        if (!current) { fail(new Error('指定されたレビューが見つかりません。')); return; }
        if (defaultName) snapshot.reviewName = current.label;
        const updated = { ...current, context: snapshot, updatedAt:new Date().toISOString() };
        projects.put(updated);
        done(updated);
      });
    });
  }

  async function active() {
    return transact(['projects', 'settings'], 'readonly', (tx, done, fail, guard) => {
      const request = tx.objectStore('settings').get(ACTIVE_KEY);
      request.onsuccess = guard(() => {
        if (!request.result || typeof request.result.reviewId !== 'string') { done(null); return; }
        const id = request.result.reviewId;
        const project = tx.objectStore('projects').get(id);
        project.onsuccess = guard(() => done(project.result ? id : null));
      });
    });
  }

  async function setActive(id) {
    id = validId(id);
    return transact(['projects', 'settings'], 'readwrite', (tx, done, fail, guard) => {
      const request = tx.objectStore('projects').get(id);
      request.onsuccess = guard(() => {
        if (!request.result) { fail(new Error('指定されたレビューが見つかりません。')); return; }
        tx.objectStore('settings').put({ id: ACTIVE_KEY, reviewId: id });
        done(id);
      });
    });
  }

  async function remove(id) {
    id = validId(id);
    return transact(['projects', 'settings'], 'readwrite', (tx, done, fail, guard) => {
      const projects = tx.objectStore('projects');
      const request = projects.get(id);
      request.onsuccess = guard(() => {
        if (!request.result) { fail(new Error('削除する作業が見つかりません。')); return; }
        const project = request.result;
        projects.delete(id);
        const settings = tx.objectStore('settings');
        const active = settings.get(ACTIVE_KEY);
        active.onsuccess = guard(() => {
          if (active.result?.reviewId === id) settings.delete(ACTIVE_KEY);
          done(project);
        });
      });
    });
  }

  async function rename(id,label){id=validId(id);label=validLabel(label);return transact(['projects'],'readwrite',(tx,done,fail,guard)=>{const st=tx.objectStore('projects'),q=st.get(id);q.onsuccess=guard(()=>{if(!q.result)throw Error('作業が見つかりません。');const p={...q.result,label,context:{...q.result.context,reviewName:label},updatedAt:new Date().toISOString()};st.put(p);done(p);});});}
  root.DataExReviewProjects = Object.freeze({ rename, remove, all, create, ensure, saveContext, active, setActive, get });
})(window);
