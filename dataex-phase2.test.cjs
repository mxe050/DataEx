const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
class NodeStub {
  constructor() { this.children=[]; this.dataset={}; this.value=''; this.listeners={}; this.classList={toggle(){}}; }
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this.children=nodes; }
  addEventListener(name, listener) {this.listeners[name]=listener;}
  click() {return this.listeners.click?.();}
  setAttribute() {}
  scrollIntoView() {}
  querySelector() { return new NodeStub(); }
}
const nodes = new Map(); const $ = id => { if(!nodes.has(id)) nodes.set(id,new NodeStub()); return nodes.get(id); };
const raw = 'RESULTS Value 0 of 10. A reported result and its denominator. ';
const normalize = s => s.normalize('NFKC').toLowerCase().replace(/\s/g,'');
const state = {pdf:{numPages:12},generation:1};
const data = {raw:raw.repeat(400),normalized:normalize(raw.repeat(400)),textContent:{items:[{str:'RESULTS'},{str:'Table 1 title'}]},spans:[{id:'s1',start:0,end:7}]};
const storage=new Map();
const context = {window:{addEventListener(){},localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)}},document:{createElement:()=>new NodeStub()},structuredClone,console,navigator:{clipboard:{writeText:async()=>{}}}};
vm.runInNewContext(fs.readFileSync(__dirname+'/dataex-extraction.js','utf8'),context);
const deps = {$,state,getState:()=>({outcomes:['Value'], intervention:'', comparator:'', timepoint:''}),pageData:async()=>data,pageNumber:n=>{if(!Number.isInteger(n)||n<1||n>12)throw Error('range');},checkReady:()=>{},checkGeneration:g=>{if(g!==state.generation)throw Error('stale');},normalize,focusEvidence:async()=>{},tool:(name,description,inputSchema,execute)=>({name,execute}),schema:(properties,required=[])=>({type:'object',properties,required,additionalProperties:false}),message:()=>{}};
const extraction = context.window.createDataExExtraction(deps);
const call=(name,args)=>extraction.tools.find(t=>t.name===name).execute(args);
const arm={name:'Test arm',valueText:'0 / 10',numerator:0,denominator:10,mean:null,sd:null,se:null};
const source={use:'numerator',page:1,printedPage:null,section:'Results',tableFigure:null,row:null,column:null,evidenceText:'Value 0 of 10.',focusQuery:'0 of 10',verification:'SOURCE_VERIFIED_TEXT'};
const base={study:'Unit fixture',summaryStatus:'READY',outcomes:[{outcome:'Value',compatibility:'EXACT',requestedValue:'Value count',relatedEvidence:[],reason:'Direct reported value',analysisAction:'USE',searchAudit:{searchComplete:false,queries:[],pagesChecked:[],sectionsChecked:[],notes:null},timepoint:'week 1',population:'randomized',analysisUnit:'participant',variableType:'binary',status:'READY',arms:[arm],effect:null,derivation:null,sources:[source],note:null,reviewFlags:[]}],unresolved:[]};
(async()=>{
  assert.equal((await call('dataex_set_results',base)).ready,1);
  console.log('PASS zero event remains valid');
  for(const [name,change] of [
    ['NaN',x=>x.outcomes[0].arms[0].numerator=NaN],
    ['Infinity',x=>x.outcomes[0].arms[0].mean=Infinity],
    ['negative N',x=>x.outcomes[0].arms[0].denominator=-1],
    ['events>N',x=>x.outcomes[0].arms[0].numerator=11],
    ['missing source',x=>x.outcomes[0].sources=[]],
    ['fake citation',x=>x.outcomes[0].sources[0].evidenceText='Invented citation'],
    ['source query mismatch',x=>x.outcomes[0].sources[0].focusQuery='unrelated'],
    ['unresolved READY',x=>x.outcomes[0].sources[0].verification='UNRESOLVED'],
    ['wrong page',x=>x.outcomes[0].sources[0].page=13],
    ['summary mismatch',x=>x.outcomes[0].status='NOT_FOUND']
  ]) {const bad=structuredClone(base);change(bad);await assert.rejects(()=>call('dataex_set_results',bad));console.log('PASS rejects '+name);}
  for(const status of ['NOT_FOUND','NOT_DERIVABLE','NEEDS_VISUAL_REVIEW']) {
    const value=structuredClone(base);value.summaryStatus='NEEDS_REVIEW';value.outcomes[0].status=status;value.outcomes[0].sources=[];value.outcomes[0].arms=[];value.outcomes[0].compatibility=status==='NOT_DERIVABLE'?'RELATED_ONLY':status==='NOT_FOUND'?'NONE':'AMBIGUOUS';
    assert.equal((await call('dataex_set_results',value)).needsReview,status==='NEEDS_VISUAL_REVIEW'?1:0);
  }
  console.log('PASS unavailable states are not review counts');
  const missing=structuredClone(base);Object.assign(missing.outcomes[0],{status:'NOT_REPORTED',compatibility:'NONE',arms:[],sources:[],analysisAction:'DO_NOT_USE'});missing.summaryStatus='PARTIAL';
  await assert.rejects(()=>call('dataex_set_results',missing),/searchComplete/);
  Object.assign(missing.outcomes[0].searchAudit,{searchComplete:true,queries:['Value','count'],pagesChecked:[1],sectionsChecked:['Results']});
  await assert.rejects(()=>call('dataex_set_results',missing),/未完了/);
  await call('dataex_get_document_map',{});extraction.recordSearch('Value');extraction.recordSearch('count');await call('dataex_get_page_text',{page:1,maxChars:16000});
  // Truncated reads cannot attest complete page coverage.
  await assert.rejects(()=>call('dataex_set_results',missing),/未完了/);
  const previousRaw=data.raw;data.raw=raw;await call('dataex_get_page_text',{page:1,maxChars:16000});data.raw=previousRaw;
  assert.equal((await call('dataex_set_results',missing)).doNotUse,1);
  missing.outcomes[0].status='NOT_FOUND';assert.equal((await call('dataex_set_results',missing)).completeness[0].code,'NOT_FOUND');
  const related=structuredClone(base);related.summaryStatus='PARTIAL';Object.assign(related.outcomes[0],{status:'NEEDS_REVIEW',compatibility:'RELATED_ONLY',reason:'平均値から人数は再構成できません。',relatedEvidence:[{label:'continuous result',valueText:'reported mean',page:1,section:'Results',evidenceText:source.evidenceText,focusQuery:source.focusQuery}]});
  assert.equal((await call('dataex_set_results',related)).doNotUse,1);
  assert.equal((await call('dataex_set_results',related)).completeness[0].code,'NOT_DERIVABLE');
  const fake=structuredClone(related);fake.outcomes[0].relatedEvidence[0].evidenceText='Invented';await assert.rejects(()=>call('dataex_set_results',fake));
  const choice=structuredClone(base);choice.summaryStatus='PARTIAL';Object.assign(choice.outcomes[0],{status:'NEEDS_REVIEW',compatibility:'AMBIGUOUS',reason:''});await assert.rejects(()=>call('dataex_set_results',choice),/理由/);
  choice.outcomes[0].reason='ITT and PP candidates change the value';assert.equal((await call('dataex_set_results',choice)).needsReview,1);
  const noCandidate=structuredClone(choice);Object.assign(noCandidate.outcomes[0],{status:'CANDIDATE_ONLY',arms:[]});await assert.rejects(()=>call('dataex_set_results',noCandidate),/候補値/);
  state.generation++;missing.outcomes[0].status='NOT_REPORTED';await assert.rejects(()=>call('dataex_set_results',missing),/未完了/);
  console.log('PASS sufficiency gate, generation isolation, no implicit promotion, related-only resolution, candidate and conflict validation');
  const map=await call('dataex_get_document_map',{});
  assert.equal(map.pages.length,8);assert.ok(map.pages.some(p=>p.page===1)&&map.pages.some(p=>p.page===12));assert.ok(map.pages.every(p=>JSON.stringify(p).length<500));
  state.pdf.numPages=8;const short=await call('dataex_get_document_map',{});assert.equal(short.pages.length,8);
  console.log('PASS bounded long map and all short-document pages');
  const page=await call('dataex_get_page_text',{page:1,maxChars:100});assert.equal(page.normalizedText.length,100);assert.equal(page.truncated,true);
  await assert.rejects(()=>call('dataex_get_page_text',{page:1,maxChars:16001}));
  assert.equal(call('dataex_get_extraction_brief',{}).conciseProtocol.length,12);
  console.log('PASS selected-page cap and 12-item protocol');
  const textOf=node=>[node.textContent||'',...node.children.map(textOf)].join(' ');
  const descendants=node=>[node,...node.children.flatMap(descendants)];
  const file={name:'unit-existing.pdf',size:123,lastModified:1};
  await extraction.onPdfLoaded(file);
  await call('dataex_set_results',base);
  const firstKey=storage.get('dataex:phase2.5:latest');
  assert.ok(firstKey.startsWith('dataex:phase2.5:pdf:'));
  const record=JSON.parse(storage.get(firstKey));
  assert.equal(record.results.outcomes[0].arms[0].numerator,0);
  assert.ok(!('bytes' in record)&&!('pdf' in record));
  assert.equal($('condition-content').hidden,true);
  descendants($('result-cards')).find(n=>n.textContent==='承認').click();
  state.pdf=null;
  const restored=context.window.createDataExExtraction(deps);
  assert.ok(textOf($('result-cards')).includes('承認済み'));
  assert.equal(descendants($('result-cards')).find(n=>n.textContent==='原著を見る').disabled,true);
  console.log('PASS restore structured results and review without PDF bytes; evidence disabled');
  state.pdf={numPages:8};
  await restored.onPdfLoaded(file);
  assert.equal(descendants($('result-cards')).find(n=>n.textContent==='原著を見る').disabled,false);
  await restored.onPdfLoaded({...file,lastModified:2});
  assert.equal($('result-cards').children.length,0);
  const otherKey=storage.get('dataex:phase2.5:latest');
  assert.notEqual(otherKey,firstKey);
  await restored.onPdfLoaded(file);
  assert.ok(textOf($('result-cards')).includes('承認済み'));
  $('erase-results').click();
  assert.equal(storage.has(firstKey),false);
  assert.equal(storage.has(otherKey),true);
  assert.equal($('result-cards').children.length,0);
  // Legacy record migration preserves review on one axis and makes unverified absence conservative.
  const legacy=structuredClone(record);legacy.version=1;
  for(const o of legacy.results.outcomes) for(const k of ['compatibility','requestedValue','relatedEvidence','reason','analysisAction','searchAudit']) delete o[k];
  legacy.results.summaryStatus='PARTIAL';legacy.results.outcomes[0].status='NOT_REPORTED';legacy.reviews=[[0,{state:'NEEDS_REVIEW'}]];
  storage.set(firstKey,JSON.stringify(legacy));storage.set('dataex:phase2.5:latest',firstKey);
  context.window.createDataExExtraction(deps);
  assert.ok(textOf($('result-cards')).includes('未発見・追加探索'));
  assert.ok(textOf($('result-cards')).includes('確認状態：要確認'));
  assert.equal(descendants($('result-cards')).filter(n=>n.className==='arm-row').length,0);
  descendants($('result-cards')).find(n=>n.textContent==='承認').click();
  assert.ok(textOf($('result-cards')).includes('未発見・追加探索'));
  assert.ok(textOf($('result-cards')).includes('確認状態：承認済み'));
  console.log('PASS legacy migration, no missing-value boxes, independent human review');
  console.log('PASS matching PDF re-enables evidence; fingerprint isolation; erase only this record');
})().catch(error=>{console.error(error);process.exitCode=1;});
