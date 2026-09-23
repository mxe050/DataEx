'use strict';
const {chromium}=require('playwright'),{PDFDocument,StandardFonts}=require('pdf-lib');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const source=process.env.DATAEX_SOURCE_DIR||__dirname,repo=process.env.DATAEX_REPO_DIR||__dirname;
const url='http://127.0.0.1:8766/dataex-chatgpt.html',out=process.env.DATAEX_ARTIFACT_DIR||path.join(__dirname,'test-artifacts');
const {fixture}=require(path.join(repo,'dataex-fuzzy-fixture.cjs'));
fs.mkdirSync(out,{recursive:true});
(async()=>{
 const browser=await chromium.launch({headless:true}),context=await browser.newContext(),page=await context.newPage(),passes=[],errors=[];
 const pass=name=>{passes.push(name);console.log('PASS '+name);};
 try {
  const values=new Map(),makeCache=require('./dataex-fuzzy-cache.js');let denyLocal=false;
  const noDatabase=makeCache({indexedDB:{open(){throw Error('Test IndexedDB unavailable');}},localStorage:{getItem:k=>values.get(k)||null,setItem(k,v){if(denyLocal)throw Error('Test localStorage unavailable');values.set(k,v);}}});
  await noDatabase.writeSnapshot('saved','latest',{keep:1});assert.deepEqual(await noDatabase.readSnapshot('latest'),{keep:1});pass('Unavailable IndexedDB does not break working legacy storage');
  denyLocal=true;await assert.rejects(noDatabase.writeSnapshot('failed','latest',{keep:999}));assert.deepEqual(await noDatabase.readSnapshot('latest'),{keep:1});pass('Both backends failing rejects without discarding the previous snapshot');
  await context.route('http://127.0.0.1:8766/**',route=>{const name=decodeURIComponent(new URL(route.request().url()).pathname).slice(1),file=path.join(source,name);if(!name.includes('..')&&fs.existsSync(file)&&fs.statSync(file).isFile())return route.fulfill({contentType:name.endsWith('.html')?'text/html; charset=utf-8':'text/javascript; charset=utf-8',body:fs.readFileSync(file)});return route.continue();});
  await page.addInitScript(()=>{window.registeredTools={};Object.defineProperty(document,'modelContext',{value:{registerTool(t){window.registeredTools[t.name]=t;}}});const set=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(window.storageFailurePrefix&&k.startsWith(window.storageFailurePrefix))throw new DOMException('Forced test quota failure','QuotaExceededError');if(k===window.pointerFailureKey)throw new DOMException('Forced pointer failure','QuotaExceededError');return set.call(this,k,v);};});
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(url);await page.waitForFunction(()=>window.DataExFuzzyCache&&window.DataExFuzzy);
  const first=await page.evaluate(async()=>{
   const cache=DataExFuzzyCache,value={schemaVersion:1,study:{raw:{requestId:'one',rawValues:[{id:'A',statistics:{mean:.92,se:.4821517}}]}},visual:[{id:'visual1',note:'preserve crop metadata'}],context:{reviewName:'A'}};
   const regular=await cache.writeSnapshot('cache-normal:req1','cache-normal:latest',value);
   const normal=await cache.readSnapshot('cache-normal:latest');
   localStorage.setItem('cache-test:req-old',JSON.stringify({old:true}));localStorage.setItem('cache-test:latest',JSON.stringify({key:'cache-test:req-old'}));
   window.storageFailurePrefix='cache-test:';
   const fallback=await cache.writeSnapshot('cache-test:req1','cache-test:latest',value);
   const exact=await cache.readSnapshot('cache-test:latest');
   return {regular,normal,fallback,exact,value,old:localStorage.getItem('cache-test:req-old'),oldPointer:localStorage.getItem('cache-test:latest')};
  });
  assert.equal(first.regular.backend,'localStorage');assert.deepEqual(first.normal,first.value);pass('Normal localStorage write/read stays compatible');
  assert.equal(first.fallback.backend,'IndexedDB');assert.deepEqual(first.exact,first.value);assert.equal(first.old,'{"old":true}');assert.equal(first.oldPointer,'{"key":"cache-test:req-old"}');pass('Quota failure saves exact Raw/visual/context without evicting legacy data');
  await page.reload();await page.waitForFunction(()=>window.DataExFuzzyCache&&window.DataExFuzzy);assert.deepEqual(await page.evaluate(()=>DataExFuzzyCache.readSnapshot('cache-test:latest')),first.value);pass('Cold page reload restores the fallback snapshot');
  const multi=await page.evaluate(async()=>{
   const c=DataExFuzzyCache;
   await c.writeSnapshot('cache-test:req2','cache-test:latest',{version:2,visual:[{id:'new visual'}]});
   await c.writeSnapshot('cache-review-b:req1','cache-review-b:latest',{review:'B'});
   await c.writeSnapshot('cache-test:req2','cache-test:latest',{version:3,visual:[{id:'updated visual'}]});
   return {a:await c.readSnapshot('cache-test:latest'),b:await c.readSnapshot('cache-review-b:latest'),legacyPointer:localStorage.getItem('cache-test:latest')};
  });
  assert.deepEqual(multi.a,{version:3,visual:[{id:'updated visual'}]});assert.deepEqual(multi.b,{review:'B'});assert.equal(multi.legacyPointer,first.oldPointer);pass('Fallback remains authoritative for later requests/visual updates and isolates reviews');
  const pointer=await page.evaluate(async()=>{localStorage.setItem('cache-pointer:latest',JSON.stringify({key:'cache-pointer:old'}));localStorage.setItem('cache-pointer:old',JSON.stringify({version:0}));window.pointerFailureKey='cache-pointer:latest';const result=await DataExFuzzyCache.writeSnapshot('cache-pointer:new','cache-pointer:latest',{version:1});return{result,saved:await DataExFuzzyCache.readSnapshot('cache-pointer:latest'),old:localStorage.getItem('cache-pointer:old')};});
  assert.equal(pointer.result.backend,'IndexedDB');assert.equal(pointer.saved.version,1);assert.equal(pointer.old,'{"version":0}');pass('A latest-pointer failure falls back atomically while retaining the prior request');
  const aborted=await page.evaluate(async()=>{const put=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(record){if(record.key==='cache-test:latest')throw new DOMException('Forced transaction abort','QuotaExceededError');return put.call(this,record);};let rejected=false;try{await DataExFuzzyCache.writeSnapshot('cache-test:abort','cache-test:latest',{version:999});}catch(_){rejected=true;}finally{IDBObjectStore.prototype.put=put;}return{rejected,saved:await DataExFuzzyCache.readSnapshot('cache-test:latest')};});
  assert.equal(aborted.rejected,true);assert.equal(aborted.saved.version,3);pass('Failed IndexedDB transaction rejects and leaves the previous snapshot/pointer intact');
  const large=await page.evaluate(async()=>{window.storageFailurePrefix='cache-large:';await DataExFuzzyCache.writeSnapshot('cache-large:req','cache-large:latest',{text:'x'.repeat(4100001)});return(await DataExFuzzyCache.readSnapshot('cache-large:latest')).text.length;});assert.equal(large,4100001);pass('Fallback snapshot larger than the legacy read cap is restored without truncation');
  const payload=fixture(),pdf=await PDFDocument.create(),font=await pdf.embedFont(StandardFonts.Helvetica),sheet=pdf.addPage([1250,950]);payload.sources.forEach((s,i)=>sheet.drawText(s.evidenceText,{x:25,y:900-i*52,size:8,font}));const pdfFile=path.join(out,'fuzzy-fixture.pdf');fs.writeFileSync(pdfFile,await pdf.save());
  await page.locator('#pdf-file').setInputFiles(pdfFile);await page.waitForFunction(()=>DataExFuzzy.brief().pdfLoaded);
  await page.evaluate(()=>{window.storageFailurePrefix='dataex:fuzzy:v1:study:';});
  const response=await page.evaluate(async payload=>{const b=DataExFuzzy.brief();return registeredTools.dataex_set_results.execute({...payload,requestId:b.requestId,pdfId:b.pdfId});},payload);
  assert.equal(response.ok,true,JSON.stringify(response));await page.waitForFunction(()=>document.querySelector('#storage-message').textContent.includes('データベースに保存'));
  const before=await page.evaluate(()=>DataExFuzzy.snapshot().raw);assert.equal(before.rawValues.length,payload.rawValues.length);assert.doesNotMatch(await page.locator('#storage-message').innerText(),/保存できません/);pass('Full app submission reports successful fallback instead of the generic storage error');
  await page.reload();await page.waitForFunction(()=>DataExFuzzy&&DataExReview);await page.locator('#pdf-file').setInputFiles(pdfFile);await page.waitForFunction(()=>DataExFuzzy.brief().pdfLoaded&&DataExFuzzy.snapshot());assert.deepEqual(await page.evaluate(()=>DataExFuzzy.snapshot().raw),before);pass('App reload + same-PDF reconnect restores every Raw value/source unchanged');
  const highlights=await page.evaluate(async()=>{const s=DataExFuzzy.snapshot().raw.sources[0];return registeredTools.dataex_focus_evidence.execute({page:s.pdfPage,query:s.evidenceText.slice(0,180)});});assert.equal(highlights.ok,true);assert.ok(await page.locator('.bbox-highlight').count());pass('PDF source navigation/yellow highlight still works after recovery');
  assert.deepEqual(errors,[]);pass('No JavaScript page errors');
  fs.writeFileSync(path.join(out,'storage-result.json'),JSON.stringify({url,passes,errors},null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
