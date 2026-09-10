const {chromium}=require(process.env.DATAEX_PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const out=process.env.DATAEX_ARTIFACT_DIR||__dirname,assets=process.env.DATAEX_PDF_DIR||path.join(__dirname,'test-assets');
const url=process.env.DATAEX_URL||'http://127.0.0.1:8766/dataex-chatgpt.html';
assert.equal(new URL(url).origin,'http://127.0.0.1:8766');
fs.mkdirSync(out,{recursive:true});
(async()=>{
  const browser=await chromium.launch({headless:true}),page=await browser.newPage({viewport:{width:1500,height:1600}}),errors=[],uploads=[],passed=[];
  try{
    page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('request',r=>{if(!['GET','HEAD'].includes(r.method()))uploads.push(r.url());});
    // Optional staging override on the same 8766 origin; never open another server/port.
    if(process.env.DATAEX_SOURCE_DIR)for(const name of ['dataex-chatgpt.html','dataex-visual.js','dataex-webmcp.js'])await page.route(new URL(name,url).href,route=>route.fulfill({status:200,contentType:name.endsWith('.html')?'text/html; charset=utf-8':'text/javascript; charset=utf-8',body:fs.readFileSync(path.join(process.env.DATAEX_SOURCE_DIR,name))}));
    await page.addInitScript(()=>{window.registeredTools={};Object.defineProperty(document,'modelContext',{value:{registerTool(t){window.registeredTools[t.name]=t;}}});});
    const ready=()=>page.waitForFunction(()=>Object.keys(window.registeredTools).length===10);
    const call=(name,args={})=>page.evaluate(({name,args})=>window.registeredTools[name].execute(args),{name,args});
    const load=async()=>{await page.locator('#pdf-file').setInputFiles(path.join(assets,'Holz 2020.pdf'));await page.waitForFunction(()=>document.querySelector('#pdf-status').textContent.startsWith('✓'));};
    const conditions=async(outcome,timepoint)=>{if(!await page.locator('#condition-content').isVisible())await page.locator('#toggle-conditions').click();await page.locator('#intervention').fill('FYB201');await page.locator('#comparator').fill('Reference ranibizumab');await page.locator('#outcomes').fill(outcome);await page.locator('#timepoint').fill(timepoint);};
    const select=async r=>{await page.setViewportSize({width:1500,height:1600});await page.locator('#page-number').fill('5');await page.locator('#page-number').dispatchEvent('change');await page.waitForFunction(()=>document.querySelector('#pdf-page-5 canvas'));await page.locator('#selection-region').click();await page.locator('#pdf-page-5').scrollIntoViewIfNeeded();const b=await page.locator('#pdf-page-5').boundingBox();await page.mouse.move(b.x+r.x*b.width,b.y+r.y*b.height);await page.mouse.down();await page.mouse.move(b.x+(r.x+r.width)*b.width,b.y+(r.y+r.height)*b.height,{steps:8});await page.mouse.up();await page.locator('#selection-preview').click();await page.locator('#selection-dialog').waitFor({state:'visible'});await page.locator('#crop-use').click();const c=await call('dataex_get_selection_context');assert.ok(c.selectionId);assert.equal((await call('dataex_prepare_selection_for_ai',{selectionId:c.selectionId})).ok,true);return c;};
    await page.goto(url);await ready();await load();
    const figureName='Study eye BCVA at week 24';await conditions(figureName,'week 24');
    const c=await select({x:.06,y:.635,width:.88,height:.28});
    assert.ok(!/base64,|data:image|blob:/.test(JSON.stringify(c)));
    assert.match(c.instructions.join(' '),/figureMetadata/);
    await page.setViewportSize({width:1450,height:1000});await page.screenshot({path:path.join(out,'phase321-figure-crop.png')});
    const arm=(name,mean,sd,n)=>({name,valueText:`Mean ${mean}`,numerator:null,denominator:n,mean,sd,se:null});
    // Read from the actual Figure 2 crop: bar positions approximate, caption/labels direct.
    const figure={selectionId:c.selectionId,sourceKind:'FIGURE_ESTIMATE',resultStatus:'READY',outcomes:[{
      outcome:figureName,timepoint:'week 24',population:null,unit:'ETDRS letters',analysisUnit:'study eye',variableType:'continuous',
      arms:[arm('FYB201',69,null,null),arm('Reference ranibizumab',68,null,null)].map(a=>({...a,nStatus:'NOT_SHOWN_FOR_TIMEPOINT',uncertaintyValueStatus:'UNKNOWN'})),
      directVisibleValues:['Figure 2','Mean ± SD','US-relevant population, full analysis set','Study Week','Mean ETDRS Letters (+SD)'],derivedValues:[],approximate:false,
      reason:'At week 24, bar heights are about 69 and 68 ETDRS letters. The caption identifies SD and the population; numeric SD and week-specific n are not printed.',
      reviewFlags:['SD不明','解析集団の確認が必要'],
      figureMetadata:{figureNumber:'Figure 2',panel:null,title:null,caption:'Mean ± SD study eye best-corrected visual acuity during the study (US-relevant population, full analysis set).',xAxis:'Study Week',yAxis:'Mean ETDRS Letters (+SD)',unit:'ETDRS letters',series:['FYB201','Reference ranibizumab'],errorBarType:'SD',population:'US-relevant population, full analysis set',analysisSet:'full analysis set',timepoint:'week 24',timepointLabels:['Baseline','4','8','12','16','20','24','28','32','36','40','44','48'],metadataVerification:'VISUALLY_VERIFIED_DIRECT_METADATA'}
    }],visualAudit:{valuesClearlyVisible:false,labelsClearlyVisible:true,unitsClearlyVisible:true,timepointClearlyVisible:true,uncertaintyTypeClearlyVisible:true,notes:'Caption and legend included in the crop. Means are position estimates, not printed values.'}};
    let result=await call('dataex_set_selection_result',figure);assert.equal(result.ok,true,JSON.stringify(result));let f=result.outcomes[0];
    assert.equal(f.status,'CANDIDATE_ONLY');assert.equal(f.analysisAction,'REVIEW');assert.equal(f.approximate,true);assert.equal(f.figureMetadata.errorBarType,'SD');assert.equal(f.figureMetadata.population,'US-relevant population, full analysis set');assert.equal(f.figureMetadata.metadataVerification,'VISUALLY_VERIFIED_DIRECT_METADATA');
    assert.deepEqual(f.arms.map(a=>a.mean),[69,68]);assert.ok(f.arms.every(a=>a.n===null&&a.nStatus==='NOT_SHOWN_FOR_TIMEPOINT'&&a.uncertainty.sd===null&&a.uncertainty.valueStatus==='UNKNOWN'));
    assert.deepEqual(f.unresolved,['week 24の対応n','SDの数値']);assert.doesNotMatch(f.figureSummary,/SD不明|解析集団の確認が必要/);assert.match(f.figureSummary,/captionで確認/);
    assert.deepEqual(result.summaryCounts,{use:0,review:1,doNotUse:0,total:1});
    await page.locator('#crop-back-pdf').click();const card=page.locator('.visual-result-card').first();
    assert.match(await card.locator('.figure-metadata').innerText(),/誤差棒：SD（captionで確認）/);
    assert.match(await card.locator('.figure-unresolved').innerText(),/SDの数値：未確定/);assert.match(await card.innerText(),/FYB201：約69 ETDRS letters/);assert.match(await card.innerText(),/Reference ranibizumab：約68 ETDRS letters/);
    assert.doesNotMatch(await card.innerText(),/SD不明|解析集団の確認が必要/);
    await card.getByRole('button',{name:'承認',exact:true}).click();assert.match(await card.innerText(),/図からの推定・要確認/);assert.match(await page.locator('#review-summary').innerText(),/解析投入可 0.*要確認 1/);
    await card.scrollIntoViewIfNeeded();await card.screenshot({path:path.join(out,'phase321-figure-card.png')});
    await card.getByRole('button',{name:'選択範囲を見る'}).click();await page.locator('#pdf-page-5 .manual-selection').waitFor({state:'visible'});
    const originalRect=await page.locator('#pdf-page-5 .manual-selection').getAttribute('style');
    await call('dataex_prepare_selection_for_ai',{selectionId:c.selectionId});assert.equal((await call('dataex_set_selection_result',figure)).summaryCounts.total,1);
    await page.locator('#crop-back-pdf').click();assert.match(await card.locator('.review-state').innerText(),/承認済み/);
    passed.push('Holz Figure 2: approximately 69 / 68; SD and population directly verified; timepoint n and SD values null; CANDIDATE_ONLY / REVIEW after approval and retry');
    await page.reload();await ready();assert.equal(await card.getByRole('button',{name:'選択範囲を見る'}).isDisabled(),true);assert.match(await card.locator('.figure-metadata').innerText(),/誤差棒：SD（captionで確認）/);
    await load();await card.getByRole('button',{name:'選択範囲を見る'}).click();await page.locator('#pdf-page-5 .manual-selection').waitFor({state:'visible'});assert.equal(await page.locator('#pdf-page-5 .manual-selection').getAttribute('style'),originalRect);assert.equal(await page.evaluate(()=>window.DataExSelection.getActiveCropBlob()),null);
    passed.push('Metadata persists; source returns to same rectangle after PDF reload; no crop image persisted');
    const tableName='Change in BCVA from baseline to 8 to 12 weeks';await conditions(tableName,'week 8');const tc=await select({x:.065,y:.062,width:.88,height:.263});
    const table={selectionId:tc.selectionId,sourceKind:'TABLE_DIRECT',resultStatus:'READY',outcomes:[{outcome:tableName,timepoint:'week 8',population:'US-relevant population, full analysis set; assessed patients',unit:'ETDRS letters',analysisUnit:'participant',variableType:'continuous',arms:[arm('FYB201',5.1,7.52,228),arm('Reference ranibizumab',5.6,8.63,233)],directVisibleValues:['Mean change from baseline, ETDRS letters (SD): 5.1 (7.52), 5.6 (8.63)','Patients with assessment: 228, 233'],derivedValues:[],approximate:false,reason:'Table 2 raw mean/SD and assessed patient n; adjusted estimates excluded.',reviewFlags:[]}],visualAudit:{valuesClearlyVisible:true,labelsClearlyVisible:true,unitsClearlyVisible:true,timepointClearlyVisible:true,uncertaintyTypeClearlyVisible:true,notes:'Table 2 raw values, week 8, and population visually checked.'}};
    result=await call('dataex_set_selection_result',table);assert.equal(result.ok,true,JSON.stringify(result));assert.equal(result.outcomes[0].status,'READY');assert.equal(result.outcomes[0].analysisAction,'USE');assert.deepEqual(result.summaryCounts,{use:1,review:1,doNotUse:0,total:2});
    await page.locator('#crop-back-pdf').click();const tableCard=page.locator('.visual-result-card').last();assert.match(await tableCard.innerText(),/Mean 5.1 \/ SD 7.52 \/ n 228/);assert.match(await tableCard.innerText(),/Mean 5.6 \/ SD 8.63 \/ n 233/);assert.equal(await tableCard.locator('.figure-metadata').count(),0);
    await tableCard.scrollIntoViewIfNeeded();await tableCard.screenshot({path:path.join(out,'phase321-table-card.png')});
    passed.push('Table 2 unchanged: 5.1 / SD 7.52 / n 228 and 5.6 / SD 8.63 / n 233; TABLE_DIRECT / READY');
    // Synthetic manual edit in this isolated browser only: verify that numeric estimates
    // remain separate from directly confirmed caption metadata and can be corrected.
    await card.getByRole('button',{name:'修正',exact:true}).click();
    await card.locator('.correction-editor input').nth(3).fill('7');
    await card.getByLabel('誤差の数値の確認',{exact:true}).first().selectOption('VISUALLY_ESTIMATED');
    await card.getByRole('textbox',{name:'修正理由',exact:true}).fill('Synthetic UI regression edit, not a reported SD from this paper.');
    await card.getByRole('button',{name:'修正を保存',exact:true}).click();
    assert.match(await card.locator('.review-state').innerText(),/修正済み/);
    assert.match(await card.locator('.figure-numeric-values').innerText(),/SDの数値：約7（図からの概算）/);
    assert.doesNotMatch(await card.locator('.figure-metadata').innerText(),/数値：約7/);
    assert.match(await card.locator('.figure-metadata').innerText(),/誤差棒：SD（captionで確認）/);
    assert.match(await page.locator('#review-summary').innerText(),/解析投入可 1.*要確認 1/);
    passed.push('Manual uncertainty correction remains a separate estimate, preserves metadata and REVIEW status');
    assert.deepEqual(errors,[]);assert.deepEqual(uploads,[]);passed.push('10 site tools, zero console errors, no uploads');
    fs.writeFileSync(path.join(out,'phase321-figure-fixture.json'),JSON.stringify(figure,null,2));
    fs.writeFileSync(path.join(out,'phase321-test-result.json'),JSON.stringify({passed,figure:f,consoleErrors:errors,nonGetRequests:uploads},null,2));passed.forEach(x=>console.log('PASS '+x));
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
