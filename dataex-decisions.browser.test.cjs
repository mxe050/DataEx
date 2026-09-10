/* Real Cherkin acceptance 1–10; edits are explicitly dummy values in an isolated browser profile. */
const {chromium}=require(process.env.DATAEX_PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const url=process.env.DATAEX_URL||'http://127.0.0.1:8766/dataex-chatgpt.html',pdf=process.env.DATAEX_CHERKIN_PDF,rawFile=process.env.DATAEX_CHERKIN_RAW;
const out=process.env.DATAEX_ARTIFACT_DIR||path.join(__dirname,'test-artifacts','decision-v3');fs.mkdirSync(out,{recursive:true});
assert.equal(new URL(url).origin,'http://127.0.0.1:8766');assert.ok(pdf&&rawFile);
const original=JSON.parse(fs.readFileSync(rawFile,'utf8')),rawHash=crypto.createHash('sha256').update(fs.readFileSync(rawFile)).digest('hex');
(async()=>{
 const browser=await chromium.launch({headless:true}),context=await browser.newContext({viewport:{width:1440,height:1100},acceptDownloads:true}),page=await context.newPage(),checks=[],errors=[],requests=[];
 const pass=(name,detail)=>{checks.push({name,detail});console.log('PASS '+name);};
 const card=id=>page.locator('.outcome-card[data-outcome-id="'+id+'"]');
 const snapshot=()=>page.evaluate(()=>DataExReview.snapshot());
 const idle=()=>page.waitForFunction(()=>window.DataExReview?.ready());
 const cellId='t2-O1-A2-1',controlId='t2-O1-A4-1';
 async function openCard(id){if(await card(id).locator('.outcome-card-body').isHidden())await card(id).locator('.outcome-toggle').click();const fold=card(id).locator('details').filter({has:page.locator('summary').filter({hasText:'Outcome全体の判断・確定'})}).first();if(await fold.count()&&!await fold.evaluate(e=>e.open))await fold.locator(':scope > summary').click();}
 async function menu(id,label){const d=page.locator('.decision-cell-menu[data-point-id="'+id+'"]').first();await d.locator('summary').click();await d.getByRole('button',{name:label==='修正'?'値を修正':label,exact:true}).click();}
 async function edit(id,patch){
  await idle();const before=await snapshot(),oid=before.points[id].outcomeId;if(before.outcomes[oid].status==='CONFIRMED'){await card(oid).getByRole('button',{name:'確定を解除して編集',exact:true}).click();await idle();}await menu(id,'修正');const dialog=page.locator('.decision-dialog[open][data-point-id="'+id+'"]');for(const [k,v] of Object.entries(patch))await dialog.locator('[data-field="'+k+'"]').fill(String(v));
  await dialog.locator('[data-field=reviewerNote]').fill('受入テスト用のダミー修正。原著の確定値として使用しない。');
  await dialog.getByRole('button',{name:'修正を保存',exact:true}).click();await dialog.waitFor({state:'hidden'});await idle();
 }
 async function confirmOutcome(id){await idle();await card(id).getByRole('button',{name:'このOutcomeを確定',exact:true}).click();await page.locator('.decision-dialog[open][data-confirm-outcome="'+id+'"]').getByRole('button',{name:'そのまま確定',exact:true}).click();await page.waitForFunction(id=>DataExReview.snapshot().outcomes[id].status==='CONFIRMED',id);}
 async function confirmStudy(){await idle();await page.getByRole('button',{name:'この研究を確定してReview Workspaceへ追加',exact:true}).click();const d=page.locator('.decision-dialog[open]');await d.getByRole('button',{name:'確定して保存',exact:true}).click();await d.waitFor({state:'hidden'});await page.waitForFunction(()=>DataExReview.snapshot().status==='CONFIRMED');}
 async function downloadCsv(dialog,name){const event=page.waitForEvent('download');await dialog.getByRole('button',{name:name||'確定済みだけ出力',exact:true}).click();const file=await event;const saved=path.join(out,file.suggestedFilename());await file.saveAs(saved);return {path:saved,text:fs.readFileSync(saved,'utf8')};}
 try{
  await page.addInitScript(()=>{window.registeredTools={};Object.defineProperty(document,'modelContext',{value:{registerTool(t){registeredTools[t.name]=t;}}});});
  page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push({method:r.method(),url:r.url()}));
  await page.goto(url);await page.waitForFunction(()=>window.DataExFuzzy&&window.DataExReview);await page.locator('#pdf-file').setInputFiles(pdf);await page.waitForFunction(()=>DataExFuzzy.brief().pdfLoaded);
  const brief=await page.evaluate(()=>DataExFuzzy.brief()),input={...structuredClone(original),requestId:brief.requestId};assert.equal(brief.pdfId,original.pdfId);
  const result=await page.evaluate(input=>registeredTools.dataex_set_results.execute(input),input);assert.ok(result.ok,JSON.stringify(result));await idle();assert.equal(Object.keys((await snapshot()).points).length,163);
  await openCard('O1');await card('O1').locator('[data-raw-id="'+cellId+'"]').click();await page.waitForFunction(()=>document.querySelector('#page-number').value==='21'&&document.querySelector('#evidence-message').textContent.includes('値を特定'));await idle();assert.equal((await snapshot()).points[cellId].decision.status,'REVIEWED');
  await page.screenshot({path:path.join(out,'01-click-source.png')});pass('1. Roland 8-week cell navigates to the exact original value on PDF page 21');
  // A hover pencil must never steal a source click, including in a narrow desktop pane.
  const clickTargets=[];
  for(const width of [960,375,1440]){
   await page.setViewportSize({width,height:1100});
   const value=card('O1').locator('[data-raw-id="'+cellId+'"]'),pencil=card('O1').getByRole('button',{name:'値を修正: '+cellId,exact:true});
   await value.scrollIntoViewIfNeeded();await value.hover();const valueBox=await value.boundingBox(),pencilBox=await pencil.boundingBox();
   assert.ok(valueBox&&pencilBox);const overlap=Math.max(0,Math.min(valueBox.x+valueBox.width,pencilBox.x+pencilBox.width)-Math.max(valueBox.x,pencilBox.x))*Math.max(0,Math.min(valueBox.y+valueBox.height,pencilBox.y+pencilBox.height)-Math.max(valueBox.y,pencilBox.y));
   assert.equal(overlap,0,JSON.stringify({width,valueBox,pencilBox}));clickTargets.push({width,valueBox,pencilBox,overlap});
   await value.click();await idle();assert.equal(await page.locator('.decision-dialog[open]').count(),0);assert.equal(await page.locator('#page-number').inputValue(),'21');assert.match(await page.locator('#evidence-message').innerText(),/値を特定/);
   await pencil.click();const editor=page.locator('.decision-dialog[open]');await editor.waitFor();assert.equal(await editor.locator('[data-field=mean]').inputValue(),'6.3');await editor.getByRole('button',{name:'キャンセル',exact:true}).click();
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));assert.equal((await snapshot()).points[cellId].raw.mean,6.3);
   await page.screenshot({path:path.join(out,'source-and-edit-'+width+'.png')});
  }
  fs.writeFileSync(path.join(out,'source-and-edit-targets.json'),JSON.stringify(clickTargets,null,2));
  pass('Source value and edit pencil never overlap; both clicks work separately at 375, 960 and 1440px');
  await card('O1').getByRole('button',{name:'レビューに採用',exact:true}).click();await idle();await confirmOutcome('O1');let r=await snapshot();assert.equal(r.points[cellId].decision.status,'ACCEPTED');assert.equal(r.points[cellId].decision.finalValue.n,null);assert.equal(r.outcomes.O1.status,'CONFIRMED');
  pass('2. Outcome adoption and explicit incomplete-n confirmation create ACCEPTED decisions');
  await edit(cellId,{mean:'6.1',n:'152'});r=await snapshot();assert.equal(r.points[cellId].raw.mean,6.3);assert.equal(r.points[cellId].raw.n,null);assert.equal(r.points[cellId].decision.finalValue.mean,6.1);assert.equal(r.points[cellId].decision.finalValue.n,152);assert.equal(r.points[cellId].decision.status,'EDITED');assert.deepEqual(r.snapshot.raw,input);assert.equal(r.outcomes.O1.status,'DRAFT');
  pass('3. A dummy cell correction changes Final only; Raw and prior values remain in history');
  await page.locator('#other-outcomes > summary').click();await card('O15').waitFor();await openCard('O15');await card('O15').getByRole('button',{name:'今回は使わない',exact:true}).click();await idle();r=await snapshot();assert.equal(r.outcomes.O15.status,'EXCLUDED');assert.ok(Object.values(r.points).filter(p=>p.outcomeId==='O15').every(p=>p.decision.status==='EXCLUDED'));assert.deepEqual(r.snapshot.raw,input);
  assert.equal(r.snapshot.raw.rawValues.filter(v=>v.outcomeId==='O15').length,0);assert.deepEqual(r.snapshot.raw.outcomes.find(o=>o.id==='O15'),input.outcomes.find(o=>o.id==='O15'));assert.ok(r.history.some(h=>h.action==='EXCLUDE_OUTCOME'&&h.target==='O15'));
  pass('4. Cost exclusion sets EXCLUDED and retains its original outcome and source metadata (no numeric Cost rows were reported in frozen Raw)');
  await openCard('O16');await menu('safety-A1','除外');await idle();assert.equal((await snapshot()).points['safety-A1'].decision.status,'EXCLUDED');assert.deepEqual((await snapshot()).snapshot.raw,input);
  await openCard('O3');await menu('figure-O3-A1-0','保留');await idle();assert.equal((await snapshot()).points['figure-O3-A1-0'].decision.status,'HOLD');
  await edit(controlId,{n:'148'});await confirmOutcome('O1');await confirmStudy();r=await snapshot();assert.ok((await page.locator('#review-workspace').innerText()).includes('Cherkin 2009'));assert.equal((await page.evaluate(()=>DataExReviewStore.get(DataExReview.snapshot().id))).status,'CONFIRMED');
  await page.screenshot({path:path.join(out,'05-workspace-confirmed.png')});pass('5. Study confirmation persists the study, outcomes and decisions in Review Workspace');
  await page.reload();await page.locator('#review-workspace').getByRole('button',{name:/Cherkin 2009/}).waitFor();await page.locator('#review-workspace').getByRole('button',{name:/Cherkin 2009/}).click();await idle();r=await snapshot();assert.equal(r.status,'CONFIRMED');assert.equal(r.points[cellId].decision.finalValue.mean,6.1);assert.deepEqual(r.snapshot.raw,input);assert.ok((await page.locator('#decision-message').innerText()).includes('原著PDFを再選択'));assert.ok((await page.locator('#fuzzy-result-status').innerText()).includes('PDF未読込'));
  await page.screenshot({path:path.join(out,'06-reload-restored.png')});pass('6. Reload restores finalized content without a PDF and prompts for reconnection');
  await page.locator('#pdf-file').setInputFiles(pdf);await page.waitForFunction(()=>DataExFuzzy.brief().pdfLoaded);await idle();await openCard('O1');await card('O1').locator('[data-raw-id="'+cellId+'"]').click();await page.waitForFunction(()=>document.querySelector('#page-number').value==='21');assert.equal((await snapshot()).points[cellId].decision.status,'EDITED');assert.equal((await snapshot()).points[cellId].decision.finalValue.mean,6.1);
  await page.getByRole('button',{name:'CSV出力',exact:true}).click();let dialog=page.locator('.decision-dialog[open]');await dialog.getByRole('button',{name:'プレビュー',exact:true}).click();await dialog.locator('.decision-preview-count').waitFor();
  assert.ok(await dialog.locator('[data-warning-code=HOLD]').isVisible());assert.ok(await dialog.getByRole('button',{name:'CSV保存',exact:true}).isDisabled());await page.screenshot({path:path.join(out,'09-hold-warning.png')});
  pass('9. HOLD triggers a warning and requires explicit confirmed-only export acknowledgement');
  const expectedMaster=await page.evaluate(()=>DataExDecision.exportData([DataExReview.snapshot()]));assert.ok(expectedMaster.rows.length);assert.ok(expectedMaster.rows.every(row=>['ACCEPTED','EDITED'].includes(row.decision_status)));assert.ok(!expectedMaster.rows.some(row=>row.outcome_id==='O15'||row.outcome_id==='O3'));
  const master=await downloadCsv(dialog);assert.equal(master.text,expectedMaster.csv);pass('7. Complete Master CSV exports only ACCEPTED/EDITED final values',master.path);
  await dialog.getByLabel('形式',{exact:true}).selectOption('continuous');await dialog.getByRole('button',{name:'プレビュー',exact:true}).click();await dialog.locator('[data-warning-code=SHARED_CONTROL]').waitFor();assert.ok(await dialog.getByRole('button',{name:'CSV保存',exact:true}).isDisabled());
  await page.screenshot({path:path.join(out,'10-shared-control-warning.png')});pass('10. Multi-arm shared-control duplication is blocked until one comparison is explicitly chosen');
  await dialog.locator('[data-pair-intervention]').selectOption('A2');await dialog.locator('[data-pair-comparator]').selectOption('A4');await dialog.getByRole('button',{name:'プレビュー',exact:true}).click();await dialog.locator('.decision-preview-count').waitFor();
  const expectedPair=await page.evaluate(()=>{const r=DataExReview.snapshot();return DataExDecision.exportData([r],{format:'continuous',pairs:{[r.id]:{intervention:'A2',comparator:'A4'}}});});assert.equal(expectedPair.rows.length,1);assert.equal(expectedPair.rows[0].Intervention_Mean,6.1);assert.equal(expectedPair.rows[0].Intervention_N,152);assert.equal(expectedPair.rows[0].Comparator_N,148);assert.ok((await dialog.locator('.decision-csv-preview').innerText()).includes('6.1'));
  const pair=await downloadCsv(dialog);assert.equal(pair.text,expectedPair.csv);await page.screenshot({path:path.join(out,'08-continuous-final-preview.png')});pass('8. Continuous pairwise preview and file use final values only, omitting incomplete pairs',pair.path);
  await dialog.getByLabel('形式',{exact:true}).selectOption('audit');await dialog.getByRole('button',{name:'プレビュー',exact:true}).click();await dialog.locator('.decision-preview-count').waitFor();const audit=await downloadCsv(dialog,'CSV保存');const expectedAudit=await page.evaluate(()=>DataExDecision.exportData([DataExReview.snapshot()],{format:'audit'}));assert.equal(audit.text,expectedAudit.csv);assert.equal(expectedAudit.rows.length,163);assert.ok(expectedAudit.rows.some(x=>x.decision_status==='HOLD'));assert.ok(expectedAudit.rows.some(x=>x.decision_status==='EXCLUDED'));await dialog.getByRole('button',{name:'閉じる',exact:true}).click();
  pass('Audit CSV retains all 163 points, original values and decision history',audit.path);
  await page.getByRole('button',{name:'研究をロック',exact:true}).click();await idle();assert.equal((await snapshot()).status,'LOCKED');assert.ok(await card('O1').getByRole('button',{name:'レビューに採用',exact:true}).isDisabled());await page.getByRole('button',{name:'研究を再編集',exact:true}).click();await idle();assert.equal((await snapshot()).status,'PARTIALLY_CONFIRMED');assert.equal((await snapshot()).history.at(-1).action,'REOPEN');
  pass('Study locking and reopening work with retained audit history');
  await card('O1').getByRole('button',{name:'確定を解除して編集',exact:true}).click();await idle();
  const old=await snapshot();await page.evaluate(async()=>{const r=DataExReview.snapshot(),next=DataExDecision.apply(r,{type:'POINT',id:'t2-O1-A2-1',status:'EDITED',patch:{mean:6.2},note:'isolated concurrent-edit test'});await DataExReviewStore.put(next,r.revision);});await card('O1').getByRole('button',{name:'レビューに採用',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#decision-message').textContent.includes('別のタブ'));assert.equal((await snapshot()).revision,old.revision);assert.equal((await page.evaluate(()=>DataExReviewStore.get(DataExReview.snapshot().id))).points[cellId].decision.finalValue.mean,6.2);
  await page.locator('#review-workspace').getByRole('button',{name:/Cherkin 2009/}).click();await idle();assert.equal((await snapshot()).points[cellId].decision.finalValue.mean,6.2);
  pass('Concurrent revision conflict prevents lost updates; reopening loads the latest saved decision');
  await openCard('O1');await menu(cellId,'修正');dialog=page.locator('.decision-dialog[open]');await dialog.locator('[data-field=mean]').fill('7.7');await page.evaluate(()=>{window.originalStorePut=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(){throw new DOMException('test quota failure','QuotaExceededError');};});await dialog.getByRole('button',{name:'修正を保存',exact:true}).click();await dialog.locator('[role=status]').waitFor();await page.waitForFunction(()=>document.querySelector('.decision-dialog[open] [role=status]').textContent.length>0);assert.equal((await snapshot()).points[cellId].decision.finalValue.mean,6.2);await page.evaluate(()=>{IDBObjectStore.prototype.put=window.originalStorePut;});await dialog.getByRole('button',{name:'キャンセル',exact:true}).click();
  pass('Persistence failure leaves saved decisions and Raw intact and displays a recoverable error');
  await page.setViewportSize({width:375,height:1000});await card('O1').locator('.outcome-title').scrollIntoViewIfNeeded();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await menu(cellId,'修正');dialog=page.locator('.decision-dialog[open]');assert.ok((await dialog.boundingBox()).width<=375);await page.screenshot({path:path.join(out,'decision-375.png')});await dialog.getByRole('button',{name:'キャンセル',exact:true}).click();pass('375px supports cell menus and the final-value editor without page overflow');

  await page.setViewportSize({width:1440,height:1100});const choices=page.locator('.decision-choice-panel');await choices.locator('summary').click();
  await choices.getByRole('button',{name:'AI推奨を採用',exact:true}).click();await idle();assert.equal((await snapshot()).choices.arms.mode,'RECOMMENDED');
  await choices.getByRole('button',{name:'4群を別々',exact:true}).click();await idle();assert.equal((await snapshot()).choices.arms.groups.length,4);
  await choices.getByRole('button',{name:'8 週',exact:true}).click();await idle();assert.deepEqual((await snapshot()).choices.time.selected,['8 weeks']);
  await choices.getByRole('button',{name:'複数時点を保存',exact:true}).click();await idle();assert.equal((await snapshot()).choices.time.mode,'ALL');assert.deepEqual((await snapshot()).snapshot.raw,input);
  pass('Post-extraction arm proposals and time choices save decisions without changing any Raw arm or timepoint');

  // A second, explicitly synthetic paper exercises accumulation without relabelling any Cherkin data.
  const {fixture}=require('./dataex-fuzzy-fixture.cjs'),{PDFDocument,StandardFonts}=require('pdf-lib');
  const secondName='workspace-second-fixture.pdf',second=fixture('synthetic-second',secondName);second.study.label='Synthetic Review Workspace Study B';
  const binary=structuredClone(second.rawValues.find(v=>v.outcomeId==='O5'));binary.id='synthetic-binary-control';binary.armId='A4';binary.statistics={events:3,total:55};binary.sourceRefs={events:'synthetic-binary-control-source',total:'synthetic-binary-control-source'};second.rawValues.push(binary);
  second.sources.push({...structuredClone(second.sources[0]),id:'synthetic-binary-control-source',evidenceText:'SYNTHETIC BINARY: A4 3 events / 55 participants',directValue:'3 / 55',row:'Adverse events',column:'A4'});
  const effect=structuredClone(second.rawValues[0]);effect.id='synthetic-effect';effect.comparatorArmId='A4';effect.resultType='effect';effect.effectMeasure='MD';effect.adjustment='unadjusted';effect.statistics={estimate:-2,se:.5};effect.sourceRefs={estimate:'synthetic-effect-source',se:'synthetic-effect-source'};second.rawValues.push(effect);
  second.sources.push({...structuredClone(second.sources[0]),id:'synthetic-effect-source',evidenceText:'SYNTHETIC EFFECT: A1 versus A4 MD -2 SE 0.5',directValue:'MD -2; SE 0.5',row:'VAS pain intensity',column:'A1 vs A4'});
  const generated=await PDFDocument.create(),font=await generated.embedFont(StandardFonts.Helvetica),sheet=generated.addPage([1300,1000]);second.sources.forEach((s,i)=>sheet.drawText(s.evidenceText,{x:25,y:950-i*45,size:8,font}));const secondPdf=path.join(out,secondName);fs.writeFileSync(secondPdf,await generated.save());
  await page.locator('#pdf-file').setInputFiles(secondPdf);await page.waitForFunction(()=>DataExFuzzy.brief().pdfLoaded&&DataExFuzzy.brief().pdfManifest[0].filename==='workspace-second-fixture.pdf');
  const secondBrief=await page.evaluate(()=>DataExFuzzy.brief());second.pdfId=secondBrief.pdfId;second.requestId=secondBrief.requestId;assert.notEqual(second.pdfId,input.pdfId);
  assert.ok((await page.evaluate(p=>registeredTools.dataex_set_results.execute(p),second)).ok);await idle();
  for(const id of ['O1','O5']){await openCard(id);await card(id).getByRole('button',{name:'レビューに採用',exact:true}).click();await idle();await confirmOutcome(id);}
  await confirmStudy();assert.equal((await page.evaluate(()=>DataExReview.all())).length,2);assert.deepEqual((await snapshot()).snapshot.raw,second);
  await page.reload();await page.locator('#review-workspace').getByRole('button',{name:'Synthetic Review Workspace Study B',exact:true}).waitFor();assert.equal(await page.locator('#review-workspace tr[data-record-id]').count(),2);
  await page.locator('#review-workspace').getByRole('button',{name:'Synthetic Review Workspace Study B',exact:true}).click();await idle();assert.equal((await snapshot()).status,'CONFIRMED');await page.locator('#review-workspace').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,'workspace-two-studies.png')});
  pass('Two distinct studies persist across reload and reopen with their own Raw, source metadata and human decisions');

  await page.getByRole('button',{name:'CSV出力',exact:true}).click();dialog=page.locator('.decision-dialog[open]');
  for(const format of ['binary','giv']){
   await dialog.getByLabel('形式',{exact:true}).selectOption(format);await dialog.locator('[data-pair-intervention]').selectOption('A1');await dialog.locator('[data-pair-comparator]').selectOption('A4');await dialog.getByRole('button',{name:'プレビュー',exact:true}).click();await dialog.locator('.decision-preview-count').waitFor();
   const expected=await page.evaluate(format=>{const r=DataExReview.snapshot();return DataExDecision.exportData([r],{format,pairs:{[r.id]:{intervention:'A1',comparator:'A4'}}});},format);assert.equal(expected.rows.length,1);
   const file=await downloadCsv(dialog);assert.equal(file.text,expected.csv);
   if(format==='binary'){assert.equal(expected.rows[0].Intervention_Events,0);assert.equal(expected.rows[0].Comparator_Total,55);}else{assert.equal(expected.rows[0].Effect,-2);assert.equal(expected.rows[0].SE,.5);}
   pass(format+' preview and complete CSV download use finalized synthetic values',file.path);
  }await dialog.getByRole('button',{name:'閉じる',exact:true}).click();
  await page.locator('#review-workspace').getByRole('button',{name:/Cherkin 2009/}).click();await idle();assert.equal((await snapshot()).points[cellId].decision.finalValue.mean,6.2);

  r=await snapshot();assert.deepEqual(r.snapshot.raw,input);assert.equal(crypto.createHash('sha256').update(fs.readFileSync(rawFile)).digest('hex'),rawHash);assert.deepEqual(errors,[]);assert.equal(requests.filter(r=>r.method!=='GET').length,0);
  fs.writeFileSync(path.join(out,'acceptance-1-10.json'),JSON.stringify({url,pdf,rawHash,checks,errors,requests,counts:{raw:r.snapshot.raw.rawValues.length,sources:r.snapshot.raw.sources.length},testEdits:'Dummy human decisions in isolated browser only; not validated extraction values.'},null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
