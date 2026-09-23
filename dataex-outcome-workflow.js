/* Non-destructive review indexes. Canonical numbers and fixed approvals stay in study records. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.DataExOutcomeWorkflow=api;})(typeof window==='undefined'?null:window,()=>{
 'use strict';const proposal=()=>typeof module==='object'&&module.exports?require('./dataex-ai-proposal.js'):window.DataExAIProposal;
 const VERSION='OUTCOME-WORKFLOW-1.1',copy=v=>structuredClone(v),stable=v=>Array.isArray(v)?'['+v.map(stable).join(',')+']':v&&typeof v==='object'?'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+stable(v[k])).join(',')+'}':JSON.stringify(v),text=v=>String(v??'').trim(),norm=v=>text(v).toLowerCase().replace(/\s+/g,' ');
 function catalog(records,reviewId){const saved=records.catalogs?.find(c=>c.reviewId===reviewId);if(saved)return copy(saved);const owners=records.filter(r=>r.project.id===reviewId&&r.workflowCatalog);if(owners.length>1)throw Error('採用表の保存先が複数あります。統合せず停止しました。');return copy(owners[0]?.workflowCatalog||{version:VERSION,reviewId,revision:0,outcomes:[],analyses:[],members:[],mappings:[],studyLinks:{},planned:[],history:[],session:{mode:'paper',analysisId:null,recordId:null,stopped:false}});}
 function safetyKind(o,raw){const rows=(raw.rawValues||[]).filter(r=>r.outcomeId===o.id),ids=new Set(rows.flatMap(r=>Object.values(r.sourceRefs||{}))),sources=(raw.sources||[]).filter(s=>ids.has(s.id));const name=[o.reportedName,o.conceptCandidate].join(' '),context=[name,...sources.flatMap(s=>[s.section,s.tableFigure,s.sourceText,s.quote,s.evidenceText])].join(' ');
  const baseline=rows.length&&rows.every(r=>/^(baseline|pre[- ]?(treatment|intervention)|介入前)$/i.test(text(r.timepoint))||r.resultType==='baseline');
  if(baseline&&!/adverse|side.effects|toxicit|有害|副作用/i.test(name))return {kind:'symptom',label:'介入前の症状（AEとは未確定）'};
  if(/adverse|side.effects|safety|toxicit|有害|副作用/i.test(context)){
   if(/discontinu|withdraw|中止/i.test(name))return {kind:'ae-withdrawal',label:'有害事象による中止'};
   if(/serious|重篤/i.test(name))return {kind:'sae',label:'重篤な有害事象'};
   if(/nausea|headache|tiredness|dysphoria|悪心|頭痛/i.test(name)&&/\bor\b|\band\b|[,、]/i.test(name))return {kind:'symptom-composite',label:'特定症状のいずれか（総AEとは別）'};
   if(/any adverse|at least one adverse|total adverse|any side|総有害|全有害/i.test(name))return {kind:'any-ae',label:'何らかの有害事象'};
   if(/nausea|vomit|headache|dizz|sedat|blurred|hallucin|悪心|嘔吐/i.test(name))return {kind:'specific-ae',label:'個別の有害事象'};
   return {kind:'safety-unspecified',label:'安全性（定義の確認が必要）'};
  }
  return {kind:'other',label:o.conceptCandidate||'原著のアウトカム'};
 }
 function outcomeInfo(o,raw){const info=safetyKind(o,raw),name=o.reportedName||'',jp=/[\u3040-\u30ff\u4e00-\u9faf]/.test(o.conceptCandidate||'');const aliases=[[/nausea.*headache.*tiredness.*dysphoria/i,'悪心・頭痛・疲労感・気分不快のいずれか'],[/^nausea$|adverse effect:? nausea/i,'悪心'],[/dizziness/i,'めまい'],[/hallucinat/i,'幻覚'],[/psychomimetic/i,'精神模倣性の副作用']];return {...info,reported:name,meaning:jp?o.conceptCandidate:aliases.find(([pattern])=>pattern.test(name))?.[1]||(info.kind!=='other'?info.label:o.conceptCandidate||name),definition:o.definition||o.description||o.notes||''};}
 function studyKey(r,c){return c.studyLinks[r.id]?.studyId||r.studyId;}
 function studies(records,c){const grouped=new Map();for(const r of records.filter(r=>r.project.id===c.reviewId).slice().sort((a,b)=>String(a.createdAt).localeCompare(String(b.createdAt))||a.id.localeCompare(b.id))){const id=studyKey(r,c);if(!grouped.has(id))grouped.set(id,{id,label:r.snapshot.raw.study.label,records:[]});grouped.get(id).records.push(r);}for(const p of c.planned)if(!grouped.has(p.id))grouped.set(p.id,{...p,records:[]});return [...grouped.values()];}
 function currentValues(r,s){return s.pointIds.map(id=>r.points[id]?.decision.finalValue||r.points[id]?.raw);}
 function dimensions(r,s){const v=currentValues(r,s);return {outcomeIds:[...new Set(v.map(p=>p?.outcomeId))],comparison:s.comparison,timepoint:s.timepoint,resultType:s.resultType,unit:[...new Set(v.map(p=>p?.unit))],population:[...new Set(v.map(p=>p?.population))],adjustment:[...new Set(v.map(p=>p?.adjustment))],direction:v.map(p=>p?.comparisonDirection||p?.effectDirection||null)};}
 function formatOf(r,s){if(s.acceptedDerived?.length)return 'giv';const v=currentValues(r,s);if(v.length===2&&v.every(p=>typeof p.events==='number'&&typeof p.total==='number'))return 'binary';if(v.length===2&&v.every(p=>typeof p.mean==='number'))return 'continuous';if(v.length===1&&typeof v[0].effect==='number')return 'giv';return 'unsupported';}
 function approvalRef(r,s,T){const x=T.entrySnapshot(r,s);if(x.legacy||x.unsaved||x.mismatch||!x.frozen.approval.id)throw Error('保存済みの現在版を原著確認・採用してください。');return {approvalId:x.frozen.approval.id,approvalRevision:x.frozen.approval.revision,basis:x.frozen.basis,pointIds:copy(s.pointIds),sourceIds:copy(s.pointIds.map(id=>r.points[id]?.raw?.sourceAnchor?.sourceId)),dimensions:stable(dimensions(r,s)),sourceVersion:stable({points:s.pointIds.map(id=>({raw:r.points[id]?.raw,final:r.points[id]?.decision.finalValue})),sources:r.snapshot.raw.sources.filter(source=>s.pointIds.some(id=>Object.values(r.snapshot.raw.rawValues.find(row=>row.id===id)?.sourceRefs||{}).includes(source.id)))})};}
 function reusable(r,s,D,T){try{return !!s&&s.status==='ACCEPTED'&&D.setEligible(r,s)&&T.validateExportSet(r,s).length===0&&!!approvalRef(r,s,T);}catch(_){return false;}}
 function collectionMeaning(r,s,D){const scoped=copy(r);for(const candidate of Object.values(scoped.resultSets||{}))if(candidate.id!==s.id)candidate.status='HOLD';const covered=new Set(Object.values(scoped.resultSets||{}).flatMap(candidate=>candidate.pointIds||[]));for(const id of Object.keys(scoped.points||{}))if(!covered.has(id)){scoped.resultSets||={};scoped.resultSets['workflow-hidden:'+id]={id:'workflow-hidden:'+id,pointIds:[id],status:'HOLD'};}const rows=(proposal()?proposal().inspect(()=>D.exportBasket([scoped],{format:formatOf(r,s),projectId:r.project.id})):D.exportBasket([scoped],{format:formatOf(r,s),projectId:r.project.id})).rows||[],row=rows[0]||{};const dims=dimensions(r,s);return {type:row.Effect_Type||null,direction:row.Comparison_Direction||null,unit:dims.unit.filter(Boolean).map(norm).sort().join('|'),population:dims.population.filter(Boolean).map(norm).sort().join('|'),adjustment:dims.adjustment.filter(Boolean).map(norm).sort().join('|')};}
 function populationMappingConfirmed(entries,c,a){const P=proposal(),run=c?.aiProposals?.find(r=>r.id===a?.proposal?.runId),table=run&&P?.tables(run,c).find(t=>t.id===a.proposal.tableId);return !!table&&entries.length>0&&entries.every(({record,set})=>{const row=table.rows.find(r=>r.matches.some(m=>m.recordId===record.id&&m.candidateId===set.id)),match=row?.matches.find(m=>m.recordId===record.id&&m.candidateId===set.id);return !!match&&P.mappingConfirmed(record,table,row,match);});}
 function populationWarning(entries,c,a){return populationMappingConfirmed(entries,c,a)&&new Set(entries.map(({record,set})=>dimensions(record,set).population.filter(Boolean).map(norm).sort().join('|')).filter(Boolean)).size>1?'研究ごとに解析集団の記載が異なります。各原著の集団を保持し、この表への対応を人が確認して承認しています。':'';}
 function checkCollectionMeaning(entries,D,c,a){const issues=[];for(const key of ['type','direction','unit','population','adjustment']){if(key==='population'&&populationMappingConfirmed(entries,c,a))continue;const values=new Set(entries.map(({record,set})=>collectionMeaning(record,set,D)[key]).filter(Boolean));if(values.size>1)issues.push('同じ表の'+({type:'効果量の型',direction:'比較方向',unit:'尺度・単位',population:'解析集団',adjustment:'調整状態'}[key])+'が異なります。別の解析用の表に分けてください。');}return issues;}
 function memberState(records,c,m,D,T){if(m.status!=='INCLUDED')return m.status;try{const r=records.find(r=>r.id===m.recordId),s=r?.resultSets?.[m.candidateId],a=c.analyses.find(a=>a.id===m.analysisId);return a&&m.analysisRevision===a.revision&&reusable(r,s,D,T)&&stable(m.ref)===stable(approvalRef(r,s,T))?'INCLUDED':'NEEDS_REVIEW';}catch(_){return 'NEEDS_REVIEW';}}
 function transition(records,command,{D,T,updatedRecord=null}={}){
  const rs=copy(records),c=catalog(rs,command.reviewId);if(c.revision!==command.expectedCatalogRevision)throw Error('採用表が別の操作で更新されています。再表示してから操作してください。');
  const owner=rs.find(r=>r.project.id===c.reviewId&&r.workflowCatalog)||rs.find(r=>r.project.id===c.reviewId);
  if(command.operationId&&c.history.some(h=>h.operationId===command.operationId))return {records:[],catalog:c};
  let r=rs.find(r=>r.id===command.recordId),a=c.analyses.find(a=>a.id===command.analysisId);
  if(updatedRecord){if(!r||r.revision!==command.expectedRevision)throw Error('研究の保存版が変わりました。採用は保存していません。');if(updatedRecord.project.id!==c.reviewId||updatedRecord.id!==r.id)throw Error('研究またはレビューが一致しません。');r=copy(updatedRecord);rs[rs.findIndex(x=>x.id===r.id)]=r;}
  if(command.binding&&(command.binding.studyId!==r?.studyId||command.binding.requestId!==r?.extractionId))throw Error('抽出依頼・研究が変わりました。遅れた応答は適用しません。');
  if(command.binding?.documentHash){const frozen=r?.csvTrace?.approvals?.[command.candidateId],hashes=Object.values(frozen?.values||{}).flatMap(fields=>Object.values(fields).flatMap(v=>(v.sources||[]).map(s=>s.document?.sha256)));if(!hashes.includes(command.binding.documentHash))throw Error('表示・確認したPDFのSHA-256と採用時の出典が一致しません。別PDFの応答は保存しません。');}
  const event={operationId:command.operationId,at:command.at||new Date().toISOString(),actor:command.actor||null,type:command.type,recordId:command.recordId||null,analysisId:command.analysisId||null};
  if(command.type==='CREATE'){
   if(!text(command.name)||!text(command.definition)||!text(command.comparison)||!text(command.window))throw Error('集めるアウトカム、定義、比較、時間窓を入力してください。抽出の事前設定ではありません。');
   if(!['binary','continuous','giv'].includes(command.format))throw Error('表の数値型を選択してください。');
   const oid=command.outcomeId||command.id+':outcome';if(!c.outcomes.some(o=>o.id===oid))c.outcomes.push({id:oid,name:text(command.name),definition:text(command.definition),category:command.category||'other',kind:command.kind||'other',revision:1});
   if(c.analyses.some(x=>x.id===command.id))throw Error('同じ表のIDが存在します。');
   c.analyses.push({id:command.id,outcomeId:oid,label:text(command.name),comparison:text(command.comparison),window:text(command.window),population:text(command.population),resultType:command.resultType,format:command.format,revision:1});c.session={mode:'outcome',analysisId:command.id,recordId:r?.id||null,stopped:false};
  }else if(command.type==='PREPARE'){
   c.prepared=true;c.label=command.label||c.label||'採用データ';
  }else if(command.type==='RENAME'){
   if(!text(command.label))throw Error('名称を入力してください。');if(a)a.label=text(command.label);else c.label=text(command.label);
  }else if(command.type==='REVIEWER'){
   const id=text(command.reviewer?.id);if(!id||id.length>200)throw Error('今回の確認者の氏名または担当者IDを入力してください。');
   c.reviewer={id,kind:'self_declared_local_id',setAt:event.at};event.actor=id;
  }else if(command.type==='SESSION'){
   if(command.analysisId&&!a)throw Error('採用表が見つかりません。');c.positions||={};c.positions[c.session.mode]={...c.session};const nextMode=command.session?.mode;if(nextMode&&nextMode!==c.session.mode)c.session={...c.session,...c.positions[nextMode],mode:nextMode};c.session={...c.session,...command.session};
  }else if(command.type==='PLAN'){if(!text(command.label))throw Error('研究名を入力してください。');c.planned.push({id:command.id,label:command.label});
  }else if(command.type==='STUDY_STATUS'){
   if((!a&&!command.paper)||!['HOLD','EXCLUDED'].includes(command.status)||!studies(rs,c).some(g=>g.id===command.studyId))throw Error('研究の状態が不正です。');
   c.studyStatuses||=[];c.studyStatuses.push({analysisId:command.paper?null:a.id,studyId:command.studyId,status:command.status,at:event.at,actor:event.actor,reason:command.reason||'候補なし・未抽出・資料未接続のため保留'});
  }else if(command.type==='LINK_STUDY'){
   if(!r||!command.studyId||!text(command.reason))throw Error('同研究の別資料として扱う対象と理由が必要です。');c.studyLinks[r.id]={studyId:command.studyId,reason:command.reason};event.reason=command.reason;
  }else if(command.type==='EDIT_DEFINITION'){
   if(!a||!text(command.definition))throw Error('定義を入力してください。');const o=c.outcomes.find(o=>o.id===a.outcomeId);o.definition=command.definition;o.revision++;a.revision++;for(const m of c.members.filter(m=>m.analysisId===a.id&&m.status==='INCLUDED'))m.status='NEEDS_REVIEW';event.reason=command.reason;
  }else if(['ADD','HOLD','EXCLUDE','REMOVE'].includes(command.type)){
   if(!r||r.project.id!==c.reviewId||!a)throw Error('研究・レビュー・採用表の対応が変わりました。');
   if(c.session.stopped)throw Error('確認を停止中です。「再開」を押してください。');
   if(command.type!=='REMOVE'&&(c.session.analysisId!==a.id||c.session.recordId!==r.id))throw Error('別の研究または表に切り替わったため保存しません。');
   const set=r.resultSets?.[command.candidateId]||command.candidate,existing=c.members.find(m=>m.analysisId===a.id&&m.recordId===r.id&&m.candidateId===command.candidateId);
   if(!set)throw Error('元候補がありません。');
   if(command.type==='REMOVE'){if(!existing)throw Error('表への所属がありません。');event.previous=copy(existing);existing.status='REMOVED';}
   else {
    if(command.type==='ADD'&&!reusable(r,set,D,T)){const details=T.validateExportSet(r,set).map(e=>(e.field?e.field+': ':'')+e.message);throw Error('現在版の採用・保存・出典が揃っていません。'+(details.length?[...new Set(details)].join(' / '):'この候補の値・統計量・群・時点と原著の対応を確認してください。')+'「出典を確認・補記」または修正で解決してから再採用してください。');}
    if(command.type==='ADD'&&formatOf(r,set)!==a.format)throw Error('この表と数値型が異なります。型ごとに別の表を作成してください。');
    if(command.type==='ADD'&&a.resultType&&set.resultType!==a.resultType)throw Error('結果種別が異なります。介入前・介入後・変化量・効果推定値は別の表で確認してください。');
    if(!text(command.reason)&&command.type==='ADD')throw Error('原著の定義・比較・実時点・集団をこの表に対応付ける理由を記録してください。');
    const others=c.members.filter(m=>m.analysisId===a.id&&m.status==='INCLUDED'&&m!==existing&&m.studyId===studyKey(r,c));
    if(command.type==='ADD'&&others.length)throw Error('同じ研究の別結果・別報告、または共有対照があります。この表では既存の行を明示的に外してから追加してください。Rawと旧承認は保持します。');
    if(command.type==='ADD'){const entries=c.members.filter(m=>m.analysisId===a.id&&m.status==='INCLUDED'&&m!==existing).map(m=>{const record=rs.find(x=>x.id===m.recordId);return {record,set:record?.resultSets?.[m.candidateId]};}).filter(x=>x.record&&x.set);entries.push({record:r,set});const issues=checkCollectionMeaning(entries,D,c,a);if(issues.length)throw Error(issues.join('\n'));}
    const value={id:existing?.id||command.operationId,analysisId:a.id,analysisRevision:a.revision,outcomeRevision:c.outcomes.find(o=>o.id===a.outcomeId).revision,recordId:r.id,studyId:studyKey(r,c),candidateId:command.candidateId,reason:command.reason||'',status:{ADD:'INCLUDED',HOLD:'HOLD',EXCLUDE:'EXCLUDED'}[command.type],at:event.at,actor:event.actor,ref:command.type==='ADD'?approvalRef(r,set,T):null,original:copy(dimensions(r,set))};
    event.previous=existing?copy(existing):null;if(existing)Object.assign(existing,value);else c.members.push(value);
    c.mappings.push({analysisId:a.id,recordId:r.id,candidateId:command.candidateId,reason:value.reason,status:value.status,at:event.at,actor:event.actor,original:value.original});
   }
  }else if(command.type==='UNDO'){
   const last=[...c.history].reverse().find(h=>['ADD','HOLD','EXCLUDE','REMOVE'].includes(h.type)&&!c.history.some(x=>x.undoOf===h.operationId));if(!last)throw Error('取り消せる表への操作がありません。');
   const m=c.members.find(m=>m.analysisId===last.analysisId&&m.recordId===last.recordId&&m.candidateId===last.candidateId);if(!m)throw Error('対象の所属がありません。');if(last.previous)Object.assign(m,last.previous);else m.status='REMOVED';event.undoOf=last.operationId;
  }else throw Error('未対応の確認操作です。');
  event.candidateId=command.candidateId||null;c.history.push(event);c.revision++;c.updatedAt=event.at;const finalOwner=owner&&rs.find(x=>x.id===owner.id);if(finalOwner)finalOwner.workflowCatalog=c;return {records:[...new Map([...(finalOwner?[finalOwner]:[]),...(updatedRecord?[r]:[])].map(x=>[x.id,x])).values()],catalog:c};
 }
 function projection(records,c,a,D,T,pending={}){
  const members=c.members.filter(m=>m.analysisId===a.id&&m.status==='INCLUDED'),issues=[],selected=[];const seen=new Set();
  if(!members.length)issues.push('この表に保存済みの採用行はありません。');
  for(const m of c.members.filter(m=>m.analysisId===a.id&&m.status==='NEEDS_REVIEW'))issues.push('定義変更により再確認が必要: '+m.recordId);
  for(const m of members){const r=records.find(r=>r.id===m.recordId),s=r?.resultSets?.[m.candidateId];try{
   if(!r||!s||r.project.id!==c.reviewId)throw Error('元候補が見つかりません。');
   if(m.analysisRevision!==a.revision||m.outcomeRevision!==c.outcomes.find(o=>o.id===a.outcomeId).revision)throw Error('表・アウトカムの定義が更新されています。');
   if(stable(m.ref)!==stable(approvalRef(r,s,T)))throw Error('追加後に数値・出典・採用版が変わりました。表へ再追加してください。');
   if(formatOf(r,s)!==a.format)throw Error('型が混在しています。');
   if(a.resultType&&s.resultType!==a.resultType)throw Error('表の結果種別と異なります。');
   const key=studyKey(r,c);if(seen.has(key))throw Error('同研究・別報告・共有対照を重複出力できません。');seen.add(key);
   const restricted=copy(r);for(const set of Object.values(restricted.resultSets||{}))if(set.id!==s.id)set.status='HOLD';
   // Retain all points and fixed approvals; covering singleton sets prevent unrelated legacy decisions leaking into export.
   const covered=new Set(Object.values(restricted.resultSets).flatMap(s=>s.pointIds));for(const id of Object.keys(restricted.points))if(!covered.has(id))restricted.resultSets['workflow-hidden:'+id]={id:'workflow-hidden:'+id,pointIds:[id],status:'HOLD'};
   selected.push({record:restricted,member:m,set:s});
  }catch(e){issues.push((r?.snapshot.raw.study.label||m.recordId)+': '+e.message);}}
  issues.push(...checkCollectionMeaning(selected,D,c,a));const order=new Map(studies(records,c).map((g,i)=>[g.id,i]));selected.sort((a,b)=>order.get(a.member.studyId)-order.get(b.member.studyId));if(!issues.length){const gate=T.preflightExport(selected.map(x=>x.record),D,{format:a.format,projectId:c.reviewId,pending});issues.push(...gate.issues.map(i=>i.message));}
  return {selected,issues,blocked:issues.length>0};
 }
 function outputCore(records,c,analysisId,D,T,{pending={},exportId='collection',exportedAt=new Date().toISOString()}={}){
  const a=c.analyses.find(a=>a.id===analysisId);if(!a)throw Error('表を選択してください。');const p=projection(records,c,a,D,T,pending);if(p.blocked)return {...p,rows:[],csv:'',tsv:''};
  const metadata=['Review_outcome','Review_outcome_definition','Analysis_collection','Analysis_comparison','Analysis_time_window','Original_outcome','Original_definition','Mapping_reason','Actual_timepoint','Analysis_population','Analysis_population_warning','Adjustment','Record_ID','Candidate_ID','Approval_ID','Approval_revision'];
  const common=c.outcomes.find(o=>o.id===a.outcomeId),rows=[],traceRows=[];let columns,traceColumns;
  for(const {record:r,member:m,set:s} of p.selected){const analysis=D.exportBasket([r],{format:a.format,projectId:c.reviewId,pending}),traced=T.buildApprovedWithSourcesRows([r],D,{format:a.format,projectId:c.reviewId,pending,exportId,exportedAt});
   if(analysis.blocked||traced.blocked||analysis.rows.length!==1||traced.rows.length!==1)return {...p,blocked:true,issues:[...(analysis.warnings||[]).map(w=>w.message),...(traced.issues||[]).map(i=>i.message),'全採用行の検査を通過できません。行を省略せず停止しました。'],rows:[],csv:'',tsv:''};
   const dims=dimensions(r,s),outcomes=r.snapshot.raw.outcomes.filter(o=>dims.outcomeIds.includes(o.id));const extra={Review_outcome:common.name,Review_outcome_definition:common.definition,Analysis_collection:a.id,Analysis_comparison:a.comparison,Analysis_time_window:a.window,Original_outcome:outcomes.map(o=>o.reportedName).join(' / '),Original_definition:outcomes.map(o=>o.definition||o.description||o.notes||'未記録').join(' / '),Mapping_reason:m.reason,Actual_timepoint:s.timepoint,Analysis_population:dims.population.join(' / '),Analysis_population_warning:populationWarning(p.selected,c,a),Adjustment:dims.adjustment.join(' / '),Record_ID:r.id,Candidate_ID:s.id,Approval_ID:m.ref.approvalId,Approval_revision:m.ref.approvalRevision};
   columns=[...analysis.columns,...metadata];traceColumns=[...traced.columns,...metadata];rows.push({...analysis.rows[0],...extra});traceRows.push({...traced.rows[0],...extra});
  }
  const numericColumns={binary:['Intervention_Events','Intervention_Total','Comparator_Events','Comparator_Total'],continuous:['Intervention_Mean','Intervention_SD','Intervention_N','Comparator_Mean','Comparator_SD','Comparator_N'],giv:['Effect','SE']}[a.format];
  if(rows.some(row=>numericColumns.some(k=>typeof row[k]!=='number'||!Number.isFinite(row[k]))))return {...p,blocked:true,issues:['数値コピーに必要な数値列が揃っていません。空欄を推測で補いません。'],rows:[],csv:'',tsv:''};
  return {...p,format:a.format,rows,columns,traceRows,traceColumns,csv:T.serializeCsv(D,columns,rows).csv,traceCsv:T.serializeCsv(D,traceColumns,traceRows).csv,tsv:rows.map(r=>numericColumns.map(k=>r[k]).join('\t')).join('\r\n'),numericColumns,signature:stable({catalog:c,records:p.selected.map(x=>x.record)}),exportId,exportedAt};
 }
 function output(records,c,analysisId,D,T,options={}){const fn=()=>outputCore(records,c,analysisId,D,T,options);return proposal()?proposal().withExport(records,c,analysisId,fn):fn();}
 return Object.freeze({VERSION,checkCollectionMeaning,stable,catalog,safetyKind,outcomeInfo,studyKey,studies,dimensions,formatOf,approvalRef,reusable,memberState,transition,projection,output});
});
