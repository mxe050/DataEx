// Runs in a fresh browser profile. It never opens or clears the user's IndexedDB.
const { chromium } = require(process.env.DATAEX_PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');

const appURL = 'http://127.0.0.1:8766/dataex-chatgpt.html';
const seedURL = 'http://127.0.0.1:8766/dataex-work-clear-isolated.test.html';
const edge = process.env.DATAEX_BROWSER_EXECUTABLE || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: edge });
  const context = await browser.newContext();
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await context.route(seedURL, route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>isolated clear seed</title>' }));
  try {
    await page.goto(seedURL);
    await page.evaluate(async () => {
      const target = { id:'review:clear-target', label:'架空デモ 削除テスト作業', createdAt:new Date().toISOString(), updatedAt:new Date().toISOString(), context:{reviewName:'架空デモ 削除テスト作業',population:'',intervention:'',comparator:'',outcomes:[]} };
      const keep = { id:'review:keep', label:'保持テスト作業', createdAt:new Date().toISOString(), updatedAt:new Date().toISOString(), context:{reviewName:'保持テスト作業',population:'',intervention:'',comparator:'',outcomes:[]} };
      await new Promise((resolve,reject) => {
        const request=indexedDB.open('dataex-review-projects',1);
        request.onupgradeneeded=()=>{request.result.createObjectStore('projects',{keyPath:'id'});request.result.createObjectStore('settings',{keyPath:'id'});};
        request.onerror=()=>reject(request.error);
        request.onsuccess=()=>{const db=request.result,tx=db.transaction(['projects','settings'],'readwrite');tx.objectStore('projects').put(target);tx.objectStore('projects').put(keep);tx.objectStore('settings').put({id:'activeReview',reviewId:target.id});tx.oncomplete=()=>{db.close();resolve();};tx.onabort=()=>reject(tx.error);};
      });
      localStorage.setItem('dataex:fuzzy:v1:context',JSON.stringify({schemaVersion:1,reviewContext:target.context}));
      localStorage.setItem('dataex:fuzzy:v1:context:pdf-queue',JSON.stringify([{key:'target',filename:'target.pdf',reviewId:target.id,phase:'saved'},{key:'keep',filename:'keep.pdf',reviewId:keep.id,phase:'saved'}]));
    });
    await context.unroute(seedURL);
    await page.goto(appURL);
    await page.waitForFunction(() => window.DataExReview?.selectedProject?.()?.id === 'review:clear-target');
    await page.evaluate(async () => {
      await window.DataExReview.prepareCollection();
      const template=window.DataExWorkSession.template(window.DataExDecision,'binary',true);
      const preview=window.DataExWorkSession.inspect(template.csv,{D:window.DataExDecision,filename:'FICTIONAL_CLEAR_TEST.csv',hash:'isolated-clear-test',imports:[],mapping:{}});
      if(preview.errors.length)throw Error(preview.errors.map(e=>e.reason).join(' / '));
      await window.DataExReview.importCSV(preview);
      const marker = encodeURIComponent('review:clear-target'), keep = encodeURIComponent('review:keep');
      await window.DataExFuzzyCache.writeSnapshot('dataex:fuzzy:v1:study:target:review:'+marker+':request','dataex:fuzzy:v1:study:target:review:'+marker+':latest',{target:true});
      await window.DataExFuzzyCache.writeSnapshot('dataex:fuzzy:v1:study:keep:review:'+keep+':request','dataex:fuzzy:v1:study:keep:review:'+keep+':latest',{keep:true});
      await window.DataExFuzzyCache.whenIdle();
    });

    await page.getByText('作業の詳細', { exact:true }).click();
    await page.getByRole('button', { name:'現在の作業の保存内容をクリア' }).click();
    const dialog = page.getByRole('dialog', { name:'現在の作業をクリア' });
    await dialog.waitFor();
    const clearButton = dialog.getByRole('button', { name:'この作業をクリアして空の作業を開く' });
    assert.equal(await clearButton.isDisabled(), true, 'destructive action starts disabled');
    assert.match(await dialog.textContent(), /別の保存済み作業.*元PDF・JSON・CSVファイルは削除しません/);
    assert.match(await dialog.textContent(), /研究 4件、Raw 8件/);
    await dialog.getByRole('button', { name:'キャンセル' }).click();
    assert.equal(await page.evaluate(() => window.DataExReview.selectedProject().id), 'review:clear-target', 'cancel preserves target');

    await page.getByRole('button', { name:'現在の作業の保存内容をクリア' }).click();
    let confirm = page.getByRole('dialog', { name:'現在の作業をクリア' });
    await page.evaluate(async()=>{const c=window.DataExReview.workflowCatalog();await window.DataExReview.workflow({type:'REVIEWER',reviewId:c.reviewId,expectedCatalogRevision:c.revision,reviewer:{id:'concurrent-test'},operationId:crypto.randomUUID()});});
    await confirm.getByLabel('確認のため「クリア」と入力').fill('クリア');
    await confirm.getByRole('button', { name:'この作業をクリアして空の作業を開く' }).click();
    await confirm.getByText(/確認後に作業内容が更新されました/).waitFor();
    assert.equal(await page.evaluate(() => window.DataExReview.selectedProject().id), 'review:clear-target', 'stale confirmation preserves target');
    await confirm.getByRole('button', { name:'キャンセル' }).click();

    await page.getByRole('button', { name:'現在の作業の保存内容をクリア' }).click();
    confirm = page.getByRole('dialog', { name:'現在の作業をクリア' });
    await confirm.getByLabel('確認のため「クリア」と入力').fill('クリア');
    await confirm.getByRole('button', { name:'この作業をクリアして空の作業を開く' }).click();
    await page.waitForFunction(() => window.DataExReview?.selectedProject?.()?.id !== 'review:clear-target');

    const state = await page.evaluate(async () => {
      const projects = await window.DataExReviewProjects.all();
      const records = await window.DataExReviewStore.all();
      const queue = JSON.parse(localStorage.getItem('dataex:fuzzy:v1:context:pdf-queue') || '[]');
      const targetMarker = ':review:' + encodeURIComponent('review:clear-target') + ':';
      const keepMarker = ':review:' + encodeURIComponent('review:keep') + ':';
      const localKeys = Array.from({length:localStorage.length},(_,i)=>localStorage.key(i));
      const dbKeys = await new Promise((resolve,reject)=>{const q=indexedDB.open('dataex-fuzzy-snapshot-cache',1);q.onerror=()=>reject(q.error);q.onsuccess=()=>{const db=q.result,tx=db.transaction('entries'),r=tx.objectStore('entries').getAllKeys();tx.oncomplete=()=>{db.close();resolve(r.result.map(String));};tx.onabort=()=>reject(tx.error);};});
      return {active:window.DataExReview.selectedProject(),projects,records:records.filter(r=>r.project?.id==='review:clear-target'),targetCatalog:records.catalogs.find(c=>c.reviewId==='review:clear-target'),keepCatalog:records.catalogs.find(c=>c.reviewId==='review:keep'),queue,hasTargetCache:[...localKeys,...dbKeys].some(k=>k.includes(targetMarker)),hasKeepCache:[...localKeys,...dbKeys].some(k=>k.includes(keepMarker))};
    });
    assert.equal(state.projects.some(p=>p.id==='review:clear-target'), false);
    assert.equal(state.projects.some(p=>p.id==='review:keep'), true);
    assert.equal(state.records.length, 0);
    assert.equal(state.targetCatalog, undefined);
    assert.equal(state.queue.some(item=>item.reviewId==='review:clear-target'), false);
    assert.equal(state.queue.some(item=>item.reviewId==='review:keep'), true);
    assert.equal(state.hasTargetCache, false);
    assert.equal(state.hasKeepCache, true);
    assert.match(state.active.label, /^作業 20/);
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({passed:11,checks:['confirmation required','cancel is mutation-free','stale confirmation is mutation-free','target project removed','other project preserved','target catalog removed','target queue removed','other queue preserved','target cache removed','other cache preserved','blank replacement opened']},null,2));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
