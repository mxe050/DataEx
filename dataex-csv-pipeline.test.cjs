const assert=require('node:assert/strict'),T=require('./dataex-csv-trace.js');
let passed=0;const test=(name,fn)=>{fn();passed++;console.log('PASS',name)};
function fixture(field='events',value=1){const source={id:'S1',pdfFile:'paper.pdf',pdfPage:5,directValue:'side-effect counts',evidenceText:'One sub- ject reported an adverse effect. 32 participants completed treatment.',kind:'TEXT'};const raw={id:'R1',statistics:{[field]:value},sourceRefs:{[field]:'S1'}},point={id:'R1',raw:{...raw.statistics,sourceRefs:raw.sourceRefs},decision:{finalValue:null}};const record={studyId:'study-1',snapshot:{pdf:{filename:'paper.pdf',pageCount:8},raw:{rawValues:[raw],sources:[source]}},points:{R1:point}};const evidence={studyId:'study-1',document:{filename:'paper.pdf',sha256:'a'.repeat(64),byte_size:1234,page_count:8,hash_method:'SHA-256/file-bytes'},matchedSourceIds:['S1'],sourceLocations:{}};return {source,raw,point,record,evidence,read:()=>T.inheritedEvidence(record,point,field,evidence)};}
test('descriptive transcription retains exact native count word',()=>assert.equal(fixture().read().reportedValue,'One'));
test('explicit denominator source uses existing native numeric token',()=>assert.equal(fixture('total',32).read().reportedValue,'32'));
test('contradictory numeric transcription remains unresolved',()=>{const f=fixture();f.source.directValue='2';assert.equal(f.read().reportedValue,null);assert(f.read().sources.every(s=>!s.quote_segments.length));});
test('count words do not become means',()=>assert.equal(fixture('mean',1).read().reportedValue,null));
test('unmatched source is rejected',()=>{const f=fixture();f.evidence.matchedSourceIds=[];assert.equal(f.read(),null)});
test('wrong PDF is rejected',()=>{const f=fixture();f.evidence.document.filename='other.pdf';assert.equal(f.read(),null)});
test('edited value cannot inherit previous Raw evidence',()=>{const f=fixture();f.point.decision.finalValue={events:2};assert.equal(f.read(),null)});
test('absent numeric evidence stays unresolved',()=>{const f=fixture();f.source.evidenceText='Adverse effects were assessed.';assert.equal(f.read().reportedValue,null)});
test('Raw and prior approval remain byte-identical',()=>{const f=fixture();f.record.csvTrace={approvals:{old:{frozen:true}}};const old=JSON.stringify(f.record);f.read();assert.equal(JSON.stringify(f.record),old)});
console.log(JSON.stringify({passed}));
