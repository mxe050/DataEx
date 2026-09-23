/* Review isolation acceptance: unchanged Cherkin source files, isolated synthetic Review names/decisions. */
'use strict';
const {chromium} = require(process.env.DATAEX_PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');

const url = process.env.DATAEX_URL || 'http://127.0.0.1:8766/dataex-chatgpt.html';
const pdf = process.env.DATAEX_CHERKIN_PDF;
const rawFile = process.env.DATAEX_CHERKIN_RAW;
const out = process.env.DATAEX_ARTIFACT_DIR;
assert.equal(url, 'http://127.0.0.1:8766/dataex-chatgpt.html');
assert.ok(pdf && rawFile && out, 'Set DATAEX_CHERKIN_PDF, DATAEX_CHERKIN_RAW and DATAEX_ARTIFACT_DIR');
fs.mkdirSync(out, {recursive:true});
const original = JSON.parse(fs.readFileSync(rawFile, 'utf8'));
assert.equal(original.rawValues.length, 163, 'Use the frozen Cherkin extraction, not a reduced fixture');
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const rawHash = hash(rawFile), pdfHash = hash(pdf);
const hashValue = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
// These are deliberately synthetic Review names. The actual Study/source data remain Cherkin.
const oldName = 'CRPS — isolated review-switch fixture';
const newName = 'Moffett 1999 — isolated review-switch fixture';
const oldPico = {population:'Adults with chronic low back pain',intervention:'Acupuncture',comparator:'Usual care',outcomes:'Disability'};
const newPico = {population:'Synthetic second Review population',intervention:'Second Review intervention',comparator:'Second Review comparator',outcomes:'Functional disability'};
const emptyPico = {population:'',intervention:'',comparator:'',outcomes:''};

(async () => {
  // A fresh isolated browser profile must never connect to or clear the desktop user's storage.
  const browser = await chromium.launch({headless:true});
  const context = await browser.newContext({viewport:{width:1440,height:1100},serviceWorkers:'block'});
  const page = await context.newPage();
  page.setDefaultTimeout(30000);
  const checks = [], errors = [], requests = [], blockedRequests = [];
  const pass = (name,detail) => {checks.push({name,detail});console.log('PASS ' + name);};
  const call = (name,args={}) => page.evaluate(({name,args}) => registeredTools[name].execute(args), {name,args});
  const brief = () => call('dataex_get_extraction_brief');
  const record = () => page.evaluate(() => DataExReview.snapshot());
  const all = () => page.evaluate(() => DataExReview.all());
  const projects = () => page.evaluate(() => DataExReviewProjects.all());
  const settle = () => page.evaluate(() => DataExReview.whenIdle());
  const ready = id => page.waitForFunction(id => DataExReview.ready() && (!id || DataExReview.snapshot()?.project.id === id),id);
  const values = () => page.evaluate(() => Object.fromEntries(['review-name','population','intervention','comparator','outcomes']
    .map(id => [id,document.getElementById(id).value])));
  const selector = () => page.locator('#review-workspace').getByRole('combobox',{name:'保存先レビュー',exact:true});
  const card = () => page.locator('.outcome-card[data-outcome-id="O1"]');
  const openContext = async () => {
    if (!await page.locator('#sr-context').evaluate(node => node.open)) await page.locator('#sr-context > summary').click();
  };
  const fillPico = async pico => {
    await openContext();
    for (const [id,value] of Object.entries(pico)) await page.locator('#' + id).fill(value);
    await settle();
  };
  const retained = id => page.evaluate(async id => {
    const records = (await DataExReview.all()).filter(record => record.project.id === id);
    const requestIds = records.map(record => record.extractionId);
    return {
      records,
      basket:DataExDecision.basket(records,id),
      audit:DataExDecision.exportData(records,{format:'audit',projectId:id}),
      // Only original extraction records; per-Review latest pointers can legitimately change.
      rawStorage:Object.fromEntries(Object.keys(localStorage).filter(key => key.startsWith('dataex:fuzzy:v1:study:') &&
        requestIds.some(requestId => key.includes(requestId))).sort().map(key => [key,localStorage.getItem(key)]))
    };
  },id);
  async function assertContext(id,name,pico) {
    await page.waitForFunction(id => window.DataExFuzzy?.brief().reviewId === id,id);
    await settle();
    assert.deepEqual(await values(),{'review-name':name,...pico});
    const current = await brief();
    assert.equal(current.reviewId,id,'The public brief identifies the stable active Review');
    assert.deepEqual(current.reviewContext,{reviewName:name,...pico,outcomes:pico.outcomes ? pico.outcomes.split('\n') : []});
    assert.equal((await page.evaluate(() => DataExReview.selectedProject())).id,id);
    assert.equal(await selector().inputValue(),id);
    return current;
  }
  async function nextPaper(mode,name) {
    await page.locator('#new-paper').click();
    await page.locator('[name="next-paper-ico"][value="' + mode + '"]').check();
    if (mode === 'new-review') await page.locator('#new-review-name').fill(name);
    // Completing this native picker with no files is the same as cancelling PDF selection.
    const chooser = page.waitForEvent('filechooser');
    await page.locator('#new-paper-confirm').click();
    await (await chooser).setFiles([]);
    await page.locator('#new-paper-dialog').waitFor({state:'hidden'});
    await settle();
  }
  async function upload() {
    await page.locator('#pdf-file').setInputFiles(pdf);
    await page.waitForFunction(() => DataExFuzzy.brief().pdfLoaded);
  }
  async function submitFixture() {
    const current = await brief();
    assert.equal(current.pdfId,original.pdfId);
    const input = {...structuredClone(original),requestId:current.requestId};
    assert.ok((await call('dataex_set_results',input)).ok);
    await ready(current.reviewId);
    assert.deepEqual((await record()).snapshot.raw,input);
    return input;
  }
  async function finalizeFixture() {
    const options = await card().locator('.paper-comparison-choice option').evaluateAll(nodes => nodes.map(node => ({value:node.value,text:node.textContent})));
    const choice = options.find(option => /Standardized/i.test(option.text));
    assert.ok(choice,JSON.stringify(options));
    await card().locator('.paper-comparison-choice select').selectOption(choice.value);
    await card().locator('.paper-time-button[data-timepoint="8 weeks"]').click();
    await card().locator('.paper-current-result .result-set-decisions').first().locator('[data-result-set-action="accept"]').click();
    await ready();
    const fold = card().locator('details').filter({has:page.locator('summary').filter({hasText:'Outcome全体の判断・確定'})}).first();
    if (!await fold.evaluate(node => node.open)) await fold.locator(':scope > summary').click();
    await card().getByRole('button',{name:'このOutcomeを確定',exact:true}).click();
    const outcomeDialog = page.locator('.decision-dialog[open][data-confirm-outcome="O1"]');
    await outcomeDialog.getByRole('button',{name:'そのまま確定',exact:true}).click();
    await outcomeDialog.waitFor({state:'hidden'});
    await ready();
    await page.getByRole('button',{name:'この研究を確定してReview Workspaceへ追加',exact:true}).click();
    const studyDialog = page.locator('.decision-dialog[open]');
    await studyDialog.getByRole('button',{name:'確定して保存',exact:true}).click();
    await studyDialog.waitFor({state:'hidden'});
    await ready();
    const saved = await record();
    assert.equal(saved.status,'CONFIRMED');
    assert.equal(saved.outcomes.O1.status,'CONFIRMED');
    assert.ok(saved.history.some(item => item.action === 'CONFIRM_STUDY'));
    return saved;
  }
  async function switchTo(id,name,pico) {
    await selector().selectOption(id);
    await page.waitForFunction(id => DataExFuzzy.brief().reviewId === id,id);
    await settle();
    await ready(id);
    return assertContext(id,name,pico);
  }
  async function assertBasketScope(id,expected) {
    assert.equal(await page.locator('#accepted-data-count').innerText(),'採用済みデータ ' + expected + '件');
    await page.locator('.accepted-data-open').click();
    const dialog = page.locator('.decision-dialog[open]');
    await dialog.waitFor({state:'visible'});
    const rows = await dialog.locator('[data-accepted-set]').count();
    assert.equal(rows,expected);
    assert.equal(await page.evaluate(() => DataExReview.selectedProject()?.id),id);
    await dialog.getByRole('button',{name:'閉じる',exact:true}).click();
  }

  try {
    await context.route('**/*',route => {
      const request = route.request(),target = new URL(request.url());
      const local = target.origin === new URL(url).origin;
      const pdfjs = target.origin === 'https://cdnjs.cloudflare.com' && target.pathname.startsWith('/ajax/libs/pdf.js/3.11.174/');
      if (request.method() === 'GET' && (local || pdfjs || ['blob:','data:'].includes(target.protocol))) return route.continue();
      blockedRequests.push({method:request.method(),url:request.url()});
      return route.abort('blockedbyclient');
    });
    await page.addInitScript(() => {
      window.registeredTools = {};
      Object.defineProperty(document,'modelContext',{value:{registerTool(tool){registeredTools[tool.name] = tool;}}});
    });
    page.on('pageerror',error => errors.push(error.message));
    page.on('request',request => requests.push({method:request.method(),url:request.url()}));
    await page.goto(url);
    await page.waitForFunction(() => window.DataExReview && window.DataExReviewProjects && window.DataExFuzzy && registeredTools.dataex_get_extraction_brief);
    await selector().waitFor({state:'visible'});
    await settle();
    assert.deepEqual(await all(),[]);
    await openContext();
    await page.locator('#review-name').fill(oldName);
    await fillPico(oldPico);
    await upload();
    const oldInput = await submitFixture();
    const oldRecord = await finalizeFixture(),oldId = oldRecord.project.id;
    await assertContext(oldId,oldName,oldPico);
    const oldMappings = (await brief()).mappingDecisions;
    assert.ok(oldMappings.length > 0);
    assert.ok(oldMappings.every(mapping => mapping.recordId === oldRecord.id));
    const oldState = await retained(oldId);
    assert.equal(oldState.records.length,1);
    assert.ok(oldState.basket.length > 0);
    assert.equal(oldState.audit.rows.length,163);
    assert.ok(Object.keys(oldState.rawStorage).length > 0);
    pass('CRPS fixture has saved Raw 163, confirmed mapping, accepted basket, finalized Study and audit',{id:oldId});

    const beforeCancel = {brief:await brief(),values:await values(),projects:await projects(),records:await all()};
    await page.locator('#new-paper').click();
    await page.locator('[name="next-paper-ico"][value="new-review"]').check();
    await page.locator('#new-review-name').fill('   ');
    if (await page.locator('#new-paper-confirm').isEnabled()) await page.locator('#new-paper-confirm').click();
    await settle();
    assert.ok(await page.locator('#new-paper-dialog').isVisible(),'Blank Review name must not advance');
    assert.deepEqual(await projects(),beforeCancel.projects);
    assert.deepEqual(await all(),beforeCancel.records);
    assert.equal((await brief()).requestId,beforeCancel.brief.requestId);
    await page.locator('#new-review-name').fill('Cancelled Review');
    await page.locator('#new-paper-cancel').click();
    assert.deepEqual(await values(),beforeCancel.values);
    assert.deepEqual(await projects(),beforeCancel.projects);
    assert.deepEqual(await all(),beforeCancel.records);
    assert.equal((await brief()).pdfLoaded,true);
    assert.equal((await brief()).requestId,beforeCancel.brief.requestId);
    pass('Blank name cannot create a Review; Cancel leaves Review, PICO, loaded PDF and request unchanged');

    await page.getByRole('button',{name:'前回の結果を見る',exact:true}).click();
    await page.waitForFunction(() => document.getElementById('decision-message').textContent.includes('保存した確定内容'));
    await settle();
    assert.match(await page.locator('#decision-message').innerText(),/保存した確定内容/);
    await nextPaper('new-review',newName);
    const newId = (await brief()).reviewId;
    assert.ok(newId && newId !== oldId && newId !== newName,'New Review has a unique ID independent of display name');
    let b = await assertContext(newId,newName,emptyPico);
    assert.equal(b.pdfLoaded,false);
    assert.equal(b.mode,'DISCOVERY');
    assert.deepEqual(b.mappingDecisions,[]);
    assert.equal(await record(),null);
    assert.equal(await page.evaluate(() => DataExFuzzy.snapshot()),null);
    assert.equal(await page.locator('#decision-message').textContent(),'','Old Review guidance must not remain in the new Review');
    assert.deepEqual(await retained(oldId),oldState);
    const optionPairs = await selector().locator('option').evaluateAll(nodes => nodes.map(node => ({id:node.value,label:node.textContent})));
    assert.ok(optionPairs.some(option => option.id === oldId && option.label === oldName));
    assert.ok(optionPairs.some(option => option.id === newId && option.label === newName));
    await assertBasketScope(newId,0);
    await page.screenshot({path:path.join(out,'review-switch-01-new-empty.png')});
    pass('Creating Moffett Review starts with empty PICO/mappings and zero basket; both Reviews remain selectable',{id:newId});

    await page.reload();
    await page.waitForFunction(() => window.DataExReviewProjects && window.DataExFuzzy && registeredTools.dataex_get_extraction_brief);
    await settle();
    await assertContext(newId,newName,emptyPico);
    assert.ok((await projects()).some(project => project.id === newId));
    assert.equal(await record(),null);
    assert.deepEqual(await retained(oldId),oldState);
    await assertBasketScope(newId,0);
    pass('Empty new Review and active selection persist through reload before any extraction');

    await switchTo(oldId,oldName,oldPico);
    assert.match(await page.locator('#decision-message').innerText(),/原著PDFを再選択/);
    await selector().selectOption(newId);
    await settle();
    await assertContext(newId,newName,emptyPico);
    assert.equal(await page.locator('#decision-message').textContent(),'','Switching back to an empty Review clears old reconnection guidance');
    assert.equal(await record(),null);
    await upload();
    await settle();
    b = await assertContext(newId,newName,emptyPico);
    assert.equal(b.pdfLoaded,true);
    assert.equal(await record(),null,'Same PDF in another Review must not bind the old saved Study');
    assert.equal(await page.evaluate(() => DataExFuzzy.snapshot()),null,'Global per-PDF latest cache must not import old Raw into new Review');
    assert.deepEqual(await retained(oldId),oldState);
    const stale = await page.evaluate(async input => {
      try {const result=await registeredTools.dataex_set_results.execute(input);return {rejected:result.isError===true,message:result.error};}
      catch (error) {return {rejected:true,message:error.message};}
    },oldInput);
    assert.equal(stale.rejected,true,'Pre-switch extraction request must be rejected even with the same PDF');
    assert.match(stale.message,/PDF|依頼条件|現在のbrief/);
    assert.equal(await record(),null);
    pass('Loading identical PDF in new Review restores neither old study nor mappings and rejects the old request ID');

    await fillPico(newPico);
    const newInput = await submitFixture();
    assert.notEqual(newInput.requestId,oldInput.requestId);
    const newRecord = await finalizeFixture();
    assert.equal(newRecord.project.id,newId);
    assert.notEqual(newRecord.id,oldRecord.id);
    assert.deepEqual(newRecord.snapshot.raw,newInput);
    assert.equal(newRecord.outcomes.O1.reviewMapping.reviewConcept,newPico.outcomes);
    assert.equal(oldRecord.outcomes.O1.reviewMapping.reviewConcept,oldPico.outcomes);
    const newMappings = (await brief()).mappingDecisions;
    assert.ok(newMappings.length > 0);
    assert.ok(newMappings.every(mapping => mapping.recordId === newRecord.id));
    const newState = await retained(newId);
    assert.equal(newState.records.length,1);
    assert.ok(newState.basket.length > 0);
    assert.equal(newState.audit.rows.length,163);
    assert.deepEqual(await retained(oldId),oldState);
    await assertBasketScope(newId,newState.basket.length);
    pass('Second extraction/adoption/finalization is stored only in Moffett Review; CRPS remains byte-equivalent');

    b = await switchTo(oldId,oldName,oldPico);
    assert.deepEqual(b.mappingDecisions,oldMappings);
    assert.deepEqual(await record(),oldRecord);
    assert.deepEqual(await retained(oldId),oldState);
    assert.deepEqual(await retained(newId),newState);
    await assertBasketScope(oldId,oldState.basket.length);
    await page.screenshot({path:path.join(out,'review-switch-02-back-to-crps.png')});
    b = await switchTo(newId,newName,newPico);
    assert.deepEqual(b.mappingDecisions,newMappings);
    assert.deepEqual(await record(),newRecord);
    await assertBasketScope(newId,newState.basket.length);
    pass('Switching populated Reviews restores their own PICO, latest Study, learned mappings and accepted basket');

    await page.reload();
    await page.waitForFunction(() => window.DataExReviewProjects && window.DataExFuzzy && registeredTools.dataex_get_extraction_brief);
    await settle();
    await assertContext(newId,newName,newPico);
    assert.deepEqual(await retained(oldId),oldState);
    assert.deepEqual(await retained(newId),newState);
    b = await switchTo(oldId,oldName,oldPico);
    assert.deepEqual(b.mappingDecisions,oldMappings);
    assert.deepEqual(await record(),oldRecord);
    b = await switchTo(newId,newName,newPico);
    assert.deepEqual(b.mappingDecisions,newMappings);
    assert.deepEqual(await record(),newRecord);
    await page.screenshot({path:path.join(out,'review-switch-03-reloaded-moffett.png')});
    pass('Reload followed by both switch directions keeps all Study layers and Review-specific context isolated');

    const beforeDuplicate = {projects:await projects(),record:await record(),values:await values()};
    await page.locator('#new-paper').click();
    await page.locator('[name="next-paper-ico"][value="new-review"]').check();
    await page.locator('#new-review-name').fill('  ' + newName + '  ');
    await page.locator('#new-paper-confirm').click();
    await page.locator('#new-paper-error').filter({hasText:/同じ名前|既存/}).waitFor();
    assert.ok(await page.locator('#new-paper-dialog').isVisible());
    assert.deepEqual(await projects(),beforeDuplicate.projects);
    assert.deepEqual(await record(),beforeDuplicate.record);
    assert.deepEqual(await values(),beforeDuplicate.values);
    assert.equal((await brief()).reviewId,newId);
    await page.locator('#new-paper-cancel').click();
    assert.deepEqual(await retained(oldId),oldState);
    assert.deepEqual(await retained(newId),newState);
    pass('Duplicate trimmed Review name is rejected with guidance; active Review, catalog and both saved Studies remain unchanged');

    await switchTo(oldId,oldName,oldPico);
    await nextPaper('keep');
    b = await assertContext(oldId,oldName,oldPico);
    assert.deepEqual(b.mappingDecisions,oldMappings);
    assert.equal(b.pdfLoaded,false);
    assert.deepEqual(await retained(oldId),oldState);
    assert.deepEqual(await retained(newId),newState);
    await assertBasketScope(oldId,oldState.basket.length);
    await upload();
    await ready(oldId);
    assert.deepEqual(await record(),oldRecord);
    await nextPaper('clear');
    b = await assertContext(oldId,oldName,emptyPico);
    assert.equal(b.mode,'DISCOVERY');
    assert.deepEqual(b.mappingDecisions,[]);
    assert.equal(b.pdfLoaded,false);
    assert.deepEqual(await retained(oldId),oldState);
    assert.deepEqual(await retained(newId),newState);
    await assertBasketScope(oldId,oldState.basket.length);
    pass('Existing next-paper Keep/Clear options retain Review identity and saved data; Clear still clears only active PICO');

    assert.equal(hash(rawFile),rawHash);
    assert.equal(hash(pdf),pdfHash);
    assert.deepEqual(errors,[]);
    assert.deepEqual(blockedRequests,[]);
    assert.ok(requests.every(request => request.method === 'GET'));
    fs.writeFileSync(path.join(out,'review-switch-acceptance.json'),JSON.stringify({
      url,pdf,rawFile,rawHash,pdfHash,checks,errors,requests,blockedRequests,
      reviews:{old:{id:oldId,label:oldName,recordId:oldRecord.id,rawHash:hashValue(oldInput),stateHash:hashValue(oldState),basket:oldState.basket.length,auditRows:oldState.audit.rows.length},
        current:{id:newId,label:newName,recordId:newRecord.id,rawHash:hashValue(newInput),stateHash:hashValue(newState),basket:newState.basket.length,auditRows:newState.audit.rows.length}},
      testScope:'Fresh isolated browser context; unchanged real Cherkin PDF/Raw fixture used for synthetic CRPS and Moffett Review scenarios. Dummy human decisions only. No actual Moffett evidence or clinical extraction is asserted; no user browser storage or source files are changed.'
    },null,2));
  } catch (error) {
    await page.screenshot({path:path.join(out,'review-switch-failure.png')}).catch(() => {});
    const state = await page.evaluate(async () => ({brief:window.DataExFuzzy?.brief(),current:window.DataExReview?.snapshot(),
      projects:await window.DataExReviewProjects?.all(),selected:window.DataExReview?.selectedProject(),
      decisionMessage:document.getElementById('decision-message')?.textContent,extractMessage:document.getElementById('extract-message')?.textContent})).catch(() => null);
    fs.writeFileSync(path.join(out,'review-switch-failure.json'),JSON.stringify({error:error.message,stack:error.stack,checks,errors,blockedRequests,state},null,2));
    throw error;
  } finally {await browser.close();}
})().catch(error => {console.error(error);process.exitCode = 1;});
