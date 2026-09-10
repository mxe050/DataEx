/* Preserved classic contracts plus Fuzzy A–C integration. No assertion is removed from prior tests. */
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const dir=process.env.DATAEX_TEST_DIR||__dirname,out=process.env.DATAEX_ARTIFACT_DIR||path.join(__dirname,'test-artifacts');
const url=process.env.DATAEX_URL||'http://127.0.0.1:8766/dataex-chatgpt.html';
if(new URL(url).origin!=='http://127.0.0.1:8766')throw Error('DataEx regression tests must use 127.0.0.1:8766');
const names=['dataex-phase2.test.cjs','dataex-phase261.match.test.cjs','dataex-phase26.browser.test.cjs',
  'dataex-phase281-multisource.test.cjs','dataex-phase281-profile-regression.test.cjs','dataex-phase281.browser.test.cjs',
  'dataex-phase31.browser.test.cjs','dataex-phase32.browser.test.cjs','dataex-phase321.test.cjs',
  'dataex-phase321.browser.test.cjs','dataex-phase322.test.cjs','dataex-phase322.browser.test.cjs'];
if(process.env.DATAEX_INCLUDE_BUILDER==='1')names.push('dataex-prompt-builder.test.cjs','dataex-prompt-builder.browser.test.cjs');
if(process.env.DATAEX_INCLUDE_FUZZY==='1')names.push('dataex-fuzzy.test.cjs','dataex-fuzzy.browser.test.cjs');
const fuzzyAvailable=fs.existsSync(path.join(dir,'dataex-fuzzy-workspace.js'));
const results=[];fs.mkdirSync(out,{recursive:true});
for(const name of names){
  const artifacts=path.join(out,name);fs.mkdirSync(artifacts,{recursive:true});
  // The old settings/profile UI is a historical compatibility page, not hidden Advanced fields on the new page.
  // Region-selection regression and all new integration checks run on the actual new entry page.
  const testUrl=fuzzyAvailable&&!name.startsWith('dataex-fuzzy.')&&name!=='dataex-phase31.browser.test.cjs'?new URL('dataex-classic.html',url).href:url;
  const started=Date.now(),result=spawnSync(process.execPath,[path.join(dir,name)],{encoding:'utf8',timeout:180000,maxBuffer:8*1024*1024,
    env:{...process.env,DATAEX_URL:testUrl,DATAEX_ARTIFACT_DIR:artifacts}});
  const log=(result.stdout||'')+(result.stderr||'')+(result.error?'\n'+result.error.message:'');fs.writeFileSync(path.join(artifacts,'run.log'),log);
  const row={name,url:testUrl,ok:result.status===0&&!result.error,checks:(log.match(/^PASS /gm)||[]).length,seconds:Math.round((Date.now()-started)/1000)};
  results.push(row);console.log(JSON.stringify(row));if(!row.ok)console.log(log.slice(-2500));
  fs.writeFileSync(path.join(out,'suite-result.json'),JSON.stringify({url,results,totalChecks:results.reduce((n,r)=>n+r.checks,0),passed:results.every(r=>r.ok)},null,2));
}
if(results.some(r=>!r.ok))process.exitCode=1;
