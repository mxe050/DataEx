/* Saved Foster 2007 Raw only. Isolated Chromium profile; no AI extraction or live Review mutations. */
'use strict';
const {chromium}=require(process.env.DATAEX_PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const url=process.env.DATAEX_URL||'http://127.0.0.1:8766/dataex-chatgpt.html';
const data=process.env.DATAEX_FOSTER_DATA,pdf=process.env.DATAEX_FOSTER_PDF,out=process.env.DATAEX_ARTIFACT_DIR;
assert.ok(data&&pdf&&out,'Set DATAEX_FOSTER_DATA, DATAEX_FOSTER_PDF and DATAEX_ARTIFACT_DIR');
assert.equal(new URL(url).origin,'http://127.0.0.1:8766');fs.mkdirSync(out,{recursive:true});
const read=name=>JSON.parse(fs.readFileSync(path.join(data,name),'utf8'));
const raw=read('payload.json'),brief=read('brief.json'),manifest=brief.pdfManifest[0];
const core=require('./dataex-fuzzy-core.js'),D=require('./dataex-decisions.js');
const texts=Object.fromEntries(read('pages.json').map(p=>[p.page,p.normalizedText]));
const study={...core.buildStudy(raw,manifest,core.auditSources(raw,texts)),extractionContext:core.context(brief.reviewContext)};
const record=D.make(study,{id:'foster-result-set-acceptance-isolated',label:'Foster 2007 validation'});
const hash=v=>crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');
const originalHash=hash(raw),savedFileHash=hash(fs.readFileSync(path.join(data,'payload.json'),'utf8'));
const altWarning='同じStudy・Outcome・Timepointの代替Result typeがすでに採用されています';
const sharedWarning=/共有対照があります。.*(?:Advice.*exercise|二重計上)/;
(async()=>{
 const browser=await chromium.launch({headless:true});
 const context=await browser.newContext({viewport:{width:1440,height:1100},acceptDownloads:true});
 const page=await context.newPage(),checks=[],errors=[],requests=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push({method:r.method(),url:r.url()}));
 // Staged product files can be tested at the mandated origin without adding another server.
 if(process.env.DATAEX_STAGE_DIR)await context.route('http://127.0.0.1:8766/**',async route=>{
  const name=decodeURIComponent(new URL(route.request().url()).pathname).replace(/^\//,'');
  const target=path.resolve(process.env.DATAEX_STAGE_DIR,name),root=path.resolve(process.env.DATAEX_STAGE_DIR)+path.sep;
  if(target.startsWith(root)&&fs.existsSync(target)&&fs.statSync(target).isFile())return route.fulfill({path:target});
  return route.continue();
 });
 const pass=name=>{checks.push(name);console.log('PASS '+name);};
 const idle=async()=>{await page.evaluate(()=>DataExReview.whenIdle());await page.waitForFunction(()=>DataExReview.ready());};
 const snap=()=>page.evaluate(()=>DataExReview.snapshot());
 const basket=()=>page.evaluate(()=>DataExDecision.basket([DataExReview.snapshot()]));
 const exportBasket=format=>page.evaluate(format=>DataExDecision.exportBasket([DataExReview.snapshot()],{format}),format);
 const card=id=>page.locator('.outcome-card[data-outcome-id="'+id+'"]');
 const dialog=()=>page.locator('.decision-dialog[open]');
 const ep=()=>card('O1').locator('.paper-current-result .result-set-decisions').first();
 const ch=()=>card('O1').locator('.paper-change-results .paper-result-set[data-timepoint="6 months"] .result-set-decisions');
 async function openOutcome(id){const c=card(id);await c.waitFor();const toggle=c.locator('.outcome-toggle');if(await toggle.getAttribute('aria-expanded')==='false')await toggle.click();return c;}
 async function comparison(which,id='O1'){
  const c=await openOutcome(id),select=c.locator('.paper-comparison-choice select');
  const options=await select.locator('option').evaluateAll(ns=>ns.map(n=>({value:n.value,text:n.textContent})));
  const option=options.find(o=>which==='T'?/true acupuncture/i.test(o.text):/non.penetrating/i.test(o.text));
  assert.ok(option,JSON.stringify(options));await select.selectOption(option.value);
  await c.locator('.paper-time-button[data-timepoint="6 months"]').click();await idle();return c;
 }
 async function changeFold(id='O1'){
  const c=await openOutcome(id),summary=c.getByText('Change / 改善量を表示',{exact:true}),fold=summary.locator('..');
  if(await fold.getAttribute('open')===null)await summary.click();
  await c.locator('.paper-change-results .result-set-decisions').first().waitFor({state:'visible'});
 }
 async function action(set,kind){await idle();await set.locator('[data-result-set-action="'+kind+'"]').click();}
 async function close(){await dialog().getByRole('button',{name:'閉じる',exact:true}).click();}
 async function resolve(mode){
  const d=dialog();
  const stable=d.locator('[data-conflict-resolution="'+({'keep-both':'KEEP_BOTH',replace:'REPLACE',cancel:'CANCEL'}[mode])+'"]');
  if(await stable.count())await stable.click();
  else if(mode==='cancel')await d.getByRole('button',{name:'キャンセル',exact:true}).click();
  else if(mode==='keep-both')await d.getByRole('button',{name:/両方.*(?:保持|候補)/}).click();
  else await d.getByRole('button',{name:/置き換える|既存比較を外してこちらを採用/}).click();
  await d.waitFor({state:'hidden'});await idle();
 }
 async function assertImmutable(){const r=await snap();assert.equal(hash(r.snapshot.raw),originalHash);assert.equal(r.extractionId,record.extractionId);assert.equal(Object.keys(r.points).length,454);assert.deepEqual(r.snapshot.raw.sources,raw.sources);for(const [id,p]of Object.entries(record.points))assert.deepEqual(r.points[id].raw,p.raw);return r;}
 try{
  await page.goto(url);await page.waitForFunction(()=>window.DataExReview&&window.DataExReviewStore);await page.evaluate(()=>DataExReview.whenIdle());
  await page.evaluate(r=>DataExReviewStore.put(r,-1),record);await page.evaluate(r=>DataExReview.openRecord(r),record);await idle();
  await page.locator('#pdf-file').setInputFiles(pdf);await page.waitForFunction(()=>DataExFuzzy.brief().pdfLoaded);await idle();
  assert.equal((await basket()).length,0);await assertImmutable();pass('Saved Foster 2007 Raw454 / outcomes74 / sources553 restore without extraction or adoption');
  await comparison('T');await changeFold();
  assert.equal(await ch().count(),1);for(const [kind,label]of [['accept','このデータを採用'],['edit','修正'],['hold','保留'],['exclude','使わない']]){const b=ch().locator('[data-result-set-action="'+kind+'"]');assert.ok(await b.isVisible());assert.ok((await b.innerText()).includes(label));}
  const endpointId=await ep().getAttribute('data-result-set-id'),changeId=await ch().getAttribute('data-result-set-id');assert.notEqual(endpointId,changeId);
  assert.match(await ch().innerText(),/未採用/);pass('WOMAC pain Change6months has the same four Result-set actions and a separate stable identity');
  await comparison('T','O2');await changeFold('O2');assert.equal(await card('O2').locator('.paper-change-results .result-set-decisions').count(),3);pass('WOMAC function exposes decision controls for all three saved Change timepoints');
  await comparison('T');await changeFold();
  await action(ep(),'accept');await idle();assert.equal((await snap()).resultSets[endpointId].status,'ACCEPTED');assert.equal((await basket()).length,1);pass('Test A: True vs Advice WOMAC pain6months Endpoint adopts one Result set');
  await action(ch(),'accept');await dialog().waitFor();assert.ok((await dialog().innerText()).includes(altWarning));await page.screenshot({path:path.join(out,'A-endpoint-change-warning.png')});
  const beforeCancel=await snap();await resolve('cancel');assert.deepEqual(await snap(),beforeCancel);assert.equal((await basket()).length,1);pass('Test A: adopting Change warns about the accepted alternative; Cancel changes no record');
  await action(ch(),'hold');await idle();assert.equal((await snap()).resultSets[changeId].status,'HOLD');assert.equal((await snap()).resultSets[endpointId].status,'ACCEPTED');
  await action(ch(),'exclude');await idle();assert.equal((await snap()).resultSets[changeId].status,'EXCLUDED');pass('Change Hold / Do not use affect only Change while Endpoint remains adopted');
  const rawId='t4-O1-1-T-change',originalMean=raw.rawValues.find(v=>v.id===rawId).statistics.mean;
  await action(ch(),'edit');await dialog().locator('[data-point-field="'+rawId+':mean"]').fill(String(originalMean+0.1));await dialog().getByRole('button',{name:'修正を保存',exact:true}).click();await idle();
  assert.equal((await snap()).points[rawId].decision.finalValue.mean,originalMean+0.1);await assertImmutable();
  const cell=card('O1').locator('.paper-change-results [data-raw-id="'+rawId+'"]').first().locator('..');assert.match(await cell.innerText(),/修正済/);assert.doesNotMatch(await cell.innerText(),/\b採用\b/);pass('Change edit saves isolated Final only; cell status is 修正済 while Result-set adoption is separate');
  await action(ch(),'accept');assert.ok((await dialog().innerText()).includes(altWarning));await resolve('keep-both');
  let r=await snap();assert.equal(r.resultSets[endpointId].status,'ACCEPTED');assert.equal(r.resultSets[changeId].status,'ACCEPTED');assert.equal((await basket()).length,2);
  let pairwise=await exportBasket('continuous');assert.equal(pairwise.blocked,true);assert.ok(pairwise.warnings.some(w=>w.blocking));pass('Both Endpoint and Change remain candidates but unresolved alternatives block pairwise CSV');
  await action(ch(),'hold');await idle();await action(ch(),'accept');await resolve('replace');r=await snap();assert.equal(r.resultSets[changeId].status,'ACCEPTED');assert.notEqual(r.resultSets[endpointId].status,'ACCEPTED');assert.equal((await basket()).length,1);pass('Explicit Endpoint→Change replacement preserves both stored candidates and their decision history');
  await action(ep(),'accept');assert.ok((await dialog().innerText()).includes(altWarning));await resolve('replace');r=await snap();assert.equal(r.resultSets[endpointId].status,'ACCEPTED');assert.notEqual(r.resultSets[changeId].status,'ACCEPTED');pass('Explicit Change→Endpoint replacement also works without deleting the alternative');
  await comparison('S');const secondId=await ep().getAttribute('data-result-set-id');assert.notEqual(secondId,endpointId);
  await action(ep(),'accept');await dialog().waitFor();assert.match(await dialog().innerText(),sharedWarning);await page.screenshot({path:path.join(out,'B-shared-control-warning.png')});await resolve('cancel');assert.equal((await basket()).length,1);pass('Test B: second comparison warns about Advice+exercise shared control; Cancel preserves the first');
  await action(ep(),'accept');await resolve('keep-both');r=await snap();assert.equal(r.resultSets[endpointId].status,'ACCEPTED');assert.equal(r.resultSets[secondId].status,'ACCEPTED');
  await page.locator('.accepted-data-open').click();assert.match(await dialog().innerText(),sharedWarning);assert.equal(await dialog().locator('[data-accepted-set]').count(),2);await page.screenshot({path:path.join(out,'B-basket-shared-control.png')});await close();pass('Test B: both comparisons remain in basket with an explicit unresolved shared-control warning');
  await page.locator('.accepted-data-csv').click();await dialog().getByLabel('形式',{exact:true}).selectOption('continuous');
  await dialog().locator('.decision-csv-warnings').getByText(sharedWarning).first().waitFor();assert.ok(await dialog().getByRole('button',{name:'CSVをコピー',exact:true}).isDisabled());assert.ok(await dialog().getByRole('button',{name:'CSVを保存',exact:true}).isDisabled());
  pairwise=await exportBasket('continuous');assert.equal(pairwise.blocked,true);assert.ok(pairwise.warnings.some(w=>w.code==='SHARED_CONTROL'&&w.blocking));await page.screenshot({path:path.join(out,'C-pairwise-preview-blocked.png')});pass('Test C: pairwise preview warns and disables copying/saving unresolved shared-control comparisons');
  await dialog().getByLabel('形式',{exact:true}).selectOption('master');await page.waitForFunction(()=>!Array.from(document.querySelectorAll('.decision-dialog[open] button')).find(b=>b.textContent==='CSVをコピー')?.disabled);const master=await exportBasket('master');assert.equal(master.blocked,false);assert.equal(new Set(master.rows.map(x=>x.result_set_id)).size,2);await close();
  r=await assertImmutable();const audit=await page.evaluate(()=>DataExDecision.exportData([DataExReview.snapshot()],{format:'audit'}));assert.equal(audit.rows.length,454);assert.ok(audit.rows.every(row=>row.raw_value));assert.ok(r.history.some(h=>h.changes?.length));assert.ok(r.resultSets[changeId]);assert.ok(r.resultSets[endpointId]);assert.ok(r.resultSets[secondId]);
  fs.writeFileSync(path.join(out,'master.csv'),master.csv);fs.writeFileSync(path.join(out,'audit.csv'),audit.csv);fs.writeFileSync(path.join(out,'decision-history.json'),JSON.stringify(r.history,null,2));pass('Test D: Master keeps both comparisons; audit keeps all454 Raw values,553 sources and all decision history');
  await action(ep(),'hold');await idle();await action(ep(),'accept');assert.match(await dialog().innerText(),sharedWarning);await resolve('replace');r=await snap();assert.equal(r.resultSets[secondId].status,'ACCEPTED');assert.notEqual(r.resultSets[endpointId].status,'ACCEPTED');assert.equal((await basket()).length,1);assert.equal((await exportBasket('continuous')).blocked,false);pass('Shared-control replacement requires explicit choice and resolves the pairwise block while retaining the former comparison');
  const beforeReload=await snap();await page.reload();await page.waitForFunction(()=>window.DataExReview);await page.evaluate(()=>DataExReview.whenIdle());await page.locator('#review-workspace').getByRole('button',{name:/Foster 2007/}).click();await idle();r=await assertImmutable();assert.deepEqual(r.resultSets,beforeReload.resultSets);assert.deepEqual(r.history,beforeReload.history);pass('Reload restores exact decisions, alternative candidates and audit without resurrecting removed basket entries');
  await page.setViewportSize({width:375,height:1000});await comparison('T');await changeFold();await ch().scrollIntoViewIfNeeded();assert.ok((await ch().boundingBox()).width<=375);assert.ok(await ch().locator('[data-result-set-action=accept]').isVisible());assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.screenshot({path:path.join(out,'D-change-controls-375.png')});pass('375px retains accessible Change Result-set actions without document overflow');
  await assertImmutable();assert.deepEqual(errors,[]);assert.equal(hash(fs.readFileSync(path.join(data,'payload.json'),'utf8')),savedFileHash);assert.equal(requests.filter(r=>r.method!=='GET').length,0);pass('No JavaScript errors, external writes, original-file changes, Raw/source mutation or re-extraction occurred');
  fs.writeFileSync(path.join(out,'acceptance-A-D.json'),JSON.stringify({url,pdf,checks,errors,rawHash:originalHash,rawCount:454,sourceCount:553,note:'Saved extraction restored into isolated Chromium. Final edits/adoptions exist only in test storage; live Review untouched.'},null,2));
 }catch(e){await page.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});fs.writeFileSync(path.join(out,'failure.json'),JSON.stringify({error:e.stack,checks,errors},null,2));throw e;}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
