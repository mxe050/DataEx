/* Review-only extension. Raw, extraction and statistical resolvers remain authoritative. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root){root.DataExConfirmation=api;root.DataExDecision=api.wrap(root.DataExDecision);}})(typeof window==='undefined'?null:window,()=>{
 'use strict';
 const BUTTON_METHOD='確認・採用ボタンによる本人の表明';
 const VERSION=1,copy=v=>structuredClone(v),stable=v=>JSON.stringify(v),now=()=>new Date().toISOString();
 const fingerprint=p=>stable(p.decision.finalValue||p.raw);
 function pointEligible(r,id){const p=r.points[id],v=r.verification;return !!p&&v?.savedRevision===r.revision&&v.points?.[id]?.status==='CONFIRMED'&&v.points[id].fingerprint===fingerprint(p)&&['ACCEPTED','EDITED'].includes(p.decision.status);}
 function setEligible(r,s){return s.status==='ACCEPTED'&&s.pointIds?.length>0&&s.pointIds.every(id=>pointEligible(r,id))&&s.pointIds.every(id=>stable(s.acceptedValues?.[id])===stable(r.points[id].decision.finalValue||r.points[id].raw));}
 function wrap(base){
  const metaKeys=['timepoint','population','unit','armId','arm','comparatorArmId','comparatorArm','resultType','effectType','adjustment','sourceAnchor','ciLevel'];
  // Project human corrections only while calling the existing decision validator.
  // The stored Raw and extraction snapshot are restored unchanged before returning.
  function finalProjection(record){const r=copy(record);for(const p of Object.values(r.points))if(p.decision.finalValue)for(const key of metaKeys)p.raw[key]=copy(p.decision.finalValue[key]);return r;}
  function finalSpec(record,spec){
   const values=(spec.pointIds||[]).map(id=>record.points[id]).filter(Boolean).map(p=>p.decision.finalValue||p.raw),first=values[0];if(!first)return copy(spec);
   const result={...copy(spec),timepoint:first.timepoint,resultType:first.resultType};
   if(result.comparison&&typeof result.comparison==='object'){
    const c=result.comparison;for(const role of ['intervention','comparator']){const id=c[role],point=(spec.pointIds||[]).map(id=>record.points[id]).find(p=>p?.raw.armId===id);if(point)c[role]=(point.decision.finalValue||point.raw).armId;}
    if(values.length===1&&first.comparatorArmId){c.intervention=first.armId;c.comparator=first.comparatorArmId;}
    const name=id=>record.snapshot.raw.study.arms.find(a=>a.id===id)?.label||id;if(c.intervention&&c.comparator)c.label=name(c.intervention)+' vs '+name(c.comparator);
   }
   return result;
  }
  function validateCard(record,spec){
   const points=spec.pointIds.map(id=>record.points[id]),values=points.map(p=>p.decision.finalValue||p.raw);
   for(const key of ['timepoint','resultType','unit'])if(new Set(values.map(v=>stable(v[key]))).size!==1)throw Error('修正後の時点・結果種別・単位がカード内で一致しません。各群を再確認してください。');
   if(points.some(p=>p.decision.editedFields.includes('population'))&&new Set(values.map(v=>(v.population||'').replaceAll(v.arm||'\u0000','{arm}'))).size!==1)throw Error('修正後の解析集団が一致しません。各群を再確認してください。');
   if(values.length>1&&new Set(values.map(v=>v.armId)).size!==values.length)throw Error('修正後に同じ群が重複しています。群の対応を再確認してください。');
  }
  const resultSetConflicts=(record,spec)=>base.resultSetConflicts(finalProjection(record),finalSpec(record,spec));
  function apply(record,action){
   if(action.operationId&&record.history.some(h=>h.operationId===action.operationId))return copy(record);
   if(action.expectedRevision!=null&&action.expectedRevision!==record.revision)throw Error('表示後に内容が更新されています。保存済み結果を開き直してください。');
   let r,inner=action;
   if(action.type==='UX_CONFIRM_ADOPT'){
    if(action.confirmed!==true)throw Error('数値・統計量・群・尺度・時点・解析集団を原著で確認してください。');
    const ids=action.resultSet?.pointIds||[];
    if(!ids.length||ids.some(id=>!record.points[id]))throw Error('確認する候補がありません。');
    const human=['HUMAN-APPROVAL-CSV-1.0','HUMAN-APPROVAL-CSV-2.0'].includes(action.humanReview?.policy)&&action.confirmationMethod===BUTTON_METHOD&&!!action.traceActor?.trim();
    for(const id of ids){const evidence=action.evidence?.[id],p=record.points[id];if(!evidence?.pdfId||evidence.pdfId!==record.studyId||(!human||evidence.page!=null)&&(!Number.isInteger(evidence.page)||evidence.page<1||evidence.page>record.snapshot.pdf.pageCount))throw Error('対応するPDFとページを確認してください。');if(!human&&!evidence.sourceIds?.length&&!evidence.manualNote?.trim())throw Error('原著位置が不明な場合は手動確認の根拠を記録してください。');if(evidence.manualNote&&evidence.manualNote.length>2000)throw Error('原著注記は2000文字以内にしてください。');if(!p)throw Error('候補が見つかりません。');}
    if(action.confirmationMethod&&action.confirmationMethod!==BUTTON_METHOD)throw Error('確認方法が不正です。採用ボタンから操作してください。');
    if(action.confirmationMethod===BUTTON_METHOD&&action.candidateRevision!==record.revision)throw Error('表示中の版が更新されています。現在の候補を開き直してください。');
    validateCard(record,action.resultSet);
    for(const id of ids){const e=action.evidence[id];if(['wrong-pdf','invalid-page'].includes(e.sourceLocation))throw Error('対応するPDFとページを確認してください。');if(['page','unresolved','multiple'].includes(e.sourceLocation)&&!e.manualNote?.trim()&&action.confirmationMethod!==BUTTON_METHOD)throw Error('未特定・複数候補の根拠は手動確認の記録が必要です。');}
    inner={...action,type:'RESULT_SET',status:'ACCEPTED',resultSet:finalSpec(record,action.resultSet)};
   }
   if(action.type==='UX_MISSING'){
    const p=record.points[action.id],key=action.field==='estimate'?'effect':action.field;
    if(!p||!base.numeric.includes(key)||(p.decision.finalValue||p.raw)[key]!=null)throw Error('空欄の数値項目だけに未報告状態を記録できます。');
    if(!['NOT_EXTRACTED','NOT_REPORTED','ILLEGIBLE','NOT_APPLICABLE'].includes(action.kind))throw Error('未報告状態が不正です。');
    if(!action.reason?.trim()||!action.scope?.trim())throw Error('確認した原著の範囲と理由を記録してください。');
    inner={...action,type:'POINT',status:'HOLD'};
   }
   if(action.type==='UX_UNDO'){
    const last=[...record.history].reverse().find(h=>h.uxUndo&&!record.history.some(x=>x.undoOf===h.operationId));
    if(!last||last.revision!==record.revision)throw Error('直前の確認操作だけを取り消せます。別の変更がある場合は再確認してください。');
    if(record.status==='LOCKED')throw Error('研究はロックされています。');
    r=copy(record);const before=last.uxUndo;
    for(const [id,p] of Object.entries(before.points))r.points[id]=copy(p);
    for(const [id,s] of Object.entries(before.sets)){r.resultSets||={};if(s===null)delete r.resultSets[id];else r.resultSets[id]=copy(s);}
    for(const [id,o] of Object.entries(before.outcomes))r.outcomes[id]=copy(o);
    r.verification||={version:VERSION,points:{}};
    for(const [id,v] of Object.entries(before.verifications)){if(v===null)delete r.verification.points[id];else r.verification.points[id]=copy(v);}
    r.status=before.status;r.confirmedAt=before.confirmedAt;r.revision++;r.updatedAt=now();
    r.history.push({at:r.updatedAt,action:'UX_UNDO',operationId:action.operationId,undoOf:last.operationId,actor:'human / local review',revision:r.revision,target:last.target,note:'直前の確認操作を取消。元履歴・Rawは保持。',changes:Object.keys(before.points).map(id=>({pointId:id,before:copy(record.points[id].decision),after:copy(r.points[id].decision)}))});
    return r;
   }
   r=base.apply(action.type==='UX_CONFIRM_ADOPT'?finalProjection(record):record,inner);if(r.revision===record.revision)return r;
   if(action.type==='UX_CONFIRM_ADOPT')for(const [id,p] of Object.entries(r.points))p.raw=copy(record.points[id].raw);
   for(const edit of action.metadataEdits||[]){
    if(!action.resultSet?.pointIds.includes(edit.id))throw Error('別のカードの情報は修正できません。');
    const p=r.points[edit.id],v=copy(p.decision.finalValue||p.raw),allowed=['timepoint','population','armId','comparatorArmId','resultType','effectType','adjustment','sourceAnchor','ciLevel'];
    for(const [key,value] of Object.entries(edit.patch||{})){
     if(!allowed.includes(key))throw Error('修正対象の項目が不正です。');
     if(['armId','comparatorArmId'].includes(key)){if(value!==null&&!r.snapshot.raw.study.arms.some(a=>a.id===value))throw Error('原著の群を選択してください。');}
     else if(key==='ciLevel'){if(typeof value!=='number'||!Number.isFinite(value)||value<=0||value>=100)throw Error('信頼水準は0より大きく100未満の百分率で入力してください。');}
     else if(key==='resultType'){if(!['endpoint','change','event','effect','other'].includes(value))throw Error('結果種別が不正です。');}
     else if(key==='sourceAnchor'){if(value.pdfId!==r.studyId||!Number.isInteger(value.pdfPage)||value.pdfPage<1||value.pdfPage>r.snapshot.pdf.pageCount)throw Error('手動修正のPDFページを確認してください。');}
     else if(typeof value!=='string'||value.length>2000)throw Error('文字数または形式が不正です。');
     v[key]=copy(value);
    }
    if(v.armId===v.comparatorArmId&&v.armId!==null)throw Error('同じ群を介入と対照に指定できません。');
    v.arm=r.snapshot.raw.study.arms.find(a=>a.id===v.armId)?.label||v.arm;v.comparatorArm=r.snapshot.raw.study.arms.find(a=>a.id===v.comparatorArmId)?.label||'';
    p.decision.finalValue=v;p.decision.status='EDITED';p.decision.editedFields=[...new Set([...p.decision.editedFields,...Object.keys(edit.patch)])];
    const change=r.history.at(-1).changes.find(c=>c.pointId===p.id);if(change)change.after=copy(p.decision);
   }
   if(action.type==='UX_MISSING')r.points[action.id].missing={...r.points[action.id].missing,[action.field]:{kind:action.kind,scope:action.scope.slice(0,2000),reason:action.reason.slice(0,2000),at:r.updatedAt,actor:'human / local review'}};
   const affected=Object.keys(r.points).filter(id=>stable(record.points[id].decision)!==stable(r.points[id].decision));
   for(const set of Object.values(r.resultSets||{}))if(set.status==='ACCEPTED'&&action.type!=='UX_CONFIRM_ADOPT'&&set.pointIds.some(id=>affected.includes(id)&&fingerprint(record.points[id])!==fingerprint(r.points[id])))set.status='EDITED_DRAFT';
   r.verification=copy(record.verification||{version:VERSION,points:{}});
   for(const id of affected)if(action.type!=='UX_CONFIRM_ADOPT'&&action.status!=='REVIEWED')r.verification.points[id]={...r.verification.points[id],status:'NEEDS_REVIEW',at:now()};
   if(action.type==='UX_CONFIRM_ADOPT'){
    const declaration={candidateId:action.resultSet.id,valueRevision:r.revision,sourceRevision:record.revision,method:action.confirmationMethod||'legacy explicit confirmation',actor:action.confirmationMethod?(action.traceActor?.trim()||null):'human / local review',at:r.updatedAt,operationId:action.operationId};
    r.resultSets[action.resultSet.id].humanConfirmation=copy(declaration);
    for(const id of action.resultSet.pointIds)r.verification.points[id]={...copy(declaration),status:'CONFIRMED',fingerprint:fingerprint(r.points[id]),sourceSnapshot:copy({anchor:(r.points[id].decision.finalValue||r.points[id].raw).sourceAnchor,refs:(r.points[id].decision.finalValue||r.points[id].raw).sourceRefs,fields:Object.fromEntries(Object.entries(record.csvTrace?.fields||{}).filter(([key])=>JSON.parse(key)[0]===id))}),evidence:copy(action.evidence[id])};
   }
   const last=r.history.at(-1);
   last.operationId=action.operationId||null;last.revision=r.revision;last.actor=action.type==='POINT'&&action.status==='REVIEWED'?'source navigation':'human / local review';
   if(action.type==='UX_CONFIRM_ADOPT'){last.action='UX_CONFIRM_ADOPT';last.confirmation=copy(r.resultSets[action.resultSet.id].humanConfirmation);last.actor=last.confirmation.actor;}
   if(action.type==='UX_MISSING'){last.action='UX_MISSING';last.missing={kind:action.kind,scope:action.scope,reason:action.reason,field:action.field};}
   if(action.operationId){
    const ids=[...new Set([...affected,...(action.resultSet?.pointIds||[])])],setIds=[...new Set([...Object.keys(record.resultSets||{}),...Object.keys(r.resultSets||{})])].filter(id=>stable(record.resultSets?.[id])!==stable(r.resultSets?.[id]));
    const outcomeIds=Object.keys(r.outcomes).filter(id=>stable(record.outcomes[id])!==stable(r.outcomes[id]));
    last.uxUndo={points:Object.fromEntries(ids.map(id=>[id,copy(record.points[id])])),sets:Object.fromEntries(setIds.map(id=>[id,copy(record.resultSets?.[id]||null)])),outcomes:Object.fromEntries(outcomeIds.map(id=>[id,copy(record.outcomes[id])])),verifications:Object.fromEntries(ids.map(id=>[id,copy(record.verification?.points?.[id]||null)])),status:record.status,confirmedAt:record.confirmedAt};
   }
   return r;
  }
  function gate(records){return records.map(record=>{const r=copy(record);for(const p of Object.values(r.points)){if(!pointEligible(record,p.id)&&base.FINAL.includes(p.decision.status))p.decision.status='CANDIDATE';else if(p.decision.finalValue)p.raw=copy(p.decision.finalValue);}for(const s of Object.values(r.resultSets||{})){if(!setEligible(record,s))s.status=s.status==='ACCEPTED'?'EDITED_DRAFT':s.status;else {const vals=s.pointIds.map(id=>s.acceptedValues[id]);if(new Set(vals.map(v=>v.resultType)).size===1)s.resultType=vals[0].resultType;}}return r;});}
  function exclusion(records,projectId){const relevant=records.filter(r=>!projectId||r.project.id===projectId),n=relevant.reduce((n,r)=>n+Object.values(r.points).filter(p=>base.FINAL.includes(p.decision.status)&&!pointEligible(r,p.id)).length,0);return n?[{code:'HUMAN_CONFIRMATION_REQUIRED',message:`${n}件は人間の原著確認・採用・保存が揃っていないため標準CSVから除外しました。Raw・履歴は監査CSVに保持しています。`,blocking:false}]:[];}
  const exportData=(records,options={})=>{if(options.format==='audit')return base.exportData(records,options);const result=base.exportData(gate(records),options);result.warnings.push(...exclusion(records,options.projectId));return result;};
  const exportBasket=(records,options={})=>{const result=base.exportBasket(gate(records),options);result.warnings.push(...exclusion(records,options.projectId));return result;};
  return Object.freeze({...base,apply,resultSetConflicts,exportData,exportBasket,pointEligible,setEligible});
 }
 // A display adapter only. Existing comparison and statistical guidance are reused unchanged.
 function cards(paper,view){
  const raw=view.raw,arms=new Map(raw.study.arms.map(a=>[a.id,a])),outcomes=new Map(raw.outcomes.map(o=>[o.id,o])),parent=new Map();
  for(const o of view.clinical){parent.set(o.id,o.id);for(const v of o.variants)parent.set(v.id,o.id);}
  const priorities=new Map([...paper.mainOutcomes,...paper.otherOutcomes].map((o,i)=>[o.id,i]));
  return paper.resultSets.map(s=>{const rows=s.rows,first=rows[0].raw,o=outcomes.get(first.outcomeId),c=paper.comparisons.items.find(c=>c.id===s.comparisonId),effect=rows.length===1&&first.comparatorArmId;
   const comparison=effect?{label:`${arms.get(first.armId)?.label||first.armId} vs ${arms.get(first.comparatorArmId)?.label||first.comparatorArmId}`,intervention:first.armId,comparator:first.comparatorArmId}:c?{...c,intervention:c.interventionArmId,comparator:c.comparatorArmId}:{label:s.comparison};
   return {...s,pointIds:s.rawValueIds,outcomeId:parent.get(o.id)||o.id,reportedOutcomeId:o.id,label:o.reportedName,outcome:o,comparison,resultType:first.resultType,displayType:s.resultType,
    grouping:{comparisonId:s.comparisonId,outcomeId:o.id,scale:copy(o.scale),instrument:o.instrument,timepoint:first.timepoint,resultType:first.resultType,populations:[...new Set(rows.map(r=>r.raw.population))],effectType:first.effectMeasure,adjustment:first.adjustment},
    priority:priorities.get(s.outcomeId)??999,detailOnly:!!s.sequenceDetail||!!s.ontologyDetail||s.resultType==='baseline'};
  }).sort((a,b)=>Number(a.detailOnly)-Number(b.detailOnly)||a.priority-b.priority);
 }
 function focusState(record,ids){
  if(!record)return null;
  // The UI needs only this card's edits and transaction metadata, never another copy of Raw/PDF text.
  return {revision:record.revision,status:record.status,points:Object.fromEntries(ids.filter(id=>record.points[id]).map(id=>[id,{id,missing:copy(record.points[id].missing||{}),verification:record.verification?.points?.[id]?.status||'UNCONFIRMED',decision:{status:record.points[id].decision.status,finalValue:copy(record.points[id].decision.finalValue)}}])),
   resultSets:Object.fromEntries(Object.values(record.resultSets||{}).filter(s=>s.pointIds.some(id=>ids.includes(id))).map(s=>[s.id,{status:s.status,verified:setEligible(record,s)}])),
   verifiedCount:Object.values(record.resultSets||{}).filter(s=>setEligible(record,s)).length,
   history:record.history.map(h=>({revision:h.revision,operationId:h.operationId,uxUndo:!!h.uxUndo,undoOf:h.undoOf,resultSetId:h.resultSet?.id}))};
 }
 function nextPending(record,cards,afterId){const start=cards.findIndex(c=>c.id===afterId);for(let offset=1;offset<cards.length;offset++){const card=cards[(start+offset)%cards.length];if(!['ACCEPTED','HOLD','EXCLUDED'].includes(record?.resultSets?.[card.id]?.status))return card.id;}return null;}
 function sourceCandidates(anchor,result,pageText,matches){
  if(['cell','selection','figure'].includes(result?.resolutionStatus))return {status:'LOCATED',candidates:[]};
  const text=result?.matchedText||pageText||'',needle=String(anchor.valueText||'').trim();
  // A value25 must not also match the dose0.25. Keep separate real occurrences.
  const numeric=/^[−–—+-]?\d+(?:[.·]\d+)?%?$/.test(needle);
  const found=matches(text,needle).filter(r=>!numeric||(!/[\d.·−–—+-]/.test(text[r.start-1]||'')&&!/[\d.·]/.test(text[r.end]||'')));
  if(found.length>1)return {status:'MULTIPLE',candidates:found.map((r,i)=>({label:'候補 '+(i+1)+' · PDF p.'+anchor.pdfPage,quote:text.slice(Math.max(0,r.start-60,i?found[i-1].end:0),Math.min(text.length,r.end+60,i+1<found.length?found[i+1].start:text.length))}))};
  return {status:!result?.ok||['page','unresolved'].includes(result.resolutionStatus)?'UNRESOLVED':'CANDIDATE',candidates:[]};
 }
 return Object.freeze({VERSION,BUTTON_METHOD,wrap,cards,focusState,nextPending,sourceCandidates,pointEligible,setEligible,fingerprint});
});
