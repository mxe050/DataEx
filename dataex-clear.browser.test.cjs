/* Clear regression: real Cherkin PDF + frozen 163-row Raw, isolated dummy decisions only. */
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
const reviewName = 'Clear regression — isolated dummy review';
const oldPico = {
  population:'Adults with chronic low back pain',
  intervention:'Acupuncture',
  comparator:'Usual care',
  outcomes:'Disability'
};

(async () => {
  // Never connect to, clear, or reuse the desktop user's browser profile.
  const browser = await chromium.launch({headless:true});
  const context = await browser.newContext({viewport:{width:1440,height:1100}, serviceWorkers:'block'});
  const page = await context.newPage();
  const checks = [], errors = [], requests = [], blockedRequests = [];
  const pass = (name, detail) => {checks.push({name,detail}); console.log('PASS ' + name);};
  const call = (name, args={}) => page.evaluate(({name,args}) => registeredTools[name].execute(args), {name,args});
  const brief = () => call('dataex_get_extraction_brief');
  const idle = () => page.waitForFunction(() => window.DataExReview?.ready());
  const record = () => page.evaluate(() => DataExReview.snapshot());
  const card = () => page.locator('.outcome-card[data-outcome-id="O1"]');
  const currentSet = () => card().locator('.paper-current-result .result-set-decisions').first();
  const openContext = async () => {
    if (!await page.locator('#sr-context').evaluate(node => node.open)) await page.locator('#sr-context > summary').click();
  };
  const fillPico = async () => {
    await openContext();
    for (const [id,value] of Object.entries(oldPico)) await page.locator('#' + id).fill(value);
  };
  const values = () => page.evaluate(() => Object.fromEntries(
    ['review-name','population','intervention','comparator','outcomes'].map(id => [id,document.getElementById(id).value])
  ));
  const savedStudyStorage = () => page.evaluate(() => Object.fromEntries(Object.keys(localStorage)
    .filter(key => key.startsWith('dataex:fuzzy:v1:study:')).sort().map(key => [key,localStorage.getItem(key)])));
  const retainedState = () => page.evaluate(async () => ({
    records:await DataExReview.all(),
    active:DataExReview.snapshot(),
    fuzzy:DataExFuzzy.snapshot(),
    studyStorage:Object.fromEntries(Object.keys(localStorage).filter(key => key.startsWith('dataex:fuzzy:v1:study:'))
      .sort().map(key => [key,localStorage.getItem(key)])),
    basket:DataExDecision.basket(await DataExReview.all()),
    audit:DataExDecision.exportData(await DataExReview.all(), {format:'audit'}),
    pdf:{
      loaded:DataExFuzzy.brief().pdfLoaded,
      manifest:DataExFuzzy.brief().pdfManifest,
      page:document.querySelector('#page-number').value,
      highlights:[...document.querySelectorAll('.bbox-highlight')].map(node => ({
        html:node.outerHTML,
        background:getComputedStyle(node).backgroundColor,
        border:getComputedStyle(node).borderColor
      })),
      pages:[...document.querySelectorAll('#pdf-viewer .pdf-page')].map(node => ({
        page:node.dataset.pageNumber || node.dataset.page || node.id,
        canvases:[...node.querySelectorAll('canvas')].map(canvas => ({width:canvas.width,height:canvas.height}))
      }))
    }
  }));
  async function assertDiscovery() {
    assert.deepEqual(await values(), {'review-name':reviewName,population:'',intervention:'',comparator:'',outcomes:''});
    const b = await brief(); // Exercise the actual registered site-tool boundary, not only DataExFuzzy.brief().
    assert.equal(b.mode, 'DISCOVERY');
    assert.equal(b.intervention, '');
    assert.equal(b.comparator, '');
    assert.deepEqual(b.outcomes, []);
    assert.deepEqual(b.reviewContext, {reviewName,population:'',intervention:'',comparator:'',outcomes:[]});
    assert.deepEqual(b.mappingDecisions, [], 'Confirmed historical mappings must not enter the active Paper-only request');
    assert.match(await page.locator('#fuzzy-mode').innerText(), /Paper-only\s*\/\s*Discovery/);
    assert.equal(await page.locator('.outcome-review-mapping:visible').count(), 0, 'Clear temporary Outcome mapping proposals');
    assert.equal(await page.locator('#fuzzy-study-summary summary').filter({hasText:'SRのICOとの対応候補'}).count(), 0);
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('dataex:fuzzy:v1:context')));
    assert.deepEqual(saved.reviewContext, b.reviewContext, 'Persist the empty active form separately from historical extraction context');
  }
  async function assertClearLayout(width) {
    await openContext();
    const clear = page.locator('#clear-sr');
    await clear.scrollIntoViewIfNeeded();
    assert.ok(await clear.isVisible());
    assert.ok(await clear.isEnabled());
    assert.equal(await page.locator('#sr-context').evaluate(fold => {
      const summary = fold.querySelector(':scope > summary'), clear = fold.querySelector('#clear-sr');
      const first = summary.nextElementSibling;
      return !!first && (first === clear || first.contains(clear)) &&
        fold.querySelector('button,input,textarea,select') === clear;
    }), true, 'All Clear must be first after the SR summary, before form inputs');
    const allBox = await clear.boundingBox();
    assert.ok(allBox && allBox.x >= 0 && allBox.x + allBox.width <= width + 1);
    for (const id of Object.keys(oldPico)) {
      const button = page.locator('[data-clear-sr="' + id + '"]');
      assert.equal(await button.count(), 1);
      await button.scrollIntoViewIfNeeded();
      assert.ok(await button.isVisible());
      assert.equal((await button.innerText()).trim(), '×');
      const inputBox = await page.locator('#' + id).boundingBox(), buttonBox = await button.boundingBox();
      assert.ok(inputBox && buttonBox);
      assert.ok(buttonBox.x >= inputBox.x + inputBox.width - 1, id + ' × must be at the right of its own field');
      assert.ok(buttonBox.x + buttonBox.width <= width + 1, id + ' × must remain reachable');
    }
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  }

  try {
    await context.route('**/*', route => {
      const request = route.request(), target = new URL(request.url());
      const local = target.origin === new URL(url).origin;
      const pdfjs = target.origin === 'https://cdnjs.cloudflare.com' && target.pathname.startsWith('/ajax/libs/pdf.js/3.11.174/');
      if (request.method() === 'GET' && (local || pdfjs || ['blob:','data:'].includes(target.protocol))) return route.continue();
      blockedRequests.push({method:request.method(),url:request.url()});
      return route.abort('blockedbyclient');
    });
    await page.addInitScript(() => {
      window.registeredTools = {};
      Object.defineProperty(document, 'modelContext', {value:{registerTool(tool){registeredTools[tool.name] = tool;}}});
    });
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => requests.push({method:request.method(),url:request.url()}));
    await page.goto(url);
    await page.waitForFunction(() => window.DataExReview && window.DataExFuzzy && registeredTools.dataex_get_extraction_brief);
    assert.deepEqual(await page.evaluate(() => DataExReview.all()), []);
    assert.equal(await page.locator('#sr-context').getAttribute('open'), null);
    await openContext();
    await page.locator('#review-name').fill(reviewName);
    await assertClearLayout(1440);
    await page.locator('#clear-sr').click();
    await assertDiscovery();
    pass('Expanded SR exposes All Clear first, with four right-side × controls even when empty');

    for (const id of Object.keys(oldPico)) {
      await fillPico();
      const before = await values();
      await page.locator('[data-clear-sr="' + id + '"]').click();
      assert.deepEqual(await values(), {...before,[id]:''}, id + ' × clears only its own value');
    }
    pass('Population, Intervention, Comparator and Outcome × each clear only the selected field');

    await fillPico();
    await page.locator('#pdf-file').setInputFiles(pdf);
    await page.waitForFunction(() => DataExFuzzy.brief().pdfLoaded);
    const b = await brief(), input = {...structuredClone(original),requestId:b.requestId};
    assert.equal(b.pdfId, original.pdfId);
    assert.ok((await call('dataex_set_results', input)).ok);
    await idle();
    assert.equal((await record()).snapshot.raw.rawValues.length, 163);
    assert.deepEqual((await record()).snapshot.raw, input);
    const options = await card().locator('.paper-comparison-choice option').evaluateAll(nodes => nodes.map(node => ({value:node.value,text:node.textContent})));
    const choice = options.find(option => /Standardized/i.test(option.text));
    assert.ok(choice, JSON.stringify(options));
    await card().locator('.paper-comparison-choice select').selectOption(choice.value);
    await card().locator('.paper-time-button[data-timepoint="8 weeks"]').click();

    // UI-only dummy decisions: accept a real Raw result set and finalize its Outcome/Study.
    await currentSet().locator('[data-result-set-action="accept"]').click();
    await idle();
    const fold = card().locator('details').filter({has:page.locator('summary').filter({hasText:'Outcome全体の判断・確定'})}).first();
    assert.equal(await fold.count(), 1);
    if (!await fold.evaluate(node => node.open)) await fold.locator(':scope > summary').click();
    await card().getByRole('button', {name:'このOutcomeを確定',exact:true}).click();
    const outcomeDialog = page.locator('.decision-dialog[open][data-confirm-outcome="O1"]');
    await outcomeDialog.getByRole('button', {name:'そのまま確定',exact:true}).click();
    await outcomeDialog.waitFor({state:'hidden'});
    await idle();
    await page.getByRole('button', {name:'この研究を確定してReview Workspaceへ追加',exact:true}).click();
    const studyDialog = page.locator('.decision-dialog[open]');
    await studyDialog.getByRole('button', {name:'確定して保存',exact:true}).click();
    await studyDialog.waitFor({state:'hidden'});
    await idle();
    const finalized = await record();
    assert.equal(finalized.status, 'CONFIRMED');
    assert.ok(finalized.confirmedAt);
    assert.equal(finalized.outcomes.O1.status, 'CONFIRMED');
    assert.equal(finalized.outcomes.O1.reviewMapping.reviewConcept, 'Disability');
    assert.ok(finalized.history.some(item => item.action === 'CONFIRM_STUDY'));
    assert.ok((await brief()).mappingDecisions.length > 0, 'Preservation fixture must contain a learned human mapping');
    assert.ok(await card().locator('.outcome-review-mapping').count(), 'ICO proposal must exist before Clear');

    await card().locator('.paper-current-result [data-raw-id="t2-O1-A2-1"]').click();
    await page.waitForFunction(() => document.querySelector('#page-number').value === '21' &&
      document.querySelector('#evidence-message').textContent.includes('値を特定') && document.querySelectorAll('.bbox-highlight').length > 0);
    // Source highlighting briefly pulses; compare its stable yellow appearance after that animation finishes.
    await page.locator('.bbox-highlight').evaluateAll(nodes => Promise.all(nodes.flatMap(node => node.getAnimations())
      .map(animation => animation.finished.catch(() => {}))));
    await idle();
    const beforeClear = await retainedState();
    assert.ok(beforeClear.records.length > 0);
    assert.ok(beforeClear.basket.length > 0, 'An empty basket cannot prove preservation');
    assert.equal(beforeClear.audit.rows.length, 163);
    assert.ok(Object.keys(beforeClear.studyStorage).length >= 2);
    assert.ok(beforeClear.pdf.loaded && beforeClear.pdf.highlights.length > 0);
    assert.equal(beforeClear.pdf.page, '21');
    await page.screenshot({path:path.join(out,'clear-01-finalized-source.png')});
    pass('Preservation fixture contains frozen Raw 163, real PDF highlight, accepted basket, finalized Study, audit and confirmed mapping');

    await openContext();
    await page.locator('[data-clear-sr="outcomes"]').click();
    assert.deepEqual(await values(), {'review-name':reviewName,...oldPico,outcomes:''});
    const noOutcomeBrief = await brief();
    assert.equal(noOutcomeBrief.mode, 'DISCOVERY');
    assert.deepEqual(noOutcomeBrief.mappingDecisions, [], 'Outcome × must suppress old mappings even while I/C/P remain');
    assert.deepEqual(await retainedState(), beforeClear);
    await page.locator('#outcomes').fill(oldPico.outcomes);
    assert.ok((await brief()).mappingDecisions.length > 0, 'Restoring the active Outcome may reuse the preserved confirmed terminology');
    pass('Outcome × suppresses active learned mappings with I/C/P still filled and retains the confirmed mapping history');

    await page.locator('#clear-sr').click();
    await assertDiscovery();
    assert.deepEqual(await retainedState(), beforeClear, 'Clear must preserve every saved and active study layer, basket, audit and PDF highlight');
    for (let repeat=0; repeat<3; repeat++) {
      await page.locator('#clear-sr').click();
      await assertDiscovery();
      assert.deepEqual(await retainedState(), beforeClear, 'Repeated Clear must be safe');
    }
    await page.locator('#clear-sr').scrollIntoViewIfNeeded();
    await page.screenshot({path:path.join(out,'clear-02-desktop-discovery.png')});
    pass('All Clear and three repeated clicks empty only active PICO; all persisted data and PDF page/highlight remain exact');

    const otherOutcomes = page.locator('#other-outcomes');
    assert.equal(await otherOutcomes.count(), 1, 'The real fixture must expose the lazy other-Outcomes section');
    assert.equal(await otherOutcomes.evaluate(node => node.open), false, 'The lazy section must remain unopened until after Clear');
    if (!await otherOutcomes.evaluate(node => node.open)) {
      await otherOutcomes.locator(':scope > summary').click();
    }
    await otherOutcomes.locator('.outcome-card').first().waitFor({state:'attached'});
    assert.ok(await otherOutcomes.locator('.outcome-card').count() > 0, 'Actually render the lazy section');
    await assertDiscovery();
    assert.deepEqual(await retainedState(), beforeClear);
    pass('Opening the lazily rendered other-Outcomes section after Clear does not restore temporary mapping proposals');

    await page.setViewportSize({width:375,height:1000});
    await assertClearLayout(375);
    for (const id of Object.keys(oldPico)) {
      await fillPico();
      const before = await values();
      await page.locator('[data-clear-sr="' + id + '"]').click();
      assert.deepEqual(await values(), {...before,[id]:''});
    }
    await fillPico();
    const beforeNarrowClear = await retainedState();
    await page.locator('#clear-sr').click();
    await assertDiscovery();
    assert.deepEqual(await retainedState(), beforeNarrowClear);
    assert.deepEqual(await page.evaluate(() => DataExReview.all()), beforeClear.records);
    assert.deepEqual(await savedStudyStorage(), beforeClear.studyStorage);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await page.locator('#clear-sr').scrollIntoViewIfNeeded();
    await page.screenshot({path:path.join(out,'clear-03-375-discovery.png')});
    pass('375px: All Clear and all four × remain reachable and functional without horizontal overflow');

    await page.setViewportSize({width:1440,height:1100});
    await page.reload();
    await page.waitForFunction(() => window.DataExFuzzy && registeredTools.dataex_get_extraction_brief);
    await page.locator('#review-workspace').getByRole('button', {name:/Cherkin 2009/}).waitFor();
    await assertDiscovery();
    await page.locator('#review-workspace').getByRole('button', {name:/Cherkin 2009/}).click();
    await idle();
    await assertDiscovery();
    assert.deepEqual(await page.evaluate(() => DataExReview.all()), beforeClear.records);
    assert.deepEqual((await record()).snapshot.raw, input);
    assert.deepEqual(await savedStudyStorage(), beforeClear.studyStorage);
    assert.equal((await record()).status, 'CONFIRMED');
    assert.equal((await record()).outcomes.O1.reviewMapping.reviewConcept, 'Disability');
    pass('Reload and opening the finalized saved study do not resurrect old PICO or active learned mappings');

    await page.locator('#pdf-file').setInputFiles(pdf);
    await page.waitForFunction(() => DataExFuzzy.brief().pdfLoaded);
    await idle();
    await assertDiscovery();
    assert.deepEqual(await page.evaluate(() => DataExReview.all()), beforeClear.records);
    assert.deepEqual((await record()).snapshot.raw, input);
    assert.deepEqual(await savedStudyStorage(), beforeClear.studyStorage);
    await openContext();
    await page.locator('#clear-sr').scrollIntoViewIfNeeded();
    await page.screenshot({path:path.join(out,'clear-04-reloaded-reconnected.png')});
    pass('Reconnecting the same PDF keeps the cleared active context and the original finalized study');

    assert.equal(hash(rawFile), rawHash);
    assert.equal(hash(pdf), pdfHash);
    assert.deepEqual(errors, []);
    assert.deepEqual(blockedRequests, []);
    assert.ok(requests.every(request => request.method === 'GET'));
    fs.writeFileSync(path.join(out,'clear-acceptance.json'), JSON.stringify({
      url,pdf,rawHash,pdfHash,checks,errors,requests,blockedRequests,
      fixture:{rawValues:163,studyStatus:beforeClear.active.status,basketCount:beforeClear.basket.length,
        auditRows:beforeClear.audit.rows.length,mapping:beforeClear.active.outcomes.O1.reviewMapping},
      testScope:'Isolated browser context; dummy human acceptance/finalization only. No source files or real user storage changed.'
    },null,2));
  } catch (error) {
    await page.screenshot({path:path.join(out,'clear-failure.png')}).catch(() => {});
    fs.writeFileSync(path.join(out,'clear-failure.json'), JSON.stringify({error:error.message,stack:error.stack,checks,errors,blockedRequests},null,2));
    throw error;
  } finally {
    await browser.close();
  }
})().catch(error => {console.error(error); process.exitCode = 1;});
