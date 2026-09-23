/* Saved Moffett data, isolated headless profile. No new extraction or live Review changes. */
'use strict';
const {chromium}=require(process.env.DATAEX_PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const url=process.env.DATAEX_URL||'http://127.0.0.1:8766/dataex-chatgpt.html';
const out=process.env.DATAEX_ARTIFACT_DIR,recordFile=process.env.DATAEX_MOFFETT_RECORD,pdf=process.env.DATAEX_MOFFETT_PDF;
assert.ok(out&&recordFile&&pdf,'Set artifact directory, saved Moffett record, and original PDF paths');
assert.equal(new URL(url).origin,'http://127.0.0.1:8766');fs.mkdirSync(out,{recursive:true});
const record=JSON.parse(fs.readFileSync(recordFile,'utf8'))[0],raw=record.snapshot.raw;
const hash=v=>crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex'),rawHash=hash(raw),fileHash=hash(fs.readFileSync(recordFile,'utf8'));
const ids=['m99-r15','m99-r36','m99-r45','m99-r18','m99-r39','m99-r48'];
const normalize=text=>text.replace(/[−–—]/g,'-').replace(/\s+/g,' ').trim();
const escaped=text=>String(text).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const statisticPattern=(label,n)=>new RegExp(escaped(label)+'\\s*(?:=|:)?\\s*'+escaped(n));
(async()=>{
 const browser=await chromium.launch({headless:true}),context=await browser.newContext({viewport:{width:1440,height:1100},acceptDownloads:true});
 const page=await context.newPage(),checks=[],errors=[];page.on('pageerror',e=>errors.push(e.message));
 const pass=name=>{checks.push(name);console.log('PASS '+name);};
 const idle=()=>page.evaluate(()=>DataExReview.whenIdle());
 const snapshot=()=>page.evaluate(()=>DataExReview.snapshot());
 const dialog=()=>page.locator('.decision-dialog[open]');
 const card=id=>page.locator('.outcome-card[data-outcome-id="'+id+'"]');
 const effect=id=>card(raw.rawValues.find(v=>v.id===id).outcomeId).locator('.paper-current-result .paper-giv-result[data-effect-raw-id="'+id+'"]');
 const summary=id=>effect(id).locator('.paper-giv-summary[data-derived-raw-id="'+id+'"]');
 const basket=()=>page.evaluate(()=>DataExDecision.basket([DataExReview.snapshot()]));
 async function selectTime(id){
  const row=raw.rawValues.find(v=>v.id===id),c=card(row.outcomeId);await c.waitFor();
  const toggle=c.locator('.outcome-toggle');if(await toggle.getAttribute('aria-expanded')==='false')await toggle.click();
  await c.locator('.paper-time-button[data-timepoint="'+row.timepoint+'"]').click();
  await effect(id).waitFor({state:'visible'});return effect(id);
 }
 async function checkSummary(id,expectedSE){
  const s=raw.rawValues.find(v=>v.id===id).statistics,text=normalize(await summary(id).innerText());
  assert.match(text,statisticPattern('Effect',s.estimate));assert.ok(text.includes('95% CI'));assert.ok(text.includes(String(s.ciLow)));assert.ok(text.includes(String(s.ciHigh)));
  assert.match(text,statisticPattern('Derived SE',expectedSE.toFixed(3)));assert.match(text,/Generic inverse variance|GIV/);assert.match(text,/Control\s*(?:minus|-)\s*Intervention/i);
  assert.equal(await effect(id).locator('pre:visible').count(),0,'JSON belongs in calculation details, not the normal result');
  assert.ok(await effect(id).getByRole('button',{name:'このGIVデータを採用',exact:true}).isVisible());assert.ok(await effect(id).getByRole('button',{name:'計算詳細',exact:true}).isVisible());
 }
 async function directAdopt(id){
  await selectTime(id);await effect(id).getByRole('button',{name:'このGIVデータを採用',exact:true}).click();
  await page.waitForFunction(rawId=>DataExReview.snapshot()?.resultSets?.['paper-detail:'+rawId]?.acceptedDerived?.length===1,id);await idle();
  assert.equal(await dialog().count(),0,'The explicit GIV button adopts directly');
 }
 try{
  await page.goto(url);await page.waitForFunction(()=>window.DataExReview&&window.DataExReviewStore);await idle();
  await page.evaluate(r=>DataExReviewStore.put(r,-1),record);await page.evaluate(r=>DataExReview.openRecord(r),record);await idle();
  assert.equal(hash((await snapshot()).snapshot.raw),rawHash);assert.equal((await snapshot()).extractionId,record.extractionId);assert.equal((await basket()).length,0);
  await page.locator('#pdf-file').setInputFiles(pdf);await page.waitForFunction(()=>DataExFuzzy.brief().pdfLoaded);await idle();
  assert.equal((await snapshot()).extractionId,record.extractionId);pass('Saved Moffett Raw and original PDF restore into an isolated profile without new extraction');
  for(const id of ids){await selectTime(id);const s=raw.rawValues.find(v=>v.id===id).statistics;await checkSummary(id,(s.ciHigh-s.ciLow)/(2*1.959964));pass(id+': the selected time shows Effect, CI, rounded Derived SE, direction and GIV actions without opening an old fold');}
  assert.equal((await basket()).length,0);assert.equal(hash((await snapshot()).snapshot.raw),rawHash);pass('Time switching and all six visible summaries never auto-adopt or mutate Raw');
  await selectTime(ids[0]);await effect(ids[0]).getByRole('button',{name:'計算詳細',exact:true}).click();await dialog().waitFor({state:'visible'});
  let details=normalize(await dialog().innerText());assert.ok(details.includes('Raw effect'));assert.ok(details.includes('0.92'));assert.ok(details.includes('-0.02'));assert.ok(details.includes('1.87'));assert.ok(details.includes('95%'));assert.ok(details.includes('0.4821517129906468'));assert.ok(details.includes('1.959964'));assert.match(details,/Control\s*(?:minus|-)\s*Intervention/i);
  await page.screenshot({path:path.join(out,'01-calculation-details.png')});await dialog().getByRole('button',{name:'戻る',exact:true}).click();assert.equal((await basket()).length,0);pass('Calculation details retain Raw CI, full-precision SE and formula; closing them does not adopt');
  await effect(ids[0]).locator('[data-raw-id="'+ids[0]+'"]').click();await page.waitForFunction(()=>document.querySelector('#page-number').value==='4'&&document.querySelector('#evidence-message').textContent.includes('値を特定'));pass('The visible adjusted effect still opens its Table 2 value and yellow highlight');
  for(const id of ids)await directAdopt(id);
  let r=await snapshot();assert.equal(hash(r.snapshot.raw),rawHash);assert.equal((await basket()).length,6);for(const id of ids){assert.equal(r.resultSets['paper-detail:'+id].acceptedDerived.length,1);assert.equal(r.resultSets['paper-detail:'+id].pointIds[0],id);assert.equal(r.points[id].decision.finalValue.se,null);}
  const giv=await page.evaluate(()=>DataExDecision.exportBasket([DataExReview.snapshot()],{format:'giv'}));assert.equal(giv.rows.length,6);assert.equal(giv.blocked,false);assert.ok(giv.rows.every(row=>row.Effect>0&&row.Comparison_Direction==='Control minus Intervention'));pass('Six explicit one-click GIV adoptions use the original stable paper-detail IDs and export six unflipped effects');
  for(const outcome of ['O1','O2']){const oldFold=card(outcome).getByText('調整済み効果を表示',{exact:true});if(await oldFold.count()){await oldFold.click();await oldFold.click();await oldFold.click();}}
  for(const id of ids)for(const shown of await page.locator('.paper-giv-summary[data-derived-raw-id="'+id+'"]').all())assert.ok(await shown.getByRole('button',{name:'このGIVデータを採用',exact:true}).isDisabled());
  for(const id of [ids[0],ids[2],ids[0]])await selectTime(id);
  assert.equal((await basket()).length,6);assert.equal((await page.evaluate(()=>DataExDecision.exportBasket([DataExReview.snapshot()],{format:'giv'}))).rows.length,6);assert.equal(hash((await snapshot()).snapshot.raw),rawHash);pass('Reopening the older adjusted-effect fold and revisiting times cannot duplicate accepted GIV sets');
  await selectTime(ids[0]);await effect(ids[0]).locator('[data-result-set-action="edit"]').click();await dialog().waitFor({state:'visible'});await dialog().locator('[data-point-field="'+ids[0]+':ciHigh"]').fill('1.90');await dialog().getByRole('button',{name:'修正を保存',exact:true}).click();await dialog().waitFor({state:'hidden'});await idle();
  const changedSE=(1.90-(-0.02))/(2*1.959964);await page.waitForFunction(({id,value})=>DataExReview.snapshot()?.points[id].decision.finalValue?.ciHigh===value,{id:ids[0],value:1.90});
  let changedText=normalize(await summary(ids[0]).innerText());assert.ok(changedText.includes('1.9'));assert.match(changedText,statisticPattern('Derived SE',changedSE.toFixed(3)));r=await snapshot();assert.equal(hash(r.snapshot.raw),rawHash);assert.equal(r.points[ids[0]].raw.ciHigh,1.87);assert.equal(r.resultSets['paper-detail:'+ids[0]].status,'EDITED_DRAFT');assert.equal((await page.evaluate(()=>DataExDecision.exportBasket([DataExReview.snapshot()],{format:'giv'}))).rows.length,5);pass('A test-only Final CI edit updates visible Derived SE, invalidates adoption and preserves exact Raw');
  await effect(ids[0]).getByRole('button',{name:'計算詳細',exact:true}).click();details=normalize(await dialog().innerText());assert.ok(details.includes('1.87'));assert.ok(details.includes('1.9'));assert.ok(details.includes(String(changedSE)));assert.ok(details.includes('Final'));await dialog().getByRole('button',{name:'戻る',exact:true}).click();await directAdopt(ids[0]);assert.equal((await basket()).length,6);assert.equal((await page.evaluate(()=>DataExDecision.exportBasket([DataExReview.snapshot()],{format:'giv'}))).rows.length,6);pass('Details distinguish original Raw from changed Final inputs and explicit re-adoption updates the same GIV set');
  await page.setViewportSize({width:375,height:1000});await selectTime(ids[0]);await summary(ids[0]).scrollIntoViewIfNeeded();assert.ok((await summary(ids[0]).boundingBox()).width<=375);assert.ok(await effect(ids[0]).getByRole('button',{name:'このGIVデータを採用',exact:true}).isVisible());await effect(ids[0]).getByRole('button',{name:'計算詳細',exact:true}).click();assert.ok((await dialog().boundingBox()).width<=375);await page.screenshot({path:path.join(out,'02-calculation-375.png')});await dialog().getByRole('button',{name:'戻る',exact:true}).click();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));pass('375px supports concise GIV summary and calculation controls without document overflow');
  assert.deepEqual(errors,[]);assert.equal(hash((await snapshot()).snapshot.raw),rawHash);assert.equal(hash(fs.readFileSync(recordFile,'utf8')),fileHash);pass('No JavaScript errors, saved input-file changes, Raw changes, or re-extraction occurred');
  fs.writeFileSync(path.join(out,'acceptance.json'),JSON.stringify({url,checks,errors,rawHash,extractionId:record.extractionId,note:'Restored saved Moffett data and test-only Final edits/adoptions in an isolated headless profile. Live user Review is untouched.'},null,2));
 }catch(error){await page.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});fs.writeFileSync(path.join(out,'failure.json'),JSON.stringify({error:error.stack,checks,errors},null,2));throw error;}finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
