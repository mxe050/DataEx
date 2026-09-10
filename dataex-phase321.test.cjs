// Synthetic resolver fixtures: no claim that these values were read from a clinical PDF.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const context={window:{},document:{getElementById(){}},structuredClone};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'dataex-visual.js'),'utf8'),context);
const visual=context.window.createDataExVisual({state:{},selection:{setExtractHandler(){}},getExtraction(){},tool:(name,description,inputSchema,execute)=>({name,inputSchema,execute}),schema:(properties,required=[])=>({type:'object',properties,required,additionalProperties:false})});
const audit={valuesClearlyVisible:false,labelsClearlyVisible:true,unitsClearlyVisible:true,timepointClearlyVisible:true,uncertaintyTypeClearlyVisible:true,notes:'Synthetic metadata fixture.'};
const arm={name:'Group A',valueText:'Approximate mean',numerator:null,denominator:null,mean:10,sd:null,se:null,nStatus:'NOT_SHOWN_FOR_TIMEPOINT',uncertaintyValueStatus:'UNKNOWN'};
const metadata={figureNumber:'Figure 7',panel:null,caption:'Mean ± SD response (study population, full analysis set).',xAxis:'Visit',yAxis:'Response',unit:'points',series:['Group A'],errorBarType:null,population:'study population',analysisSet:'full analysis set',timepoint:'week 4',metadataVerification:'VISUALLY_VERIFIED_DIRECT_METADATA'};
const outcome={outcome:'Response at week 4',timepoint:'week 4',population:null,unit:'points',analysisUnit:'participant',variableType:'continuous',arms:[arm],directVisibleValues:[],derivedValues:[],approximate:false,reason:'Synthetic chart mean.',reviewFlags:['SD不明','解析集団の確認が必要'],figureMetadata:metadata};
const base={selectionId:'fixture',sourceKind:'FIGURE_ESTIMATE',resultStatus:'READY',outcomes:[outcome],visualAudit:audit};
const resolve=mutate=>{const input=structuredClone(base);mutate?.(input);visual.restore([{id:'fixture:'+input.outcomes[0].outcome,input,source:{page:1,selectionId:'fixture',sourceType:'VISUAL_REGION',normalizedRect:{x:.1,y:.1,width:.8,height:.8}},review:{state:'NOT_REVIEWED'}}]);return visual.outcomes()[0];};
let o=resolve();
assert.equal(o.figureMetadata.errorBarType,'SD');assert.equal(o.figureMetadata.population,'study population, full analysis set');
assert.equal(o.population,o.figureMetadata.population);assert.equal(o.figureMetadata.metadataVerification,'VISUALLY_VERIFIED_DIRECT_METADATA');
assert.equal(o.arms[0].n,null);assert.equal(o.arms[0].nStatus,'NOT_SHOWN_FOR_TIMEPOINT');assert.equal(o.arms[0].sd,null);assert.equal(o.arms[0].uncertainty.valueStatus,'UNKNOWN');
assert.deepEqual(Array.from(o.unresolved),['week 4の対応n','SDの数値']);assert.equal(o.reviewFlags.length,0);
assert.match(o.figureSummary,/captionで確認/);assert.doesNotMatch(o.figureSummary,/解析集団の確認が必要|SD不明/);
assert.equal(o.status,'CANDIDATE_ONLY');assert.equal(o.approximate,true);assert.equal(o.analysisAction,'REVIEW');
console.log('PASS direct caption metadata independent of estimated means, unknown SD value and timepoint n');

for(const [type,caption,values]of [
  ['SD','Mean ± SD', {sd:2}],['SE','Mean ± SEM',{se:.5}],['CI','Mean and 95% confidence intervals',{ciLow:8,ciHigh:12}]
])for(const status of ['KNOWN','VISUALLY_ESTIMATED']){
  o=resolve(p=>{const v=p.outcomes[0];p.visualAudit.valuesClearlyVisible=true;v.population='study population, full analysis set';v.directVisibleValues=['Synthetic printed numeric values and n 12'];v.figureMetadata.caption=caption;v.figureMetadata.errorBarType=null;Object.assign(v.arms[0],values,{uncertaintyValueStatus:status,nStatus:'SHOWN_FOR_TIMEPOINT',denominator:12});});
  assert.equal(o.figureMetadata.errorBarType,type);assert.equal(o.arms[0].uncertainty.valueStatus,status);assert.equal(o.arms[0].n,12);assert.equal(o.analysisAction,'REVIEW');assert.equal(o.status,'CANDIDATE_ONLY');
}
console.log('PASS SD / SE / CI type independent of KNOWN / VISUALLY_ESTIMATED values; no READY promotion');

