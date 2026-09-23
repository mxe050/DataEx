// Uses only a new temporary browser profile; never opens the user's saved data.
// DATAEX_PLAYWRIGHT_MODULE may point at an existing Playwright installation.
const { chromium } = require(process.env.DATAEX_PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const fixtureURL = 'http://127.0.0.1:8766/dataex-review-projects.test.html';
  const script = fs.readFileSync(path.join(__dirname, 'dataex-review-projects.js'), 'utf8');
  try {
    await context.route(fixtureURL, route => route.fulfill({
      contentType: 'text/html', body: '<!doctype html><title>Isolated review catalog regression</title>'
    }));
    await page.goto(fixtureURL);
    await page.addScriptTag({ content: script });
    const first = await page.evaluate(async () => {
      const api = window.DataExReviewProjects;
      const checks = [];
      function check(condition, label) { if (!condition) throw new Error(label); checks.push(label); }
      async function rejects(action, pattern) {
        let error;
        try { await action(); } catch (caught) { error = caught; }
        if (!error || !pattern.test(error.message)) throw new Error('Expected rejection: ' + pattern);
      }
      function seedStudyDB() {
        return new Promise((resolve, reject) => {
          const request = indexedDB.open('studiesDB1', 1);
          request.onupgradeneeded = () => request.result.createObjectStore('sentinel', { keyPath: 'id' });
          request.onerror = () => reject(request.error);
          request.onsuccess = () => {
            const db = request.result;
            const tx = db.transaction('sentinel', 'readwrite');
            tx.objectStore('sentinel').add({ id: 'existing', raw: 'unchanged' });
            tx.oncomplete = () => { db.close(); resolve(); };
            tx.onabort = () => reject(tx.error);
          };
        });
      }
      await seedStudyDB();
      check((await api.all()).length === 0 && await api.active() === null, 'Empty catalog has no active review');
      for (const label of ['', '  ', 'x'.repeat(501), null]) await rejects(() => api.create(label), /1～500/);
      check((await api.all()).length === 0 && await api.active() === null, 'Invalid names leave catalog and selection untouched');

      const first = await api.create('  顎関節症 Review A  ');
      check(/^review:[0-9a-f-]{36}$/i.test(first.id), 'New reviews receive opaque UUID IDs');
      check(first.label === '顎関節症 Review A' && first.context.reviewName === first.label, 'Trimmed label initializes review context');
      check(first.context.population === '' && first.context.outcomes.length === 0 && await api.active() === first.id, 'Empty review and active selection are persisted together');
      await rejects(() => api.create(first.label), /同じ名前/);
      check((await api.all()).length === 1 && await api.active() === first.id, 'Duplicate label rejection is mutation-free');

      const draft = { reviewName: 'Draft A', population: 'Adults', intervention: 'I', comparator: 'C', outcomes: ['Pain'], raw: 'not stored', pdf: new Blob(['not stored']) };
      const saving = api.saveContext(first.id, draft);
      draft.population = 'mutated'; draft.outcomes.push('mutated');
      const saved = await saving;
      check(saved.id === first.id && saved.label === first.label && saved.context.population === 'Adults' && saved.context.outcomes.length === 1, 'Context is snapshotted and identity/label preserved');
      check(!('raw' in saved.context) && !('pdf' in saved.context), 'Only review form fields are stored');
      saved.context.outcomes.push('mutated result');
      const read = await api.get(first.id);
      read.context.outcomes.push('mutated read');
      const listed = await api.all(); listed[0].context.population = 'mutated list';
      check((await api.get(first.id)).context.outcomes.length === 1 && (await api.get(first.id)).context.population === 'Adults', 'Caller and returned objects cannot mutate persisted context');
      check(await api.get('missing') === null, 'Unknown review lookup returns null');

      const second = await api.create('Review B');
      check(second.context.population === '' && second.context.outcomes.length === 0, 'New review does not inherit another review context');
      await api.setActive(first.id);
      await rejects(() => api.setActive('missing'), /見つかりません/);
      await rejects(() => api.saveContext('missing', draft), /見つかりません/);
      check(await api.active() === first.id && (await api.all()).length === 2, 'Missing review writes leave active review and catalog untouched');

      const legacy = await api.ensure({ id: 'legacy review ID 日本語', label: '旧レビュー' }, { population: 'Legacy population', outcomes: ['Legacy outcome'] });
      const retained = await api.ensure({ id: legacy.id, label: 'Renamed by migration' }, { population: 'must not overwrite', outcomes: [] });
      check(retained.label === '旧レビュー' && retained.context.population === 'Legacy population', 'Legacy migration is insert-only and preserves existing context');
      check(await api.active() === first.id, 'Migration never changes active selection');

      const originalPut = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put = function (...args) {
        const request = originalPut.apply(this, args);
        if (this.name === 'settings') this.transaction.abort();
        return request;
      };
      try { await rejects(() => api.create('Must rollback'), /./); }
      finally { IDBObjectStore.prototype.put = originalPut; }
      check(!(await api.all()).some(item => item.label === 'Must rollback') && await api.active() === first.id, 'Abort after writes rolls back both project and active selection');

      const concurrent = await Promise.allSettled([api.create('Concurrent review'), api.create('Concurrent review')]);
      check(concurrent.filter(item => item.status === 'fulfilled').length === 1 && (await api.all()).filter(item => item.label === 'Concurrent review').length === 1, 'Concurrent creation cannot bypass duplicate protection');
      await api.setActive(legacy.id);
      return { checks, firstId: first.id, legacyId: legacy.id, count: (await api.all()).length };
    });

    // A new document must reopen persisted state without loading the main app.
    await page.reload();
    await page.addScriptTag({ content: script });
    const persisted = await page.evaluate(async () => {
      const api = window.DataExReviewProjects;
      const sentinel = await new Promise((resolve, reject) => {
        const request = indexedDB.open('studiesDB1', 1);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction('sentinel', 'readonly');
          const read = tx.objectStore('sentinel').get('existing');
          tx.oncomplete = () => { db.close(); resolve(read.result); };
          tx.onabort = () => reject(tx.error);
        };
      });
      return { projects: await api.all(), active: await api.active(), sentinel };
    });
    assert.equal(persisted.projects.length, first.count);
    assert.equal(persisted.active, first.legacyId);
    assert.equal(persisted.projects.find(item => item.id === first.firstId).context.population, 'Adults');
    assert.deepEqual(persisted.sentinel, { id: 'existing', raw: 'unchanged' });
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ passed: [...first.checks, 'Catalog, draft context, and active review survive document reload', 'Existing studiesDB1 content remains untouched'] }, null, 2));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
