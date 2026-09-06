// Run with DATAEX_URL, DATAEX_PDF_DIR and DATAEX_PLAYWRIGHT_MODULE as needed.
const {chromium}=require(process.env.DATAEX_PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {PDFDocument,StandardFonts}=require(process.env.DATAEX_PDFLIB_MODULE||'pdf-lib');
const assets=process.env.DATAEX_PDF_DIR||path.join(__dirname,'test-assets'),out=process.env.DATAEX_ARTIFACT_DIR||__dirname;
const passed=[],pass=s=>{passed.push(s);console.log('PASS '+s);};
const profileKey='dataex:review-profiles:v1';
(async()=>{
 const browser=await chromium.launch({headless:true});
 try {
  const page=await browser.newPage({viewport:{width:1450,height:1000}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.addInitScript(()=>{window.registeredTools={};Object.defineProperty(document,'modelContext',{value:{registerTool(t){window.registeredTools[t.name]=t;}}});});
  const ready=()=>page.waitForFunction(()=>Object.keys(window.registeredTools).length===7);
  await page.goto(process.env.DATAEX_URL||'http://127.0.0.1:8770/dataex-chatgpt.html');await ready();
  const call=(name,args={})=>page.evaluate(({name,args})=>window.registeredTools[name].execute(args),{name,args});
  const load=async file=>{await page.locator('#pdf-file').setInputFiles(file);await page.waitForFunction(()=>document.querySelector('#pdf-status').textContent.startsWith('✓'));};
  await load(path.join(assets,'Holz 2020.pdf'));
  const field=k=>page.locator('#profile-form [data-field="'+k+'"]');
  await page.locator('#profile-open').click();await field('profileName').fill('CRPS pain test');await field('reviewOutcomeName').fill('Pain intensity');await field('targetTime').fill('Post Wk 1–2');await page.locator('#profile-save').click();
  assert.equal((await call('dataex_get_extraction_brief')).profileConflict.hasConflict,false);
  await page.locator('#outcomes').fill('疼痛強度');await page.locator('#timepoint').fill('1–2 weeks');
  let brief=await call('dataex_get_extraction_brief');assert.equal(brief.profileConflict.hasConflict,false);assert.equal(brief.profileRulesApplied.outcomes.length,1);
  await page.locator('#intervention').fill('FYB201');await page.locator('#comparator').fill('Reference ranibizumab');assert.equal((await call('dataex_get_extraction_brief')).profileConflict.hasConflict,false);
  const names=['Serious ocular AE','BCVA 8–12 weeks','TEAEs leading to investigational product discontinuation OR death'];
  await page.locator('#outcomes').fill(names.join('\n'));await page.locator('#timepoint').fill('during study period');
  brief=await call('dataex_get_extraction_brief');assert.equal(brief.extractionBlocked,true);assert.equal(brief.profileConflict.resolved,false);assert.equal(brief.profileConflict.items.length,4);
  await page.getByRole('button',{name:'データ抽出',exact:true}).click();assert.equal(await page.locator('#profile-conflict-dialog').isVisible(),true);assert.equal(await page.locator('#request-guide').isVisible(),false);
  assert.equal(await page.locator('#profile-conflict-suppress').evaluate(e=>e===document.activeElement),true);
  await page.screenshot({path:path.join(out,'phase28-profile-conflict.png')});
  await page.locator('#profile-conflict-cancel').click();assert.equal(await page.locator('#profile-conflict-dialog').isVisible(),false);
  await page.getByRole('button',{name:'データ抽出',exact:true}).click();await page.locator('#profile-conflict-change').click();assert.equal(await page.locator('#profile-dialog').isVisible(),true);await page.locator('#profile-close').click();
  await page.getByRole('button',{name:'データ抽出',exact:true}).click();await page.locator('#profile-conflict-suppress').click();
  brief=await call('dataex_get_extraction_brief');assert.equal(brief.activeReviewProfile,null);assert.equal(brief.profileConflict.resolved,true);assert.equal(brief.profileSuppressed,true);assert.equal(brief.profileRulesApplied.outcomes.length,0);
  assert.match(await page.locator('#profile-bar').innerText(),/CRPS pain test（今回は未使用）/);
  const saved=await page.evaluate(k=>JSON.parse(localStorage.getItem(k)),profileKey);assert.equal(saved.profiles[0].profile.profileName,'CRPS pain test');assert.ok(saved.activeId);
  pass('Profile mismatch blocks submit and brief; cancel/change/suppress; aliases and group changes; profile preserved');
  const texts={};for(const n of [5,7,8])texts[n]=(await call('dataex_get_page_text',{page:n,maxChars:16000})).normalizedText;
  const excerpt=(n,start,end)=>{const text=texts[n],i=text.indexOf(start),j=text.indexOf(end,i+start.length);assert.ok(i>=0&&j>i,start);return text.slice(i,j).trim();};
  const source=(sourceId,use,page,evidenceText,focusQuery)=>({sourceId,use,page,evidenceText,focusQuery,printedPage:null,section:'Table '+(page===5?'2':'3'),tableFigure:null,row:null,column:null,verification:'SOURCE_VERIFIED_TEXT'});
  const n7=source('safety-n','denominator',7,excerpt(7,'Table 3.','TEAEs 154'),'238');
  const serious=source('ocular','numerator',7,excerpt(7,'Serious TEAEs 19','Systemic 17'),'Local, study eye 2');
  const bcva=source('raw-bcva','mean',5,excerpt(5,'Mean change from baseline, ETDRS letters (SD)','Median change'),'5.1 (7.52)');
  const n5=source('observed-n','denominator',5,excerpt(5,'Patients with assessment, no.','Patients missing'),'228');
  const withdrawal=source('withdrawal','numerator',7,excerpt(7,'TEAEs leading to withdrawal of study drug','Eye disorders'),'withdrawal of study drug');
  const death=source('death','numerator',7,excerpt(7,'Fatal TEAEs','Nonfatal serious'),'Fatal TEAEs');
  const definition=source('withdrawal-definition','definition',8,excerpt(8,'In addition, AEs led to permanent or temporary withdrawal','In the FYB201 group'),'permanent or temporary withdrawal');definition.section='Results';
  const arm=(name,numerator,denominator,mean=null,sd=null)=>({name,valueText:mean===null?`${numerator} / ${denominator}`:`mean ${mean}, SD ${sd}, n ${denominator}`,numerator,denominator,mean,sd,se:null});
  const outcome=(name,arms,sources)=>({outcome:name,timepoint:'up to week 48',population:'Safety analysis set',analysisUnit:'participant',variableType:'binary',status:'READY',compatibility:'EXACT',requestedValue:name,analysisAction:'USE',reason:'Direct author-reported values',arms,effect:null,derivation:null,sources,relatedEvidence:[],searchAudit:{searchComplete:false,queries:[],pagesChecked:[],sectionsChecked:[],notes:null},reviewFlags:[],note:null});
  const composite=outcome(names[2],[],[withdrawal,death,n7,definition]);Object.assign(composite,{status:'NOT_DERIVABLE',compatibility:'RELATED_ONLY',analysisAction:'DO_NOT_USE',reason:'直接unionは報告されず、withdrawalは一時中断を含み得る。重複も不明。',compositeAudit:{components:[{name:'TEAEs leading to withdrawal of study drug',countsByArm:[{arm:'FYB201',events:6,denominator:238},{arm:'Reference',events:6,denominator:239}],semanticCompatibility:'AMBIGUOUS',sourceRefs:['withdrawal','safety-n'],semanticSourceRefs:['withdrawal-definition']},{name:'Fatal TEAEs',countsByArm:[{arm:'FYB201',events:2,denominator:238},{arm:'Reference',events:1,denominator:239}],semanticCompatibility:'EXACT',sourceRefs:['death','safety-n']}],overlapStatus:'UNKNOWN',rangeAllowed:false,ranges:[],reason:'withdrawalは永久中止だけでなく一時中断を含む可能性があり意味が未確定。'}});
  const continuous=outcome(names[1],[arm('FYB201',null,228,5.1,7.52),arm('Reference',null,233,5.6,8.63)],[bcva,n5]);Object.assign(continuous,{variableType:'continuous',timepoint:'week 8',population:'US-relevant full analysis set, observed assessment',reason:'Table 2 raw arm-level mean/SD and observed n; ANCOVA LS mean/SE are not used.'});
  const payload={study:'Holz 2020',summaryStatus:'PARTIAL',outcomes:[outcome(names[0],[arm('FYB201',2,238),arm('Reference',3,239)],[serious,{...n7,sourceId:'ocular-n'}]),continuous,composite],unresolved:[]};
  let result=await call('dataex_set_results',payload);assert.ok(!result.isError,JSON.stringify(result));assert.deepEqual(result.summaryCounts,{use:2,review:0,doNotUse:1,total:3});assert.equal(result.summaryText,'DataExに3アウトカムを表示しました。解析投入可2件、解析投入不可1件です。');
  assert.match(await page.locator('#review-summary').innerText(),/3 outcomes.*解析投入可 2.*要確認 0.*解析投入しない 1/);assert.equal(await page.locator('.composite-range').count(),0);
  for(const name of ['承認','要確認','却下']){await page.locator('.result-card').first().getByRole('button',{name,exact:true}).click();assert.match(await page.locator('#review-summary').innerText(),/要確認 0/);}
  await page.locator('.composite-audit').getByRole('button').first().click();await page.waitForFunction(()=>document.querySelectorAll('.bbox-highlight,.highlight-hook').length>0);
  await page.screenshot({path:path.join(out,'phase28-holz.png')});fs.writeFileSync(path.join(out,'phase28-holz-fixture.json'),JSON.stringify(payload,null,2));
  pass('Holz real PDF: USE 2 / REVIEW 0 / DO_NOT_USE 1, exact summaryText, raw BCVA, semantic mismatch hides range, human states independent, highlight');
  const four=structuredClone(payload),review=structuredClone(payload.outcomes[0]);review.sources.forEach(s=>s.sourceId+='-review');review.outcome='Review choice';review.status='NEEDS_REVIEW';review.compatibility='AMBIGUOUS';review.reason='Two populations require a choice';four.outcomes.push(review);result=await call('dataex_set_results',four);assert.deepEqual(result.summaryCounts,{use:2,review:1,doNotUse:1,total:4});assert.equal(result.summaryText,'DataExに4アウトカムを表示しました。解析投入可2件、要確認1件、解析投入不可1件です。');
  four.outcomes.splice(2,1);result=await call('dataex_set_results',four);assert.equal(result.summaryText,'DataExに3アウトカムを表示しました。解析投入可2件、要確認1件です。');await call('dataex_set_results',payload);
  await page.reload();await ready();assert.match(await page.locator('#review-summary').innerText(),/要確認 0/);assert.match(await page.locator('#profile-bar').innerText(),/今回は未使用/);await load(path.join(assets,'Holz 2020.pdf'));assert.equal((await call('dataex_get_extraction_brief')).profileSuppressed,true);
  pass('Summary wording for review-only and mixed counts; result and suppressed context survive reload');
  // Synthetic, explicitly compatible components test the safe branch without inventing Holz evidence.
  const pdf=await PDFDocument.create(),font=await pdf.embedFont(StandardFonts.Helvetica),sheet=pdf.addPage([612,792]);
  const lines=['Synthetic union test. Study Test, safety population, week 48.','A means permanent discontinuation. B means death.','A FYB201 events 6 N 238. A Reference events 6 N 239.','B FYB201 events 2 N 238. B Reference events 1 N 239.'];
  lines.forEach((text,i)=>sheet.drawText(text,{x:30,y:730-i*30,size:12,font}));const synthetic=path.join(out,'phase28-synthetic.pdf');fs.writeFileSync(synthetic,await pdf.save());await load(synthetic);
  assert.equal((await call('dataex_get_extraction_brief')).profileSuppressed,false); // next PDF restores active profile
  await page.locator('#profile-open').click();await page.locator('#profile-off').click();await page.locator('#outcomes').fill('A OR B');await page.locator('#timepoint').fill('week 48');
  const references=[];for(const comp of ['A','B'])for(const [i,name]of ['FYB201','Reference'].entries())for(const use of ['numerator','denominator']){const s=source(comp+'-'+name+'-'+use,use,1,lines[comp==='A'?2:3],comp+' '+name);s.context={study:'Test',arms:[name],measure:comp,timepoint:'week 48',population:'Safety',scope:'TARGET_TIMEPOINT',seriesId:'',statistic:'OBSERVED',nBasis:'OUTCOME_OBSERVED'};references.push(s);}
  const def=source('definition','definition',1,lines[1],'A means');references.push(def);
  const value=outcome('A OR B',[],references);Object.assign(value,{population:'Safety',timepoint:'week 48',status:'NOT_DERIVABLE',compatibility:'RELATED_ONLY',analysisAction:'DO_NOT_USE',reason:'Overlap only is unknown.',compositeAudit:{components:['A','B'].map(comp=>({name:comp,countsByArm:['FYB201','Reference'].map((arm,i)=>({arm,events:comp==='A'?6:i?1:2,denominator:i?239:238})),semanticCompatibility:'EXACT',sourceRefs:references.filter(s=>s.sourceId.startsWith(comp+'-')).map(s=>s.sourceId),study:'Test',analysisUnit:'participant',population:'Safety',timeWindow:'week 48',semanticReason:'A is permanent discontinuation and B is death by the explicit definition.',semanticSourceRefs:['definition']})),overlapStatus:'UNKNOWN',rangeAllowed:true,ranges:[{arm:'FYB201',lower:99,upper:100,denominator:238}],reason:'Direct union is not reported; only participant overlap is unknown.'}});
  const union={study:'Test',summaryStatus:'PARTIAL',outcomes:[value],unresolved:[]};result=await call('dataex_set_results',union);assert.ok(!result.isError,JSON.stringify(result));assert.deepEqual(result.summaryCounts,{use:0,review:0,doNotUse:1,total:1});assert.deepEqual(await page.locator('.composite-range').allTextContents(),['FYB201: 6–8 / 238','Reference: 6–7 / 239']);
  await page.screenshot({path:path.join(out,'phase28-safe-range.png')});
  const bad=async(name,mutate)=>{const p=structuredClone(union);mutate(p.outcomes[0]);const r=await call('dataex_set_results',p);assert.equal(r.isError,true,name+JSON.stringify(r));};
  await bad('different denominators',o=>o.compositeAudit.components[1].countsByArm[0].denominator=237);
  await bad('episodes',o=>o.compositeAudit.components[0].analysisUnit='episode');
  await bad('other study',o=>o.compositeAudit.components[0].study='Other');
  await bad('other time',o=>o.compositeAudit.components[0].timeWindow='week 12');
  await bad('other population',o=>o.compositeAudit.components[0].population='ITT');
  await bad('unverified counts',o=>o.sources[0].verification='UNRESOLVED');
  await bad('no semantic anchor',o=>delete o.compositeAudit.components[0].semanticSourceRefs);
  await bad('READY promotion',o=>{o.status='READY';o.compatibility='EXACT';o.analysisAction='USE';o.arms=[arm('FYB201',8,238)];});
  await bad('point estimate copied',o=>o.arms=[arm('FYB201',8,238)]);
  const ambiguous=structuredClone(union);ambiguous.outcomes[0].compositeAudit.components[0].semanticCompatibility='AMBIGUOUS';result=await call('dataex_set_results',ambiguous);assert.ok(!result.isError);assert.equal(await page.locator('.composite-range').count(),0);
  const stored=await page.evaluate(()=>JSON.parse(localStorage.getItem(localStorage.getItem('dataex:phase2.5:latest'))));assert.equal(stored.results.outcomes[0].compositeAudit.rangeAllowed,false);assert.deepEqual(stored.results.outcomes[0].compositeAudit.ranges,[]);
  pass('Compatible synthetic union ranges recomputed; unit/N/context/verification/promotion gates; ambiguous range cleared');
  assert.deepEqual(errors,[]);pass('7 tools and no console errors');fs.writeFileSync(path.join(out,'phase28-test-result.json'),JSON.stringify({passed,consoleErrors:errors},null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