o=resolve(p=>{const m=p.outcomes[0].figureMetadata;m.caption='Mean response during follow-up.';m.population=null;m.analysisSet=null;});
assert.equal(o.figureMetadata.errorBarType,null);assert.equal(o.figureMetadata.population,null);assert.equal(o.arms[0].uncertainty.type,'UNKNOWN');assert.ok(o.unresolved.includes('誤差棒の種類'));assert.ok(o.unresolved.includes('解析集団'));
o=resolve(p=>{p.outcomes[0].figureMetadata.metadataVerification='UNRESOLVED';});
assert.equal(o.figureMetadata.errorBarType,null);assert.equal(o.population,null);assert.equal(o.figureMetadata.caption,null);
o=resolve(p=>{const m=p.outcomes[0].figureMetadata;m.caption=null;m.population=null;m.analysisSet=null;m.yAxis='Mean points (±SD)';});
assert.equal(o.figureMetadata.errorBarType,'SD');assert.equal(o.metadataSource.errorBarType,'axis');assert.equal(o.population,null);
o=resolve(p=>{const m=p.outcomes[0].figureMetadata;m.caption='SD and SE are reported in different panels.';});
assert.equal(o.figureMetadata.errorBarType,null,'ambiguous kinds are not guessed');
console.log('PASS missing caption metadata stays unknown; axis SD is usable without inventing a population');

assert.throws(()=>resolve(p=>p.outcomes[0].figureMetadata.errorBarType='SE'),/一致/);
assert.throws(()=>resolve(p=>p.outcomes[0].arms[0].denominator=100),/null/);
assert.throws(()=>resolve(p=>p.outcomes[0].arms[0].nStatus='SHOWN_FOR_TIMEPOINT'),/整数/);
assert.throws(()=>resolve(p=>p.outcomes[0].arms[0].uncertaintyValueStatus='KNOWN'),/未確定/);
assert.throws(()=>resolve(p=>p.outcomes[0].arms[0].se=2),/一致/);
assert.throws(()=>resolve(p=>p.outcomes[0].figureMetadata.inventedField='value'),/使用できません/);
o=resolve(p=>Object.assign(p.outcomes[0].arms[0],{denominator:100,nStatus:'UNKNOWN'}));assert.equal(o.arms[0].n,null,'unconfirmed total n cannot become timepoint n');
o=resolve(p=>{const v=p.outcomes[0];delete v.figureMetadata;delete v.arms[0].nStatus;delete v.arms[0].uncertaintyValueStatus;v.figureContext={errorBarType:'SD (caption)',nBasis:'FAS total n 100'};});
assert.equal(o.status,'CANDIDATE_ONLY');assert.equal(o.figureMetadata.metadataVerification,'UNRESOLVED');assert.equal(o.arms[0].n,null);
console.log('PASS conflicting claims rejected, total n not substituted, old Phase 3.2 records restore conservatively');

o=resolve(p=>{p.sourceKind='TABLE_DIRECT';p.visualAudit.valuesClearlyVisible=true;const v=p.outcomes[0];delete v.figureMetadata;v.population='full analysis set';v.directVisibleValues=['Mean 5.1 (SD 7.52), n 228'];Object.assign(v.arms[0],{mean:5.1,sd:7.52,denominator:228});delete v.arms[0].nStatus;delete v.arms[0].uncertaintyValueStatus;});
assert.equal(o.status,'READY');assert.equal(o.analysisAction,'USE');assert.equal(o.arms[0].mean,5.1);assert.equal(o.arms[0].sd,7.52);assert.equal(o.arms[0].denominator,228);
console.log('PASS direct table readiness and numbers unchanged');
