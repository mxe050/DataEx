/* Local result delivery only. Raw and all extraction/normalization policies stay in Fuzzy Core. */
(function(root,factory){
  const node=typeof module==='object'&&module.exports;
  const api=factory(node?require('./dataex-fuzzy-core.js'):root.DataExFuzzyCore,node?require('./dataex-results-model.js'):root.DataExResultsModel);
  if(node)module.exports=api;else root.DataExJSONImport=api;
})(typeof window==='undefined'?null:window,function(core,model){
  'use strict';
  const FORMAT='DataExExtraction', VERSION=1, SAFE_WEBMCP_BYTES=100000, MAX_FILE_BYTES=20000000;
  const LARGE_MESSAGE='結果が大きいためJSONファイル経由で登録してください';
  const clone=x=>JSON.parse(JSON.stringify(x));
  const stable=x=>JSON.stringify(x,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
  const byteLength=value=>new TextEncoder().encode(typeof value==='string'?value:JSON.stringify(value)).length;
  const id=(value,label)=>{if(typeof value!=='string'||!value.trim()||value.length>1000)throw Error(label+'が不正です。');return value;};
  function exactKeys(value,keys,label){if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!keys.includes(k))||keys.some(k=>!Object.hasOwn(value,k)))throw Error(label+'の項目が不正です。');}
  function parse(text){
    if(typeof text!=='string'||byteLength(text)>MAX_FILE_BYTES)throw Error('JSONファイルが大きすぎます。');
    const clean=text.replace(/^\uFEFF/,'');let value;
    try{value=JSON.parse(clean);}catch(_){throw Error('JSON parse error：ファイルを最後まで読み取れません。登録していません。');}
    // JSON.parse silently keeps the last duplicate object key. Reject instead of losing input.
    const stack=[];
    for(const token of clean.match(/"(?:\\.|[^"\\])*"|[{}\[\],:]|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null/g)||[]){
      const top=stack.at(-1);
      if(token==='{')stack.push({keys:new Set(),key:true});
      else if(token==='[')stack.push({key:false});
      else if(token==='}'||token===']')stack.pop();
      else if(token===','&&top?.keys)top.key=true;
      else if(token.startsWith('"')&&top?.keys&&top.key){const name=JSON.parse(token);if(top.keys.has(name))throw Error('JSONに重複キーがあります：'+name);top.keys.add(name);top.key=false;}
    }
    return value;
  }
  function decode(value,manifest,project){
    id(project?.id,'登録先Review ID');id(manifest?.pdfId,'PDF ID');
    const envelope=value?.format===FORMAT||Object.hasOwn(value||{},'payload');
    let payload=value,meta;
    if(envelope){
      exactKeys(value,['format','schemaVersion','studyId','reviewId','extractionId','counts','payload'],'登録JSON');
      if(value.format!==FORMAT||value.schemaVersion!==VERSION)throw Error('対応していないschema versionです。');
      payload=value.payload;meta=value;
      if(id(value.studyId,'Study ID')!==payload?.pdfId)throw Error('Study IDとPDF IDが一致しません。');
      if(id(value.extractionId,'Extraction ID')!==payload?.requestId)throw Error('Extraction IDが一致しません。');
      if(id(value.reviewId,'Review ID')!==project.id)throw Error('Review IDが登録先レビューと一致しません。正しいレビューへ切り替えてください。');
      exactKeys(value.counts,['raw','outcomes','sources','sourceAnchors'],'件数');
      if(Object.values(value.counts).some(n=>!Number.isSafeInteger(n)||n<0))throw Error('件数が不正です。');
    }
    // Legacy VITAL files have no envelope. Identify v1 by complete strict schema validation.
    id(payload?.pdfId,'Study / PDF ID');id(payload?.requestId,'Extraction ID');
    const accepted=core.validateResult(payload,manifest);
    const identity={schemaVersion:VERSION,studyId:accepted.pdfId,reviewId:project.id,extractionId:accepted.requestId};
    return {payload:accepted,identity,legacy:!envelope,declaredCounts:meta?.counts||null};
  }
  function normalize(decoded,manifest,context,pageTexts){
    const study=core.buildStudy(decoded.payload,manifest,core.auditSources(decoded.payload,pageTexts));
    const view=model.build(study,context),counts={raw:study.raw.rawValues.length,outcomes:study.raw.outcomes.length,sources:study.raw.sources.length,sourceAnchors:view.rawViews.reduce((n,r)=>n+r.sourceAnchors.length,0)};
    if(decoded.declaredCounts&&Object.keys(counts).some(k=>counts[k]!==decoded.declaredCounts[k]))throw Error('宣言されたRaw / Outcome / Source Trace / sourceAnchor件数が一致しません。');
    if(stable(study.raw)!==stable(decoded.payload))throw Error('Rawの完全一致を確認できません。');
    return {...decoded,study,counts};
  }
  function envelope(prepared){return {format:FORMAT,...prepared.identity,counts:clone(prepared.counts),payload:clone(prepared.payload)};}
  function matching(records,identity){return records.filter(r=>r.project.id===identity.reviewId&&(r.studyId===identity.studyId||r.extractionId===identity.extractionId));}
  const revisions=records=>records.map(r=>({id:r.id,revision:r.revision})).sort((a,b)=>a.id.localeCompare(b.id));
  function delivery(){return {safeWebMCPBytes:SAFE_WEBMCP_BYTES,fileFormat:FORMAT,schemaVersion:VERSION,largeResultMessage:LARGE_MESSAGE,button:'保存済み抽出JSONを読み込む',instructions:'登録前にUTF-8 JSONのバイト数を確認。上限を超える場合は全文を1つのJSONファイルに保存し、利用者が読込・確認する。要約・Raw削除・分割・requestId書換えはしない。旧形式の完全なdataex_set_results payloadも読み込めます。'};}
  return Object.freeze({FORMAT,VERSION,SAFE_WEBMCP_BYTES,MAX_FILE_BYTES,LARGE_MESSAGE,parse,decode,normalize,envelope,matching,revisions,stable,byteLength,delivery});
});
