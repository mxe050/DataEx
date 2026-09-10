const {chromium}=require(process.env.DATAEX_PLAYWRIGHT_MODULE || 'playwright');
const fs=require('fs');const assert=require('assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1400,height:950}});const errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.addInitScript(()=>{window.registeredTools={};Object.defineProperty(document,'modelContext',{value:{registerTool(t){window.registeredTools[t.name]=t;}}});});
 await page.goto((process.env.DATAEX_URL || 'http://127.0.0.1:8766/dataex-chatgpt.html'));await page.waitForFunction(()=>Object.keys(window.registeredTools).length===10);
 const call=async(name,args={})=>{const r=await page.evaluate(async({name,args})=>window.registeredTools[name].execute(args),{name,args});if(r.isError)throw Error(r.error);return r;};
 const load=async file=>{await page.locator('#pdf-file').setInputFiles((process.env.DATAEX_PDF_DIR || __dirname)+'/'+file);await page.waitForFunction(()=>document.querySelector('#pdf-status').textContent.startsWith('✓'));};
 const names=['Clinically significant pain relief: VAS decrease ≥20 mm','Any rescue medication','Any adverse effect'];
 const conditions=async()=>{await page.locator('#outcomes').fill(names.join('\n'));await page.locator('#intervention').fill('Ketamine');await page.locator('#comparator').fill('Placebo');await page.locator('#timepoint').fill('study-reported relevant timepoint');};
 const audit={searchComplete:false,queries:[],pagesChecked:[],sectionsChecked:[],notes:null};
 const source=(page,text,query,use='numerator')=>({use,page,printedPage:null,section:'Results',tableFigure:null,row:null,column:null,evidenceText:text,focusQuery:query,verification:'SOURCE_VERIFIED_TEXT'});
 const arm=(name,n,d)=>({name,valueText:n==null?'':`${n} / ${d}`,numerator:n,denominator:d,mean:null,sd:null,se:null});
 const outcome=(i,status,arms,sources)=>({outcome:names[i],compatibility:'EXACT',requestedValue:names[i],relatedEvidence:[],reason:'原著Resultsで確認。',analysisAction:status==='READY'?'USE':'REVIEW',searchAudit:structuredClone(audit),timepoint:'ED study period',population:'reported analysis population',analysisUnit:'participant',variableType:'binary',status,arms,effect:null,derivation:null,sources,note:null,reviewFlags:[]});
 await load('Lumanauw 2019.pdf');await conditions();
 assert.equal((await call('dataex_get_state')).pageCount,8);assert.equal((await call('dataex_get_extraction_brief')).conciseProtocol.length,12);await call('dataex_get_document_map');
 const lp5=(await call('dataex_get_page_text',{page:5})).normalizedText,lp6=(await call('dataex_get_page_text',{page:6})).normalizedText;
 const sentence=(text,start,end)=>{const a=text.indexOf(start),b=text.indexOf(end,a);assert.ok(a>=0&&b>a);return text.slice(a,b);};
 const pain=sentence(lp5,'Both keta- mine groups','Survival analysis');const rescue=sentence(lp6,'Rescue medi- cations','Rescue med- ications');const ae=sentence(lp5,'Twelve subjects','Three subjects');
 const ns=['Ketamine 0.5 mg/kg','Ketamine 0.25 mg/kg','Placebo'],ds=[30,35,32];
 const lumanauw={study:'Lumanauw 2019 — independent regression',summaryStatus:'PARTIAL',outcomes:[outcome(0,'READY',[25,28,13].map((n,i)=>arm(ns[i],n,ds[i])),[source(5,pain,'25 of 30')]),outcome(1,'READY',[7,12,17].map((n,i)=>arm(ns[i],n,ds[i])),[source(6,rescue,'seven subjects'),source(5,pain,'25 of 30','denominator')]),outcome(2,'CANDIDATE_ONLY',[12,14,1].map((n,i)=>arm(ns[i],n,ds[i])),[source(5,ae,'Twelve subjects')])],unresolved:[]};
 lumanauw.outcomes[2].reason='完遂者の集計であり、有害事象による中止者と安全性集団の扱いを要確認。';
 const lr=await call('dataex_set_results',lumanauw);assert.equal(lr.ready,2);assert.equal(lr.needsReview,1);
 const match=(await call('dataex_search_pdf',{query:'25 of 30',pageStart:5,maxResults:2})).results[0];await call('dataex_focus_evidence',{page:match.page,query:'25 of 30'});
 assert.ok(await page.locator('.bbox-highlight,.highlight-hook').count());
 const cards=page.locator('.result-card');await cards.nth(0).getByRole('button',{name:'承認',exact:true}).click();assert.match(await cards.nth(0).innerText(),/確認状態：承認済み/);assert.match(await cards.nth(0).innerText(),/解析投入可/);
 await page.reload();await page.waitForFunction(()=>Object.keys(window.registeredTools).length===10);assert.match(await page.locator('#review-summary').innerText(),/解析投入可 2/);assert.ok(await page.locator('.result-card').nth(0).getByRole('button',{name:'原著を見る',exact:true}).isDisabled());
 await load('Lumanauw 2019.pdf');await page.waitForFunction(()=>!document.querySelector('.review-actions button').disabled);assert.equal(await page.locator('.result-card').nth(0).getByRole('button',{name:'原著を見る',exact:true}).isEnabled(),true);
 console.log('PASS Lumanauw READY/READY/CANDIDATE_ONLY, detailed anchors, yellow highlight, restore, independent review');
 await load('sigtermans2009.pdf');await conditions();await call('dataex_get_extraction_brief');await call('dataex_get_document_map',{keywords:['rescue','medication','side effects','pain']});
 const queries=['Any rescue medication','rescue','medication','analgesic','additional'];for(const query of queries)await call('dataex_search_pdf',{query,maxResults:8});
 const texts={};for(const p of [2,3,4,5,6])texts[p]=(await call('dataex_get_page_text',{page:p,maxChars:16000})).normalizedText;
 const rel=(label,page,text,query)=>({label,valueText:null,page,section:'Methods / Results',evidenceText:text,focusQuery:query});
 const sig={study:'Sigtermans 2009 — independent regression',summaryStatus:'PARTIAL',outcomes:[outcome(0,'NEEDS_REVIEW',[],[]),outcome(1,'NOT_FOUND',[],[]),outcome(2,'NOT_DERIVABLE',[],[])],unresolved:[]};
 for(const o of sig.outcomes){o.timepoint='治療週〜12週間（指定値の時点は未報告）';o.population='CRPS-1、無作為割付各30人';} sig.outcomes[2].timepoint='盲検薬剤注入中';
 Object.assign(sig.outcomes[0],{compatibility:'RELATED_ONLY',reason:'NRS平均値からVAS ≥20 mm改善の参加者数は再構成できません。',relatedEvidence:[rel('Pain NRS — continuous outcome',3,sentence(texts[3],'Pain scores were','Secondary outcomes'),'numerical rating scale')]});
 Object.assign(sig.outcomes[1],{compatibility:'NONE',reason:'探索途中では救済薬の群別使用人数が見つかっていません。'});
 Object.assign(sig.outcomes[2],{compatibility:'RELATED_ONLY',reason:'種類別の有害事象割合はありますが、重複を除いた参加者数は算出できません。',relatedEvidence:[rel('Specific adverse effects',5,sentence(texts[5],'During drug infusion','Liver functions'),'psychomimetic effects 93%')]});
 let sr=await call('dataex_set_results',sig);assert.deepEqual(sr.completeness.map(x=>x.code),['NOT_DERIVABLE','NOT_FOUND','NOT_DERIVABLE']);assert.equal(sr.needsReview,0);assert.equal(sr.doNotUse,3);
 Object.assign(sig.outcomes[1],{status:'NOT_REPORTED',reason:'Methods、Results、Table 1・2を確認しましたが、救済薬の群別参加者数は報告されていません。併用薬一定の記述は使用0件の根拠にはできません。',searchAudit:{searchComplete:true,queries,pagesChecked:[2,3,4,5,6],sectionsChecked:['Methods','Results','Table 1','Table 2'],relatedTermsFound:['Pain co-medication','additional ketamine treatment'],notes:'短いRCTの関連Methods/Results/Tablesを確認。開盲後追加治療は救済薬人数と区別。'}});
 sr=await call('dataex_set_results',sig);assert.equal(sr.needsReview,0);assert.equal(sr.completeness[1].code,'NOT_REPORTED');assert.equal(await page.locator('.arm-row').count(),0);
 await page.locator('.result-card').nth(0).getByRole('button',{name:'関連する原著を見る'}).click();await page.locator('.bbox-highlight,.highlight-hook').first().waitFor();assert.ok(await page.locator('.bbox-highlight,.highlight-hook').count());
 await page.locator('.result-card').nth(0).getByRole('button',{name:'承認',exact:true}).click();assert.match(await page.locator('.result-card').nth(0).innerText(),/算出不可/);assert.match(await page.locator('.result-card').nth(0).innerText(),/確認状態：承認済み/);
 await page.screenshot({path:(process.env.DATAEX_ARTIFACT_DIR || __dirname)+'/phase26-sigtermans.png'});
 await page.reload();await page.waitForFunction(()=>Object.keys(window.registeredTools).length===10);await load('sigtermans2009.pdf');assert.match(await page.locator('#review-summary').innerText(),/要確認 0/);assert.match(await page.locator('.result-card').nth(1).innerText(),/報告なし/);
 assert.deepEqual(errors,[]);console.log('PASS Sigtermans RELATED_ONLY resolves NOT_DERIVABLE, NOT_FOUND and audited NOT_REPORTED distinct, no missing-value boxes, related highlight, reload, 10 tools, no console errors');
 fs.writeFileSync((process.env.DATAEX_ARTIFACT_DIR || __dirname)+'/phase26-browser-result.json',JSON.stringify({lumanauw:lr,sigtermans:sr,consoleErrors:errors},null,2));
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1);});







