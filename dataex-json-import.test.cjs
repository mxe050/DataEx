const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const IO=require('./dataex-json-import.js'),core=require('./dataex-fuzzy-core.js'),model=require('./dataex-results-model.js');
const {fixture}=require('./dataex-fuzzy-fixture.cjs');
let checks=0;const test=(name,fn)=>{fn();checks++;console.log('PASS '+name);};
const text=process.env.DATAEX_IMPORT_PAYLOAD?fs.readFileSync(process.env.DATAEX_IMPORT_PAYLOAD,'utf8'):JSON.stringify(fixture());
const raw=IO.parse(text),before=IO.stable(raw),manifest={pdfId:raw.pdfId,filename:raw.sources[0].pdfFile,pageCount:Math.max(...raw.sources.map(s=>s.pdfPage))},project={id:'review:test',label:'Import validation'},context=core.context({});
// Real PDF text is audited in the browser acceptance suite. Unit tests exercise both paths with identical text.
const pages={};for(const source of raw.sources)pages[source.pdfPage]=(pages[source.pdfPage]||'')+'\n'+source.evidenceText;
const decode=x=>IO.decode(x,manifest,project),normalize=x=>IO.normalize(decode(x),manifest,context,pages);
const prepared=normalize(raw),wrapped=IO.envelope(prepared),copy=()=>structuredClone(wrapped);
test('BOM and complete local JSON parse without loss',()=>assert.equal(IO.stable(IO.parse('\ufeff'+JSON.stringify(raw))),before));
test('all saved Raw, outcomes and source references retained',()=>{assert.equal(prepared.counts.raw,raw.rawValues.length);assert.equal(prepared.counts.outcomes,raw.outcomes.length);assert.equal(prepared.counts.sources,raw.sources.length);if(process.env.DATAEX_IMPORT_PAYLOAD)assert.equal(prepared.counts.raw,238);});
test('legacy schema identified without inventing a review ID in Raw',()=>{assert.equal(prepared.legacy,true);assert.equal(prepared.identity.schemaVersion,core.SCHEMA_VERSION);assert.equal(prepared.identity.reviewId,project.id);assert.equal(prepared.payload.reviewId,undefined);assert.equal(IO.stable(prepared.study.raw),before);});
test('file and normal Core validation + normalization are identical',()=>{const accepted=core.validateResult(raw,manifest),normal=core.buildStudy(accepted,manifest,core.auditSources(accepted,pages));assert.deepEqual(prepared.study,normal);assert.deepEqual(model.build(prepared.study,context),model.build(normal,context));});
test('envelope roundtrip preserves all IDs and exact Raw',()=>{assert.equal(normalize(IO.parse(JSON.stringify(wrapped))).legacy,false);assert.equal(IO.stable(normalize(wrapped).study),IO.stable(prepared.study));});
test('normalization never mutates file payload',()=>assert.equal(IO.stable(raw),before));
test('truncated JSON rejected before registration',()=>assert.throws(()=>IO.parse(text.slice(0,-15)),/parse error/));
test('duplicate object keys rejected instead of silently overwriting',()=>{assert.throws(()=>IO.parse('{"a":1,"a":2}'),/重複/);assert.throws(()=>IO.parse('{"x":{"a":1,"\\u0061":2}}'),/重複/);assert.deepEqual(IO.parse('{"x":[{"a":1},{"a":2}],"a":3}'),{x:[{a:1},{a:2}],a:3});});
test('unsupported schema version rejected',()=>{const x=copy();x.schemaVersion=2;assert.throws(()=>decode(x),/schema version/);});
for(const key of ['studyId','reviewId','extractionId'])test('mismatched '+key+' rejected',()=>{const x=copy();x[key]='different';assert.throws(()=>decode(x));});
for(const key of ['raw','outcomes','sources','sourceAnchors'])test('incorrect '+key+' count rejected',()=>{const x=copy();x.counts[key]++;assert.throws(()=>normalize(x),/件数/);});
for(const key of ['rawValues','outcomes','sources'])test('duplicate '+key+' ID rejected',()=>{const x=structuredClone(raw);x[key].push(structuredClone(x[key][0]));assert.throws(()=>decode(x),/Duplicate/);});
test('duplicate arm ID rejected',()=>{const x=structuredClone(raw);x.study.arms.push(structuredClone(x.study.arms[0]));assert.throws(()=>decode(x),/Duplicate/);});
test('unknown source reference rejected',()=>{const x=structuredClone(raw);x.rawValues[0].sourceRefs[Object.keys(x.rawValues[0].sourceRefs)[0]]='missing-source';assert.throws(()=>decode(x),/source/);});
test('wrong PDF rejected',()=>{assert.throws(()=>IO.decode(raw,{...manifest,pdfId:'other'},project));assert.throws(()=>IO.decode(raw,{...manifest,filename:'other.pdf'},project));});
test('missing review ID rejected',()=>assert.throws(()=>IO.decode(raw,manifest,{}),/Review ID/));
test('unknown schema fields cannot be silently dropped',()=>{const x=structuredClone(raw);x.unrecognized=true;assert.throws(()=>decode(x),/unknown field/);const y=copy();y.unrecognized=true;assert.throws(()=>decode(y));});
test('duplicate detection is per review and matches Study OR extraction ID',()=>{const id=prepared.identity,r=(n,reviewId,studyId,extractionId)=>({id:n,revision:0,project:{id:reviewId},studyId,extractionId});const rs=[r('same-study',id.reviewId,id.studyId,'old'),r('same-request',id.reviewId,'other',id.extractionId),r('other-review','other',id.studyId,id.extractionId)];assert.deepEqual(IO.matching(rs,id).map(r=>r.id),['same-study','same-request']);});
test('concurrency signature includes every matching version revision',()=>{assert.notEqual(IO.stable(IO.revisions([{id:'a',revision:0}])),IO.stable(IO.revisions([{id:'a',revision:1}])));});
test('large delivery metadata requests one complete file without extraction changes',()=>{assert.equal(IO.delivery().largeResultMessage,'結果が大きいためJSONファイル経由で登録してください');assert.ok(IO.byteLength('日本語')>3);if(process.env.DATAEX_IMPORT_PAYLOAD)assert.ok(IO.byteLength(raw)>IO.SAFE_WEBMCP_BYTES);});
const baseline=process.env.DATAEX_IMPORT_BASELINE;
if(baseline){
 const read=(dir,name)=>fs.readFileSync(path.join(dir,name),'utf8'),old=read(baseline,'dataex-fuzzy-workspace.js'),next=read(__dirname,'dataex-fuzzy-workspace.js');
 const chunk=(s,a,b)=>s.slice(s.indexOf(a),s.indexOf(b,s.indexOf(a))).trim();
 for(const [a,b,label] of [['  async function setResults(input)','  async function timedSetResults(input)','normal setResults'],['  const output = ()','  function invalidate()','generated extraction Prompt'],['  async function pageText','  async function persist','PDF reading and document map'],['  function summary()','  function render()','semantic summary']])test(label+' unchanged',()=>assert.equal(chunk(old,a,b),chunk(next,a,b)));
 for(const name of ['dataex-fuzzy-core.js','dataex-paper-model.js','dataex-effect-type.js','dataex-arm-ontology.js','dataex-results-model.js','dataex-decisions.js','dataex-source-navigation.js','dataex-selection.js','dataex-caption.js','dataex-visual.js'])test(name+' byte-identical',()=>assert.equal(read(baseline,name),read(__dirname,name)));
}
console.log(JSON.stringify({checks,passed:true,raw:prepared.counts.raw,outcomes:prepared.counts.outcomes,sources:prepared.counts.sources,sourceAnchors:prepared.counts.sourceAnchors}));
