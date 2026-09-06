const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const code=fs.readFileSync(__dirname+'/dataex-webmcp.js','utf8');const context={};
vm.createContext(context);vm.runInContext(code.slice(code.indexOf('  function focusIndex('),code.indexOf('  async function focusEvidence(')),context);
const {focusIndex,anchorMatches,resolveAnchor}=context;
for(const [a,b] of [['Ａ　≥ 1 . 5 ± 0 . 2','a >=1.5 +/-0.2'],['x\u00a0≤\n2','x <= 2'],['NRS (0—10)','NRS (0-10)'],['as- sessed','assessed']])assert.equal(focusIndex(a).value,focusIndex(b).value);
function data(rows){let raw='',spans=[],items=[];for(const [text,y]of rows){const i=items.length,start=raw.length;raw+=text+' ';spans.push({id:'s'+i,start,end:start+text.length});items.push({str:text,height:10,transform:[1,0,0,1,0,y]});}return {raw,spans,textContent:{items}};}
let d=data([['Threshold',100],['≥',100],['1 . 5',100],['±',100],['0.2',100]]);let m=anchorMatches(d,'Threshold >= 1.5 +/- 0.2');assert.equal(m.length,1);assert.equal(m[0].spanIds.length,5);
d=data([['Target category',100],['Group A',100],['12.5',100],['0.7',100],['Different category',70],['Group A',70],['12.5',70],['0.7',70]]);
m=resolveAnchor(d,{focusQuery:'Target category 12.5 0.7',row:'Target category',column:'Group A',valueText:'12.5 0.7'});assert.ok(m);assert.deepEqual([...m.spanIds],['s0','s2','s3']);
assert.equal(resolveAnchor(d,{focusQuery:'missing phrase',row:'Target category',valueText:'987.65 0.7'}),null);
assert.equal(resolveAnchor(d,{focusQuery:'missing phrase',label:'x',valueText:'12.5'}),null);
assert.equal(resolveAnchor(d,{focusQuery:'missing phrase',evidenceText:'12.5'}),null); // repeated evidence is ambiguous
console.log('PASS Unicode symbols/space/decimals/hyphenation, split items, bounded same-row numeric fallback, unrelated and ambiguous refusal');
