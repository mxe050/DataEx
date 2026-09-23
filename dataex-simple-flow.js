/* SIMPLE-FLOW-2.0: presentation-only export projection. Existing gates remain authoritative. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.DataExSimpleFlow=api;})(typeof window==='undefined'?null:window,()=>{
 'use strict';const VERSION='SIMPLE-FLOW-2.0';
 function columns(input){const right=k=>/_source_note$|_trace_json$/.test(k)||/^(?:Original_|Mapping_|Actual_|Record_ID|Candidate_ID|Approval_|Analysis_collection|result_id|result_set_id|exported_at|derivation|reviewer_note|meta_analysis_note|Analysis_population|Adjustment|Review_outcome_definition|record_kind|context_json|provenance_|export_|dataset_revision|value_revision|source_|decision_|review_|edit|raw_|final_|notes|derived_formula|text_escapes_json)/.test(k);return [...input.filter(k=>!right(k)),...input.filter(right)];}
 function project(snapshot,D,T){if(snapshot.blocked)return snapshot;const cols=columns(snapshot.traceColumns),rows=snapshot.traceRows;return {...snapshot,columns:cols,rows,csv:T.serializeCsv(D,cols,rows).csv};}
 function buildOutput(records,c,analysisId,W,D,T,S,options={}){
  if(!analysisId){const missing=records.filter(r=>r.project.id===c.reviewId).flatMap(r=>Object.values(r.resultSets||{}).filter(s=>s.status==='ACCEPTED'&&!c.members.some(m=>m.recordId===r.id&&m.candidateId===s.id)));if(missing.length)return {blocked:true,issues:['承認済みで表に未所属の結果があります。表へ追加してから出力してください。'],rows:[],columns:[]};}
  const analyses=analysisId?c.analyses.filter(a=>a.id===analysisId):c.analyses.filter(a=>c.members.some(m=>m.analysisId===a.id&&['INCLUDED','NEEDS_REVIEW'].includes(m.status)));
  if(!analyses.length)return {blocked:true,issues:['この表に承認・保存済みの結果はありません。'],rows:[],columns:[]};
  const items=[],selectedRecords=new Map(),seen=new Set();let numCols=null,reportedOnly=false;
  for(const a of analyses){
   const p=W.projection(records,c,a,D,T,options.pending);if(p.blocked)return {...p,rows:[],columns:[]};
   for(const {record:r,member:m,set:s} of p.selected){
    selectedRecords.set(r.id,r);const key=r.id+'|'+s.id;if(seen.has(key))return {blocked:true,issues:['同じ候補が複数の表にあります。出力する表を一つ選択してください。'],rows:[],columns:[]};seen.add(key);
    // A reported ratio + CI remains a reported ratio. It is not silently converted to GIV.
    const v=s.acceptedValues[s.pointIds[0]],reported=a.format==='giv'&&!s.acceptedDerived?.length&&v.se==null;
    const format=reported?'master':a.format, traced=T.buildApprovedWithSourcesRows([r],D,{...options,projectId:c.reviewId,format});
    if(traced.blocked||traced.rows.length!==1)return {blocked:true,issues:[...(traced.issues||[]).map(x=>x.message),'全行の出力検査を通過できません。省略せず停止しました。'],rows:[],columns:[]};
    const common=c.outcomes.find(o=>o.id===a.outcomeId),dim=W.dimensions(r,s),os=r.snapshot.raw.outcomes.filter(o=>dim.outcomeIds.includes(o.id));
    const row={...traced.rows[0],Study:r.snapshot.raw.study.label,Outcome:common.name,Timepoint:s.timepoint,Result_Type:s.resultType,Review_outcome:common.name,Review_outcome_definition:common.definition,Analysis_collection:a.id,Analysis_comparison:a.comparison,Analysis_time_window:a.window,Original_outcome:os.map(o=>o.reportedName).join(' / '),Original_definition:os.map(o=>o.definition||o.description||o.notes||'未記録').join(' / '),Mapping_reason:m.reason,Actual_timepoint:s.timepoint,Analysis_population:dim.population.join(' / '),Adjustment:dim.adjustment.join(' / '),Record_ID:r.id,Candidate_ID:s.id,Approval_ID:m.ref.approvalId,Approval_revision:m.ref.approvalRevision};
    items.push({row,columns:[...traced.columns,...Object.keys(row)],study:m.studyId});
    reportedOnly||=reported;const ns=S.NUMBERS[a.format]||[];if(numCols===null)numCols=ns;else if(JSON.stringify(ns)!==JSON.stringify(numCols))numCols=[];
   }
  }
  const order=new Map(W.studies(records,c).map((g,i)=>[g.id,i]));items.sort((a,b)=>order.get(a.study)-order.get(b.study));
  const leading=['Study','study_id','Review_outcome','Analysis_comparison','Timepoint','Result_Type','Effect_Type','Comparison_Direction'];
  const existing=[...new Set(items.flatMap(i=>i.columns))].filter(k=>items.some(i=>i.row[k]!==null&&i.row[k]!==undefined&&i.row[k]!==''));const all=[...new Set([...leading.filter(k=>existing.includes(k)),...existing])],cols=columns(all),rows=items.map(i=>i.row);
  const numericColumns=reportedOnly||!analysisId?[]:numCols||[];
  if(numericColumns.length&&rows.some(r=>numericColumns.some(k=>typeof r[k]!=='number'||!Number.isFinite(r[k]))))return {blocked:true,issues:['解析に必要な数値が不足しています。空欄を補完しません。'],rows:[],columns:[]};
  return {blocked:false,issues:[],columns:cols,rows,csv:T.serializeCsv(D,cols,rows).csv,tsv:rows.map(r=>numericColumns.map(k=>r[k]).join('\t')).join('\r\n'),numericColumns,reportedOnly,format:analysisId?analyses[0].format:'long',signature:W.stable({catalog:c,records:[...selectedRecords.values()]}),exportId:options.exportId||'simple-flow',exportedAt:options.exportedAt};
 }
 function editSourceDraft(record,set,pointId,field,T,evidence){
  const p=record.points[pointId],stored=T.editDefaults(record,record.resultSets?.[set.id]||set,pointId,field),native=T.inheritedEvidence(record,p,field,evidence);
  const draft=Object.keys(stored).length?structuredClone(stored):structuredClone(native||{origin:'direct',sources:T.legacySource(record,p,field)});
  // Only inherit verified file identity along the same statistic -> source edge.
  // Never inherit an old approval or replace a user's quote/location.
  for(const source of draft.sources||[]){const prior=record.csvTrace?.approvals?.[set.id]?.values?.[pointId]?.[field]?.sources||[];const same=s=>s.source_id===source.source_id&&s.document.filename===source.document?.filename;const matched=native?.sources?.find(same)||prior.find(s=>same(s)&&JSON.stringify(s.quote_segments.map(q=>q.text))===JSON.stringify((source.quote_segments||[]).map(q=>q.text))&&JSON.stringify(s.locations.map(l=>l.pdf_page_number))===JSON.stringify((source.locations||[]).map(l=>l.pdf_page_number)));if(matched){for(const quote of source.quote_segments||[]){const original=matched.quote_segments?.find(q=>q.text===quote.text&&q.role===quote.role);if(original&&(!quote.capture_method||quote.capture_method==='not_recorded'))quote.capture_method=original.capture_method;}if(!source.document?.sha256)source.document=structuredClone(matched.document);for(const location of source.locations||[]){const found=matched.locations?.find(l=>l.pdf_page_number===location.pdf_page_number);if(found&&!location.region&&!location.table&&found.region)for(const key of ['region','rects','coordinate_space','capture_method'])location[key]=structuredClone(found[key]??null);}}}
  return draft;
 }
 function inspectRows(records,c,analysisId,D,T){
  const rows=[];
  const members=c.members.filter(m=>(!analysisId||m.analysisId===analysisId)&&['INCLUDED','NEEDS_REVIEW'].includes(m.status));
  const targets=analysisId?members:records.filter(r=>r.project?.id===c.reviewId).flatMap(r=>Object.values(r.resultSets||{}).filter(s=>s.status==='ACCEPTED').map(s=>({recordId:r.id,candidateId:s.id})));
  for(const m of targets){const r=records.find(r=>r.id===m.recordId),s=r?.resultSets?.[m.candidateId];
   try{if(!r||!s)throw Error('元の研究または候補を読み取れません。保存済みの研究を開いて確認してください。');
    const snap=T.entrySnapshot(r,s),current=Object.fromEntries(s.pointIds.map(id=>[id,D.value(r.points[id])])),member=members.find(x=>x.recordId===r.id&&x.candidateId===s.id);
    rows.push({recordId:r.id,candidateId:s.id,study:r.snapshot.raw.study.label,label:s.label||s.outcomeId,timepoint:s.timepoint,status:!member?'表への所属確認が必要':snap.mismatch||snap.unsaved||member.status==='NEEDS_REVIEW'?'要再確認':'確認用表示',current:{values:current,derived:s.acceptedDerived||[]},approved:{values:s.acceptedValues,traceApproval:r.csvTrace?.approvals?.[s.id]||null},problem:!member?'この承認は解析表に未所属です。元候補から表への追加を確認してください。':snap.mismatch||snap.unsaved?'現在値・出典・保存版と固定承認が一致しません。元候補を再確認し、明示的に承認・保存してください。':''});
   }catch(e){rows.push({recordId:m.recordId,candidateId:m.candidateId,study:r?.snapshot?.raw?.study?.label||'研究名を読み取れません',status:'要再確認',problem:e.message});}
  }return rows;
 }
 function output(records,c,analysisId,W,D,T,S,options={}){
  // Diagnostic rows never authorize output; the original output gate remains unchanged.
  const P=typeof module==='object'&&module.exports?require('./dataex-ai-proposal.js'):window.DataExAIProposal;const fn=()=>buildOutput(records,c,analysisId,W,D,T,S,options);const result=P?P.withExport(records,c,analysisId,fn):fn();
  const diagnostics=inspectRows(records,c,analysisId,D,T);
  return {...result,diagnostics,state:result.blocked?(diagnostics.length?'needs-review':'empty'):'ready'};
 }
 return Object.freeze({VERSION,columns,project,output,inspectRows,editSourceDraft});
});

