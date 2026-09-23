const assert=require('node:assert/strict'),M=require('./dataex-results-model.js'),P=require('./dataex-paper-model.js'),F=require('./dataex-fuzzy-core.js'),C=require('./dataex-confirmation.js'),{fixture}=require('./dataex-fuzzy-fixture.cjs');
let n=0;function test(name,fn){fn();console.log('PASS '+name);n++;}
for(const t of ['15 months post-baseline','30 months post baseline','post–baseline','baseline-adjusted','15 months, baseline adjusted','change from baseline','6 weeks after treatment','介入後 6週'])test('not baseline: '+t,()=>assert.equal(M.baseline(t),false));
for(const t of ['Baseline','at baseline','pre-treatment','pre intervention','before intervention','0 weeks','week 0','ベースライン','治療前','Baseline (0 months)'])test('true baseline: '+t,()=>assert.equal(M.baseline(t),true));
test('change remains separate from baseline and adjustment',()=>{assert.equal(M.isBaselineRow({timepoint:'baseline',resultType:'change'}),false);assert.equal(M.isBaselineRow({timepoint:'15 months post-baseline',resultType:'effect',adjustment:'baseline-adjusted'}),false);assert.equal(M.timePhase('change from baseline'),'change');});
test('empty SR shows post-baseline clinical results and preserves Raw/Trace',()=>{
 const raw=fixture();raw.outcomes[0].mapping.reason='Primary outcome';raw.outcomes[0].timepoints=['15 months post-baseline'];for(const r of raw.rawValues.filter(r=>r.outcomeId===raw.outcomes[0].id)){r.timepoint='15 months post-baseline';r.adjustment='baseline-adjusted';}
 const study=F.buildStudy(raw,{pdfId:raw.pdfId,filename:'fuzzy-fixture.pdf',pageCount:10},[]),before=structuredClone(study),view=M.build(study,{}),paper=P.build(view,{}),cards=C.cards(paper,view);
 assert.ok(paper.mainOutcomes.some(o=>o.id===raw.outcomes[0].id));assert.ok(cards.filter(c=>c.reportedOutcomeId===raw.outcomes[0].id).every(c=>!c.detailOnly));assert.deepEqual(study,before);assert.equal(new Set(cards.flatMap(c=>c.pointIds)).size,raw.rawValues.length);
});console.log(JSON.stringify({checks:n,passed:true}));
