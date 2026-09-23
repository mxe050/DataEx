const assert=require('node:assert/strict');
global.window={};
require('./dataex-focus-review.js');
const proposal=require('./dataex-ai-proposal.js');
const {analysisReady,proposedIdsForRecord}=window.DataExFocusReview;

const card=(id,values)=>({id,rows:values.map((statistics,i)=>({raw:{id:id+':'+i,statistics}}))});
const ready=card('ready',[{events:4,total:30},{events:2,total:32}]);
const incomplete=card('incomplete',[{events:4,total:30},{events:null,total:32}]);
const visual=card('visual',[{events:4,total:null},{events:2,total:null}]);
assert.equal(analysisReady(ready,'binary',r=>r.raw),true);
assert.equal(analysisReady(incomplete,'binary',r=>r.raw),false);
assert.equal(analysisReady(visual,'binary',r=>r.raw),false);
assert.equal(analysisReady(card('continuous',[{mean:2,sd:1,n:30},{mean:3,sd:1.2,n:32}]),'continuous',r=>r.raw),true);
assert.equal(analysisReady(card('se-only',[{mean:2,se:.2,n:30},{mean:3,se:.3,n:32}]),'continuous',r=>r.raw),false);
assert.equal(analysisReady(card('giv',[{estimate:-1,ciLow:-2,ciHigh:0}]),'giv',r=>r.raw),true);

const catalog={aiProposals:[{phase:'ready',response:{tables:[{id:'safety',format:'binary',rows:[{status:'needs_review',matches:[{recordId:'study',candidateId:'ready'},{recordId:'study',candidateId:'incomplete'},{recordId:'study',candidateId:'visual'}]},{status:'candidate',matches:[{recordId:'other',candidateId:'ready'}]}]}]}}]};
const ids=proposedIdsForRecord(catalog,'study',[ready,incomplete,visual],r=>r.raw,proposal);
assert.deepEqual([...ids],['ready']);
assert.equal(proposedIdsForRecord({},'study',[ready],r=>r.raw,proposal),null);
assert.match(proposal.PROMPT,/総有害事象、重篤な有害事象、死亡、治療中止/);
assert.match(proposal.PROMPT,/細かな症状・器官別事象を一件ずつ主表にしない/);
assert.equal(proposal.requestPrompt({promptVersion:'AI-PROPOSAL-PROMPT-1.0',prompt:'saved legacy prompt'}).prompt,'saved legacy prompt');
console.log('PASS AI提案の数値候補だけを優先表示し、詳細Raw・旧版を保持');
