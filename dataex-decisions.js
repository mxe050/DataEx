/* Human decisions are separate from immutable AI Raw. No inference or pooling. */
(function(root,factory){const node=typeof module==='object'&&module.exports;const api=factory(node?require('./dataex-results-model.js'):root.DataExResultsModel,node?require('./dataex-ico-mapping.js'):root.DataExICO,node?require('./dataex-paper-model.js'):root.DataExPaperModel);if(node)module.exports=api;if(root)root.DataExDecision=api;})(typeof window==='undefined'?null:window,function(model,ico,paper){
 'use strict';
 const VERSION=1, STATUSES=['CANDIDATE','REVIEWED','ACCEPTED','EDITED','EXCLUDED','HOLD'], FINAL=['ACCEPTED','EDITED'];
 const clone=v=>structuredClone(v), finite=v=>typeof v==='number'&&Number.isFinite(v);
 const numeric=['n','mean','sd','events','total','effect','se','ciLow','ciHigh','eventCount','personTime'];
 const editable=[...numeric,'unit','reviewerNote'];
 const stamp=()=>new Date().toISOString();
 const projectFor=context=>({id:(context?.reviewName||'default').trim()||'default',label:(context?.reviewName||'Review Workspace').trim()||'Review Workspace'});
 const keyFor=(study,project)=>JSON.stringify([project.id,study.raw.pdfId,study.raw.requestId]);
 function make(study,project=projectFor(study.extractionContext)){
  const raw=study.raw, view=model.build(study,study.extractionContext||{}), parent=new Map();
  for(const o of view.clinical){parent.set(o.id,o.id);for(const v of o.variants)parent.set(v.id,o.id);}
  const arms=new Map(raw.study.arms.map(a=>[a.id,a])), outcomes=new Map(raw.outcomes.map(o=>[o.id,o]));
  const record={schemaVersion:VERSION,id:keyFor(study,project),studyId:raw.pdfId,extractionId:raw.requestId,project:clone(project),snapshot:clone(study),points:{},outcomes:{},choices:{arms:{mode:'UNDECIDED',proposalId:null,groups:[]},time:{mode:'ALL',selected:[]}},status:'DRAFT',confirmedAt:null,revision:0,history:[],createdAt:stamp(),updatedAt:stamp()};
  for(const o of raw.outcomes)record.outcomes[o.id]={id:o.id,label:o.reportedName,canonicalLabel:ico.outcome(o,study.extractionContext)?.reviewConcept||o.reportedName,clinical:parent.get(o.id)===o.id,status:'DRAFT',confirmedAt:null,allowIncomplete:false};
  for(const v of view.rawViews){
   const row=v.raw,o=outcomes.get(row.outcomeId),s=row.statistics;
   const value={outcome:o.reportedName,outcomeId:o.id,dataType:o.dataType,armId:row.armId,arm:arms.get(row.armId)?.label||row.population||'',comparatorArmId:row.comparatorArmId,comparatorArm:arms.get(row.comparatorArmId)?.label||'',timepoint:row.timepoint,resultType:row.resultType,population:row.population,nBasis:row.nBasis,unit:o.scale?.unit||'',scale:clone(o.scale),effectType:row.effectMeasure||'',adjustment:row.adjustment||'',sourceAnchor:clone(v.sourceAnchor),sourceRefs:clone(row.sourceRefs)};
   for(const field of numeric)value[field]=field==='effect'?(s.estimate??null):(s[field]??null);
   record.points[row.id]={id:row.id,outcomeId:parent.get(o.id)||o.id,raw:value,decision:{status:'CANDIDATE',finalValue:null,reviewerNote:'',decidedAt:null,editedFields:[]}};
  }return record;
 }
 function assertRecord(r){if(r?.schemaVersion!==VERSION||!r.snapshot?.raw||!r.points||!r.outcomes)throw Error('保存データの形式が異なります。');}
 const values=r=>Object.values(r.points);
 const forOutcome=(r,id)=>values(r).filter(p=>p.outcomeId===id);
 const bulkPoints=(r,id)=>forOutcome(r,id).filter(p=>p.raw.outcomeId===id&&!model.baseline(p.raw.timepoint));
 const value=p=>p.decision.finalValue||p.raw;
 function counts(r){return {confirmed:Object.values(r.outcomes).filter(o=>o.clinical&&o.status==='CONFIRMED').length,hold:values(r).filter(p=>p.decision.status==='HOLD').length,accepted:values(r).filter(p=>FINAL.includes(p.decision.status)).length,excluded:values(r).filter(p=>p.decision.status==='EXCLUDED').length};}
 function warnings(r,id){
  const accepted=forOutcome(r,id).filter(p=>FINAL.includes(p.decision.status)), out=[];
  if(accepted.some(p=>p.raw.dataType==='continuous'&&!p.raw.comparatorArmId&&!finite(value(p).n)))out.push('nは尺度別に未記載。このままn未確定で確定できます。');
  if(accepted.some(p=>p.raw.dataType==='binary'&&(!finite(value(p).events)||!finite(value(p).total))))out.push('events / totalが未確定です。割合から人数を自動計算しません。');
  if(accepted.some(p=>p.raw.dataType==='continuous'&&!p.raw.comparatorArmId&&(!finite(value(p).mean)||!finite(value(p).sd))))out.push('Mean / SDが未確定の値があります。');
  if(forOutcome(r,id).some(p=>p.decision.status==='HOLD'))out.push('保留の値は通常CSVに含めません。');
  return out;
 }
 function validateFinal(v){
  if(typeof v.unit!=='string'||v.unit.length>600)throw Error('Unitを600文字以内で入力してください。');
  for(const k of numeric)if(v[k]!==null&&!finite(v[k]))throw Error(k+'は数値または空欄にしてください。');
  for(const k of ['n','events','total','eventCount'])if(v[k]!==null&&(!Number.isInteger(v[k])||v[k]<0))throw Error(k+'は0以上の整数にしてください。');
  for(const k of ['sd','se','personTime'])if(v[k]!==null&&v[k]<0)throw Error(k+'は0以上にしてください。');
  if(v.events!==null&&v.total!==null&&v.events>v.total)throw Error('eventsがtotalを超えています。');
  if(v.ciLow!==null&&v.ciHigh!==null&&v.ciLow>v.ciHigh)throw Error('CI下限が上限を超えています。');
 }
 // Result-set conflicts use clinical Outcome and actual arm identities, never cell decision state.
 const decisionKey=v=>String(v??'').trim().replace(/\s+/g,' ').toLowerCase();
 function resultSetContext(r,set){
  const points=(set.pointIds||[]).map(id=>r.points[id]).filter(Boolean), c=typeof set.comparison==='object'&&set.comparison?set.comparison:{}, contrast=points.find(p=>p.raw.comparatorArmId), arms=r.snapshot.raw.study.arms||[];
  const known=id=>arms.some(a=>a.id===id)?id:null;
  let intervention=known(c.intervention)||known(c.interventionId)||known(c.interventionArmId), comparator=known(c.comparator)||known(c.comparatorId)||known(c.comparatorArmId);
  if(contrast){intervention=intervention||contrast.raw.armId;comparator=comparator||contrast.raw.comparatorArmId;}
  if(!intervention||!comparator){const ids=[...new Set(points.map(p=>p.raw.armId).filter(Boolean))];if(ids.length===2){intervention=intervention||ids.find(id=>id!==comparator);comparator=comparator||ids.find(id=>id!==intervention);}}
  const outcomeId=points[0]?.outcomeId||set.outcomeId;
  return {projectId:r.project.id,studyId:r.studyId,outcomeId,timepoint:decisionKey(set.timepoint),resultType:decisionKey(set.resultType),intervention,comparator,pair:intervention&&comparator&&intervention!==comparator?[intervention,comparator].sort().join('\u001f'):null};
 }
 function conflictPair(aRecord,a,bRecord,b){
  const x=resultSetContext(aRecord,a),y=resultSetContext(bRecord,b);
  if(x.projectId!==y.projectId||x.studyId!==y.studyId||x.outcomeId!==y.outcomeId||x.timepoint!==y.timepoint||!x.pair||!y.pair)return null;
  let code,message;
  if(x.pair===y.pair&&x.resultType!==y.resultType&&[x.resultType,y.resultType].every(t=>['endpoint','change'].includes(t))){code='ALTERNATIVE_RESULT_TYPE';message='同じStudy・Outcome・Timepointの代替Result typeがすでに採用されています';}
  else if(x.pair!==y.pair&&x.comparator===y.comparator){const control=aRecord.snapshot.raw.study.arms.find(arm=>arm.id===x.comparator)?.label||x.comparator;code='SHARED_CONTROL';message='共有対照があります。同じ'+control+'群を複数比較でそのまま投入すると二重計上になります';}
  const ontology=paper.armOntology(aRecord.snapshot.raw);
  if(ontology.isFactorial){const overlap=paper.armOverlap(aRecord.snapshot.raw,[x.intervention,x.comparator],[y.intervention,y.comparator]);if(overlap.shared.length||overlap.unknown){code='FACTORIAL_DEPENDENCE';message='Factorial contrast / pooled analysis nodeに共有参加者があります。元の割付群・pooled node・別contrastを独立した複数群として重複投入できません'+(overlap.unknown?'（poolの構成群は要確認）':'');}}
  if(!code)return null;
  return {code,kind:code,message,recordId:aRecord.id,recordIds:[aRecord.id,bRecord.id],setId:a.id,setIds:[a.id,b.id],existingSetId:b.id,existingResultType:b.resultType,conflictingSetIds:[b.id],existingSetIds:[b.id],outcomeId:x.outcomeId,timepoint:a.timepoint,controlArmId:code==='SHARED_CONTROL'?x.comparator:null,blocking:true};
 }
 function resultSetConflicts(record,spec){assertRecord(record);return acceptedSets(record).filter(set=>set.id!==spec.id).map(set=>conflictPair(record,spec,record,set)).filter(Boolean);}
 function basketConflicts(records,projectId){
  const entries=basket(records,projectId), conflicts=[];
  for(let i=0;i<entries.length;i++)for(let j=i+1;j<entries.length;j++){const a=entries[i],b=entries[j],c=conflictPair(a.record,a.set,b.record,b.set);if(c)conflicts.push({...c,conflictingSetIds:[a.set.id,b.set.id],existingSetIds:[a.set.id,b.set.id]});}
  return conflicts;
 }
 function apply(record,action){
  assertRecord(record);if(record.status==='LOCKED'&&action.type!=='REOPEN')throw Error('研究はロックされています。再編集で解除してください。');
  const r=clone(record), at=stamp(), changes=[], resolvedResultSets=[], beforeStudy={status:r.status,confirmedAt:r.confirmedAt,choices:clone(r.choices)};
  const touchOutcome=id=>{const o=r.outcomes[id];if(!o)throw Error('Outcomeが見つかりません。');o.status='DRAFT';o.confirmedAt=null;};
  const change=(p,status,patch)=>{
   if(!STATUSES.includes(status))throw Error('不正な確認状態です。');
   const before=clone(p.decision), d=p.decision;d.status=status;d.decidedAt=at;
   if(status==='ACCEPTED'){d.finalValue=d.finalValue||clone(p.raw);if(d.editedFields.length)d.status='EDITED';}
   if(status==='EDITED'){
    const final=clone(d.finalValue||p.raw);for(const [k,v] of Object.entries(patch||{})){if(!editable.includes(k))throw Error('編集できない項目です: '+k);if(k==='reviewerNote')d.reviewerNote=String(v).slice(0,4000);else final[k]=v;}
    validateFinal(final);d.finalValue=final;d.editedFields=[...numeric,'unit'].filter(k=>JSON.stringify(final[k])!==JSON.stringify(p.raw[k]));
   }
   if(action.note!==undefined)d.reviewerNote=String(action.note).slice(0,4000);
   changes.push({pointId:p.id,before,after:clone(d)});
  };
  if(action.type==='POINT'){
   const p=r.points[action.id];if(!p)throw Error('値が見つかりません。');
   // Opening the original is an observation, never automatic acceptance.
   if(action.status==='REVIEWED'&&p.decision.status!=='CANDIDATE')return r;
   change(p,action.status,action.patch);if(action.status!=='REVIEWED')touchOutcome(p.outcomeId);
  }else if(action.type==='RESULT_SET'){
   const spec=action.resultSet||r.resultSets?.[action.id];if(!spec)throw Error('Result setが見つかりません。');
   const ids=[...new Set(spec.pointIds||[])], ps=ids.map(id=>r.points[id]);
   if(!spec.id||!ids.length||ps.some(p=>!p)||new Set(ps.map(p=>p.raw.outcomeId)).size!==1||new Set(ps.map(p=>p.raw.timepoint)).size!==1||new Set(ps.map(p=>p.raw.resultType)).size!==1)throw Error('同じOutcome・時点・Result typeの値を選択してください。');
   if(ps.some(p=>p.outcomeId!==spec.outcomeId)||ps.some(p=>p.raw.timepoint!==spec.timepoint||p.raw.resultType!==spec.resultType))throw Error('表示中のResult setと値が一致しません。');
   if(!['ACCEPTED','EDITED_DRAFT','HOLD','EXCLUDED'].includes(action.status))throw Error('Result setの判断が不正です。');
   if(action.status==='ACCEPTED'&&ps.some(p=>paper.armOntology(r.snapshot.raw).metadata.some(a=>[p.raw.armId,p.raw.comparatorArmId].includes(a.id))))throw Error('Study metadataはTreatment arm・解析比較として採用できません。Rawは保持しています。');
   // Conflict resolution is explicit and atomic. Existing candidates remain in the audit.
   const conflicts=action.status==='ACCEPTED'?resultSetConflicts(r,spec):[];
   if(conflicts.length){
    const expected=[...new Set(conflicts.flatMap(c=>c.conflictingSetIds))].sort(), resolution=action.conflictResolution, supplied=[...new Set(resolution?.conflictingSetIds||[])].sort();
    if(!resolution||!['KEEP_BOTH','REPLACE'].includes(resolution.mode)||JSON.stringify(expected)!==JSON.stringify(supplied)){const error=Error(conflicts.map(c=>c.message).join(' / '));error.code='RESULT_SET_CONFLICT';error.conflicts=conflicts;throw error;}
    if(resolution.mode==='REPLACE'){
     for(const id of expected){const old=r.resultSets[id],before=clone(old);old.status='HOLD';old.decidedAt=at;old.replacedBy=spec.id;resolvedResultSets.push({id,before,after:clone(old)});touchOutcome(old.outcomeId);}
     for(const id of expected)for(const pointId of r.resultSets[id].pointIds){const p=r.points[pointId];if(p&&!ids.includes(pointId)&&!acceptedSets(r).some(s=>s.pointIds.includes(pointId)))change(p,'HOLD');}
    }
   }
   let adoptedDerived=[];
   if(action.useDerived){
    if(action.status!=='ACCEPTED'||ids.length!==1||action.derivedCandidateIds?.length!==1||(action.edits||[]).length)throw Error('換算値は対応する1つの効果量を確認して採用してください。');
    const candidate=(r.derivedCandidates||[]).find(d=>d.id===action.derivedCandidateIds[0]);
    if(!candidate||candidate.status!=='PROPOSED'||candidate.readiness!=='CONVERTIBLE'||!ids.includes(candidate.rawId)||!['LOG_RATIO_CI','LOG_RATIO','EFFECT_CI'].includes(candidate.kind)||!finite(candidate.statistics?.estimate)||!finite(candidate.statistics?.se)||candidate.statistics.se<=0)throw Error('採用可能な換算候補がありません。');
    const p=ps[0],original=r.snapshot.raw.rawValues.find(v=>v.id===p.id),stats=clone(original.statistics);if(p.decision.finalValue)for(const k of numeric)stats[k==='effect'?'estimate':k]=p.decision.finalValue[k]??null;
    if(p.decision.finalValue?.ciLevel!==undefined)stats.ciLevel=p.decision.finalValue.ciLevel;
    if([...new Set([...Object.keys(stats),...Object.keys(candidate.baseStatistics||{})])].some(k=>(stats[k]??null)!==(candidate.baseStatistics?.[k]??null)))throw Error('換算元の値が変わりました。換算候補を確認し直してください。');
    adoptedDerived=[{...clone(candidate),status:'ACCEPTED',acceptedAt:at}];
   }
   for(const edit of action.edits||[]){if(!ids.includes(edit.id))throw Error('別のResult setの値は修正できません。');change(r.points[edit.id],'EDITED',edit.patch);}
   if(action.status==='ACCEPTED')for(const p of ps)change(p,'ACCEPTED');
   if(action.status==='HOLD'||action.status==='EXCLUDED')for(const p of ps)if(!Object.values(r.resultSets||{}).some(s=>s.id!==spec.id&&s.status==='ACCEPTED'&&s.pointIds.includes(p.id)))change(p,action.status);
   r.resultSets=r.resultSets||{};
   const prior=r.resultSets[spec.id];
   r.resultSets[spec.id]={...clone(spec),pointIds:ids,status:action.status,acceptedValues:action.status==='ACCEPTED'?Object.fromEntries(ps.map(p=>[p.id,clone(value(p))])):clone(prior?.acceptedValues||{}),acceptedDerived:action.status==='ACCEPTED'?adoptedDerived:clone(prior?.acceptedDerived||[]),decidedAt:at,acceptedAt:action.status==='ACCEPTED'?at:prior?.acceptedAt||null};
   touchOutcome(spec.outcomeId);
  }else if(action.type==='ADOPT_OUTCOME'){
   touchOutcome(action.id);for(const p of bulkPoints(r,action.id))if(['CANDIDATE','REVIEWED'].includes(p.decision.status))change(p,'ACCEPTED');
  }else if(action.type==='EXCLUDE_OUTCOME'||action.type==='HOLD_OUTCOME'){
   touchOutcome(action.id);for(const p of forOutcome(r,action.id))if(action.type==='EXCLUDE_OUTCOME'||p.decision.status!=='EXCLUDED')change(p,action.type==='EXCLUDE_OUTCOME'?'EXCLUDED':'HOLD');
   r.outcomes[action.id].status=action.type==='EXCLUDE_OUTCOME'?'EXCLUDED':'HOLD';
  }else if(action.type==='REOPEN_OUTCOME'){
   touchOutcome(action.id);
  }else if(action.type==='FINALIZE_OUTCOME'||action.type==='CONFIRM_OUTCOME'){
   const o=r.outcomes[action.id];if(!o)throw Error('Outcomeが見つかりません。');
   if(action.type==='FINALIZE_OUTCOME'){
    if(action.reviewConcept)o.canonicalLabel=String(action.reviewConcept).slice(0,1000);
    for(const edit of action.edits||[]){const p=r.points[edit.id];if(!p||p.outcomeId!==action.id)throw Error('別のOutcomeの修正は確定できません。');change(p,'EDITED',edit.patch);}
    for(const p of bulkPoints(r,action.id))if(['CANDIDATE','REVIEWED'].includes(p.decision.status))change(p,'ACCEPTED');
   }
   if(!forOutcome(r,action.id).some(p=>FINAL.includes(p.decision.status)))throw Error('先にレビューへ採用する値を選んでください。');
   if(warnings(r,action.id).length&&!action.allowIncomplete)throw Error('未確定の項目を確認してください。');
   o.status='CONFIRMED';o.confirmedAt=at;o.allowIncomplete=!!action.allowIncomplete;
   o.reviewMapping=ico.accepted(r,action.id);
  }else if(action.type==='LABEL'){
   if(!r.outcomes[action.id])throw Error('Outcomeが見つかりません。');r.outcomes[action.id].canonicalLabel=String(action.label||r.outcomes[action.id].label).slice(0,1000);touchOutcome(action.id);
  }else if(action.type==='CHOICES'){
   if(action.arms){
    if(!['RECOMMENDED','SEPARATE','EDITED','UNDECIDED'].includes(action.arms.mode))throw Error('群の判断が不正です。');
    const ids=r.snapshot.raw.study.arms.map(a=>a.id), members=(action.arms.groups||[]).flatMap(g=>g.armIds||[]);
    if(members.some(id=>!ids.includes(id))||new Set(members).size!==members.length)throw Error('群の重複・不明な群があります。');
    if(members.length&&members.length!==ids.length)throw Error('元の全群を割り当ててください。');
    r.choices.arms=clone(action.arms);
   }
   if(action.time){const times=new Set(values(r).map(p=>p.raw.timepoint));if(!['ALL','SELECTED','HOLD'].includes(action.time.mode)||action.time.selected.some(t=>!times.has(t))||(action.time.mode==='SELECTED'&&!action.time.selected.length))throw Error('時点の選択を確認してください。');r.choices.time=clone(action.time);}
  }else if(action.type==='CONFIRM_STUDY'){
   if(!counts(r).confirmed)throw Error('少なくとも1つのOutcomeを確定してください。');r.confirmedAt=at;
  }else if(action.type==='LOCK'){
   if(!r.confirmedAt)throw Error('研究を確定してからロックできます。');r.status='LOCKED';
  }else if(action.type==='REOPEN'){r.status='PARTIALLY_CONFIRMED';r.confirmedAt=null;}
  else throw Error('不明な操作です。');
  if(!['CONFIRM_STUDY','LOCK','REOPEN'].includes(action.type)&&!(action.type==='POINT'&&action.status==='REVIEWED'))r.confirmedAt=null;
  if(r.status!=='LOCKED')r.status=r.confirmedAt?'CONFIRMED':(r.history.length||changes.length||action.type!=='POINT')?'PARTIALLY_CONFIRMED':'DRAFT';
  // A later cell edit/hold invalidates adopted sets. Basket export requires re-adoption.
  for(const set of Object.values(r.resultSets||{}))if(set.status==='ACCEPTED'&&!(action.type==='RESULT_SET'&&set.id===(action.resultSet?.id||action.id))&&changes.some(c=>set.pointIds.includes(c.pointId)&&c.after.status!=='REVIEWED'&&(!FINAL.includes(c.after.status)||JSON.stringify(c.before.finalValue)!==JSON.stringify(c.after.finalValue))))set.status='EDITED_DRAFT';
  r.updatedAt=at;r.revision=record.revision+1;
  r.history.push({at,action:action.type,target:action.id||action.resultSet?.id||null,note:action.note||'',changes,beforeStudy,afterStudy:{status:r.status,confirmedAt:r.confirmedAt,choices:clone(r.choices)},beforeOutcome:action.id&&record.outcomes[action.id]?clone(record.outcomes[action.id]):null,outcome:action.id&&r.outcomes[action.id]?clone(r.outcomes[action.id]):null,...(action.type==='RESULT_SET'?{beforeResultSet:clone(record.resultSets?.[action.resultSet?.id||action.id]||null),resultSet:clone(r.resultSets[action.resultSet?.id||action.id]),conflictResolution:clone(action.conflictResolution||null),resolvedResultSets:clone(resolvedResultSets)}:{})});
  return r;
 }
 const MASTER='project study_id study_label design outcome_id outcome_label canonical_outcome timepoint result_type arm comparator_arm data_type n mean sd events total effect_type effect se ci_low ci_high unit scale decision_status source_pdf source_page source_label source_row source_column derivation reviewer_note'.split(' ');
 const HEADERS={
  master:MASTER,audit:[...MASTER,'raw_id','raw_value','final_value','edited_fields','decision_time','decision_history'],
  continuous:'Study Outcome Timepoint Intervention Intervention_N Intervention_Mean Intervention_SD Comparator Comparator_N Comparator_Mean Comparator_SD'.split(' '),
  binary:'Study Outcome Timepoint Intervention Intervention_Events Intervention_Total Comparator Comparator_Events Comparator_Total'.split(' '),
  giv:'Study Outcome Timepoint Effect_Type Effect SE Source_Arm_A Source_Arm_B Comparison_Direction GIV_Order_Contract'.split(' ')
 };
 function csv(columns,rows){
  const cell=v=>{let s=v==null?'':String(v);if(typeof v==='string'&&/^[\s]*[=+@-]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';};
  return '\ufeff'+[columns.map(cell).join(','),...rows.map(r=>columns.map(k=>cell(r[k])).join(','))].join('\r\n')+'\r\n';
 }
 function direction(r,p){const row=r.snapshot.raw.rawValues.find(v=>v.id===p.id);return p.raw.comparatorArmId&&row?paper.comparisonDirection(row,r.snapshot.raw):'';}
 function masterRow(r,p,audit){
  const v=audit?(p.decision.finalValue||p.raw):value(p), a=p.raw.sourceAnchor||{}, o=r.outcomes[p.outcomeId];
  const scale=[v.scale?.min!=null&&v.scale?.max!=null?v.scale.min+'–'+v.scale.max:'',v.scale?.direction].filter(Boolean).join('; ');
  const choices=r.choices.arms.mode==='RECOMMENDED'?'AI群提案を採用（数値は原群のまま）':r.choices.arms.mode==='EDITED'?'群ラベル: '+(r.choices.arms.groups.find(g=>g.armIds.includes(v.armId))?.label||v.arm):'';
  const ontology=paper.armOntology(r.snapshot.raw),metadata=ontology.metadata.some(a=>[p.raw.armId,p.raw.comparatorArmId].includes(a.id)),pooled=ontology.treatmentArms.some(a=>a.pooled&&[p.raw.armId,p.raw.comparatorArmId].includes(a.id));
  return {project:r.project.label,study_id:r.studyId,study_label:r.snapshot.raw.study.label,design:r.snapshot.raw.study.design,outcome_id:v.outcomeId,outcome_label:v.outcome,canonical_outcome:o?.canonicalLabel||v.outcome,timepoint:v.timepoint,result_type:v.resultType,arm:metadata?'':v.arm,comparator_arm:metadata?'':v.comparatorArm,data_type:v.dataType,n:v.n,mean:v.mean,sd:v.sd,events:v.events,total:v.total,effect_type:v.effectType,effect:v.effect,se:v.se,ci_low:v.ciLow,ci_high:v.ciHigh,unit:v.unit,scale,decision_status:p.decision.status,source_pdf:a.pdfFile||r.snapshot.pdf.filename,source_page:a.pdfPage||'',source_label:a.label||'',source_row:a.row||'',source_column:a.column||'',derivation:[metadata?'Study metadata (not a treatment arm)':pooled?'Derived / pooled analysis node':'',v.adjustment,direction(r,p),choices,p.decision.editedFields.length?'人間による修正: '+p.decision.editedFields.join('/'):''].filter(Boolean).join('; '),reviewer_note:p.decision.reviewerNote,comparison_direction:metadata?'':direction(r,p),
   ...(audit?{raw_id:p.id,raw_value:JSON.stringify(p.raw),final_value:JSON.stringify(p.decision.finalValue),edited_fields:p.decision.editedFields.join('; '),decision_time:p.decision.decidedAt,decision_history:JSON.stringify(r.history.filter(h=>h.changes.some(c=>c.pointId===p.id)||h.resolvedResultSets?.some(s=>s.before?.pointIds?.includes(p.id))||h.resultSet?.pointIds?.includes(p.id)||h.target===p.outcomeId||!h.target))}:{})};
 }
 function exportData(records,options={}){
  const format=options.format||'master', columns=HEADERS[format];if(!columns)throw Error('CSV形式が不正です。');
  const audit=format==='audit', rows=[], warnings=[], add=(code,message,r,blocking=false)=>{if(!warnings.some(w=>w.code===code&&w.recordId===r.id&&w.message===message))warnings.push({code,message,recordId:r.id,blocking});};
  const relevant=records.filter(r=>!options.projectId||r.project.id===options.projectId);
  const duplicates=new Set();for(const r of relevant.filter(r=>!audit&&(options.confirmedStudies===false||['CONFIRMED','LOCKED'].includes(r.status)))){const key=JSON.stringify([r.project.id,r.studyId]);if(duplicates.has(key))add('DUPLICATE_STUDY','同じ研究の別抽出版が含まれています。採用する版を1つにしてからCSVを保存してください。',r,true);duplicates.add(key);}
  const held=relevant.reduce((n,r)=>n+counts(r).hold,0);if(held&&!audit)warnings.push({code:'HOLD',message:held+'件の値を保留。確定済みだけをCSV出力します。',blocking:false});
  for(const r of relevant){
   assertRecord(r);
   if(!audit&&isCrossover(r)&&['continuous','binary'].includes(format)){add('CROSSOVER','Cross-over試験は通常の独立2群Mean/SD・events/totalとして出力しません。対応のある比較を確認してください。',r,true);continue;}
   if(!audit&&options.confirmedStudies!==false&&!['CONFIRMED','LOCKED'].includes(r.status))continue;
   if(!audit&&r.choices.time.mode==='HOLD'){add('TIME_HOLD','時点選択を保留しているため、この研究は出力しません。',r);continue;}
   let points=values(r).filter(p=>audit||(FINAL.includes(p.decision.status)&&(options.confirmedOutcomes===false||r.outcomes[p.outcomeId]?.status==='CONFIRMED')&&(r.choices.time.mode!=='SELECTED'||r.choices.time.selected.includes(value(p).timepoint))));
   if(format==='master'||audit){const cross=!audit&&isCrossover(r);if(cross)add('CROSSOVER','Cross-over: 独立2群として直接投入せず、対応のある解析を確認してください。',r);rows.push(...points.map(p=>{const row=masterRow(r,p,audit);if(cross)row.derivation=[row.derivation,'Cross-over: paired analysisを確認'].filter(Boolean).join('; ');return row;}));continue;}
   const pair=options.pairs?.[r.id],ontology=paper.armOntology(r.snapshot.raw), arms=ontology.treatmentArms;
   if(ontology.metadata.some(a=>[pair?.intervention,pair?.comparator].includes(a.id))){add('STUDY_METADATA','All participants等のStudy metadataはTreatment armとしてCSVへ出力できません。',r,true);continue;}
   if(!pair||!arms.some(a=>a.id===pair.intervention)||!arms.some(a=>a.id===pair.comparator)||pair.intervention===pair.comparator){add(arms.length>2?'SHARED_CONTROL':'PAIR_REQUIRED',arms.length>2?'複数群で同じ対照を二重カウントしないよう、出力する1比較を選択してください。':'出力する介入群・比較群を選択してください。',r,true);continue;}
   points=points.filter(p=>!ontology.metadata.some(a=>[p.raw.armId,p.raw.comparatorArmId].includes(a.id)));
   if(ontology.isFactorial){
    const overlap=paper.armOverlap(r.snapshot.raw,[pair.intervention],[pair.comparator]);
    if(overlap.shared.length||overlap.unknown){add('FACTORIAL_DEPENDENCE','元の割付群とpooled nodeに共有参加者、または構成群が未確認のpoolがあります。独立2群CSVへ出力しません。',r,true);continue;}
    add('FACTORIAL_CONTRAST','Factorial trialの1比較です。pooled analysis node・別contrast・元の割付群を独立した追加群として重複投入しないでください。',r);
   }
   if(r.choices.arms.mode==='RECOMMENDED'||r.choices.arms.groups.some(g=>g.armIds.length>1))add('UNPOOLED','統合群の数値は自動合算しません。選択した原著の1比較を出力します。',r);
   const base=v=>({Study:r.snapshot.raw.study.label,Outcome:r.outcomes[points.find(p=>value(p)===v)?.outcomeId]?.canonicalLabel||v.outcome,Timepoint:v.timepoint});
   if(format==='giv'){
    const candidates=points.filter(p=>p.raw.comparatorArmId&&value(p).armId===pair.intervention&&value(p).comparatorArmId===pair.comparator);
    const groups=new Map();for(const p of candidates){const v=value(p),key=JSON.stringify([p.outcomeId,v.timepoint]);groups.set(key,[...(groups.get(key)||[]),p]);}
    for(const group of groups.values()){
     if(group.length!==1){add('AMBIGUOUS_EFFECT','同じOutcome・時点の効果が複数あります。採用する効果を1つにしてください。',r);continue;}
     const v=value(group[0]);
     if(isCrossover(r)&&(!/paired|within[- ]?(?:person|subject)|対応のある|対応解析/i.test(v.adjustment)||/unavailable|unknown|not reported|missing|不足|未報告|不明/i.test(v.adjustment))){add('PAIRED_EFFECT','Cross-overの群間効果に対応解析の確認がありません。GIV出力を保留します。',r,true);continue;}
     if(!finite(v.effect)||!finite(v.se)||v.se<=0){add('MISSING_SE','効果と対応するSEが未確定の行は出力しません。',r);continue;}
     const ratioType=paper.parseEffectType(v.effectType);
     if(ratioType&&!ratioType.isLog){add('LOG_EFFECT','比の効果はlog効果と対応SEを確認してください。自動変換せず出力を保留します。',r);continue;}
     rows.push({...base(v),Effect_Type:v.effectType,Effect:v.effect,SE:v.se,Source_Arm_A:v.arm,Source_Arm_B:v.comparatorArm,Comparison_Direction:v.comparisonDirection||direction(r,group[0]),GIV_Order_Contract:'SOURCE_CONTRAST_V2; arm A/B are stored source order, not review I/C; effect sign unchanged'});
    }continue;
   }
   // An arm's events/total or mean is still an arm-level result when the
   // extractor also retains its comparator ID. Only an actual contrast estimate
   // belongs to GIV; do not silently drop observed arm counts because of that ID.
   points=points.filter(p=>{const v=value(p),armStatistic=v.effect==null&&(format==='binary'?finite(v.events)&&finite(v.total):finite(v.mean));return (!p.raw.comparatorArmId||armStatistic)&&p.raw.dataType===(format==='continuous'?'continuous':'binary')&&p.raw.resultType===(options.resultType||(format==='continuous'?'endpoint':'event'));});
   const groups=new Map();for(const p of points){const v=value(p),key=JSON.stringify([p.outcomeId,v.timepoint,v.resultType]);groups.set(key,[...(groups.get(key)||[]),p]);}
   for(const group of groups.values()){
    const left=group.filter(p=>value(p).armId===pair.intervention),right=group.filter(p=>value(p).armId===pair.comparator);
    if(left.length!==1||right.length!==1){add('PAIR_INCOMPLETE','両群の確定値が1組に定まらない行は出力しません。',r);continue;}
    const a=value(left[0]),b=value(right[0]);
    if(ontology.isFactorial){const raw=r.snapshot.raw,ra=raw.rawValues.find(v=>v.id===left[0].id),rb=raw.rawValues.find(v=>v.id===right[0].id),sa=paper.analysisScope(ra,raw),sb=paper.analysisScope(rb,raw);if(!sa||sa!==sb){add('FACTORIAL_SCOPE','対照値と介入値の表・解析モデルが一致しません。別contrastの調整平均を組み合わせず出力を保留します。',r,true);continue;}}
    if(a.unit!==b.unit||JSON.stringify(a.scale)!==JSON.stringify(b.scale)||(a.population||'').replaceAll(a.arm,'{arm}')!==(b.population||'').replaceAll(b.arm,'{arm}')){add('PAIR_CONTEXT','尺度・単位・解析集団が異なる比較は確認が必要です。',r);continue;}
    if(format==='continuous'){
     if(![a.n,a.mean,a.sd,b.n,b.mean,b.sd].every(finite)||a.n<=0||b.n<=0){add('MISSING_N','n / Mean / SDが未確定の比較は出力しません。',r);continue;}
     rows.push({...base(a),Intervention:a.arm,Intervention_N:a.n,Intervention_Mean:a.mean,Intervention_SD:a.sd,Comparator:b.arm,Comparator_N:b.n,Comparator_Mean:b.mean,Comparator_SD:b.sd});
    }else{
     if(![a.events,a.total,b.events,b.total].every(finite)||a.total<=0||b.total<=0){add('MISSING_EVENTS','events / totalが未確定の比較は出力しません。',r);continue;}
     rows.push({...base(a),Intervention:a.arm,Intervention_Events:a.events,Intervention_Total:a.total,Comparator:b.arm,Comparator_Events:b.events,Comparator_Total:b.total});
    }
   }
  }return {format,columns,rows,warnings,held,blocked:warnings.some(w=>w.blocking),csv:csv(columns,rows)};
 }
 const isCrossover=r=>/cross[\s-]?over|クロスオーバー|交差試験/i.test(r.snapshot.raw.study.design||'');
 const acceptedSets=r=>Object.values(r.resultSets||{}).filter(s=>s.status==='ACCEPTED');
 const comparisonLabel=s=>typeof s.comparison==='string'?s.comparison:s.comparison?.label||'';
 function basket(records,projectId){return records.filter(r=>!projectId||r.project.id===projectId).flatMap(record=>acceptedSets(record).map(set=>({record,set})));}
 function delimited(columns,rows,separator=','){
  const cell=v=>{let s=v==null?'':String(v);if(typeof v==='string'&&/^[\s]*[=+@-]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';};
  return ('\ufeff'+[columns.map(cell).join(separator),...rows.map(r=>columns.map(k=>cell(r[k])).join(separator))].join('\n')+'\n').replace(/\r\n?/g,'\n').replace(/\n/g,'\r\n');
 }
 function exportBasket(records,options={}){
  const format=options.format||'master';if(!['master','continuous','binary','giv'].includes(format))throw Error('採用済みデータの形式が不正です。');
  const entries=basket(records,options.projectId),rows=[],warnings=[],seenStudies=new Map(),usedEffects=new Set(),conflicts=basketConflicts(records,options.projectId);
  const columns=format==='master'?['result_set_id','comparison',...MASTER,'comparison_direction','derived_kind','derived_effect','derived_se','derived_formula','meta_analysis_note']:[...HEADERS[format].slice(0,3),'Result_Type',...HEADERS[format].slice(3)];
  const warn=(code,message,record,set,blocking=false)=>{if(!warnings.some(w=>w.code===code&&w.recordId===record.id&&w.setId===set.id))warnings.push({code,message,recordId:record.id,setId:set.id,blocking});};
  for(const {record:r,set} of entries){
   const setConflicts=conflicts.filter(c=>c.recordIds.some((id,i)=>id===r.id&&c.setIds[i]===set.id));
   for(const conflict of setConflicts)warn(conflict.code,conflict.message+'。解析方針を決めるまで通常のpairwise CSVへ同時出力しません。',r,set,format!=='master');
   if(format!=='master'&&setConflicts.length)continue;
   assertRecord(r);const studyKey=JSON.stringify([r.project.id,r.studyId]),prior=seenStudies.get(studyKey);if(prior&&prior!==r.id)warn('DUPLICATE_STUDY','同じ研究の複数抽出版が採用されています。出力する版を1つにしてください。',r,set,true);seenStudies.set(studyKey,r.id);
   const points=set.pointIds.map(id=>r.points[id]);if(points.some(p=>!p||!set.acceptedValues?.[p.id])){warn('STALE_SET','採用値を再確認して採用し直してください。',r,set,true);continue;}
   const metadata=paper.armOntology(r.snapshot.raw).metadata.some(a=>points.some(p=>[p.raw.armId,p.raw.comparatorArmId].includes(a.id)));
   if(metadata){warn('STUDY_METADATA','Study metadataはTreatment armとしてCSVへ出力しません。Rawと判断履歴は保持しています。',r,set,format!=='master');if(format!=='master')continue;}
   const effectPoint=points.length===1&&points[0].raw.comparatorArmId?points[0]:null;
   if(effectPoint&&['master','giv'].includes(format)){const key=JSON.stringify([r.project.id,r.studyId,effectPoint.id]);if(usedEffects.has(key)){warn('DUPLICATE_EFFECT','同じRaw効果量が複数のResult setで採用されています。1つだけを出力してください。',r,set,true);continue;}usedEffects.add(key);}
   const copy=clone(r);copy.points=Object.fromEntries(points.map(p=>[p.id,{...clone(p),decision:{...clone(p.decision),finalValue:clone(set.acceptedValues[p.id]),status:p.decision.editedFields.length?'EDITED':'ACCEPTED'}}]));
   copy.choices.time={mode:'ALL',selected:[]};const crossover=isCrossover(r),note=crossover?'Cross-over: 対応のある比較を優先。独立2群のevents/total・Mean/SDとして直接投入しない。':r.snapshot.raw.study.arms.length>2?'多群試験：共有対照を複数の独立比較へ重複投入しない。Result set間の同じ対照は同一参加者。':'';
   if(crossover)warn('CROSSOVER',note,r,set,format==='continuous'||format==='binary');
   if(!crossover&&note&&format==='master')warn('SHARED_CONTROL',note,r,set);
   if(format==='master'){rows.push(...Object.values(copy.points).map(p=>{const derived=set.acceptedDerived?.find(d=>d.rawId===p.id);return {result_set_id:set.id,comparison:metadata?'Study metadata':comparisonLabel(set),...masterRow(copy,p,false),derived_kind:derived?.kind||'',derived_effect:derived?.statistics.estimate??null,derived_se:derived?.statistics.se??null,derived_formula:derived?.formula||'',meta_analysis_note:note};}));continue;}
   if(crossover&&(format==='continuous'||format==='binary'))continue;
   if(format==='giv'&&!effectPoint)continue;
   if((format==='continuous'||format==='binary')&&effectPoint)continue;
   let invalidDerived=false;
   if(format==='giv')for(const derived of set.acceptedDerived||[]){
    const p=copy.points[derived.rawId];if(!p||derived.status!=='ACCEPTED')continue;
    if(/^LOG_RATIO/.test(derived.kind)){
     const raw=r.snapshot.raw,row=raw.rawValues.find(v=>v.id===derived.rawId),outcome=raw.outcomes.find(o=>o.id===row?.outcomeId);
     const resolved=row&&paper.resolveEffectType(row,outcome,raw),accepted=derived.effectClassification||paper.parseEffectType(derived.effectType)||paper.parseEffectType(p.raw.effectType);
     if(!resolved?.kind||!accepted?.kind||resolved.kind!==accepted.kind){warn('DERIVED_MEASURE','原著の効果名を再確認し、変換候補を採用し直してください。以前の採用履歴は保持しています。',r,set,true);invalidDerived=true;continue;}
     p.decision.finalValue.effectType=resolved.exportType;
    }else if(derived.kind==='EFFECT_CI'&&derived.effectType)p.decision.finalValue.effectType=derived.effectType;
    p.decision.finalValue.effect=derived.statistics.estimate;p.decision.finalValue.se=derived.statistics.se;p.decision.finalValue.comparisonDirection=derived.comparisonDirection||direction(r,p);
   }
   if(invalidDerived)continue;
   const pointValues=Object.values(copy.points).map(value),comparison=typeof set.comparison==='object'?set.comparison:{},distinct=[...new Set(pointValues.map(v=>v.armId).filter(Boolean))];
   // GIV follows the stored contrast order, independent of clinical comparison labels.
   const contrast=pointValues.find(v=>v.comparatorArmId);
   const pair=format==='giv'&&contrast?{intervention:contrast.armId,comparator:contrast.comparatorArmId}:{intervention:comparison.intervention||comparison.interventionId||distinct[0],comparator:comparison.comparator||comparison.comparatorId||distinct[1]};
   const result=exportData([copy],{format,confirmedStudies:false,confirmedOutcomes:false,resultType:set.resultType,pairs:{[copy.id]:pair}});
   rows.push(...result.rows.map(row=>({...row,Result_Type:set.resultType})));for(const w of result.warnings)warn(w.code,w.message,r,set,w.blocking);
  }
  return {format,columns,rows,warnings,blocked:warnings.some(w=>w.blocking),count:entries.length,csv:delimited(columns,rows),tsv:delimited(columns,rows,'\t')};
 }
 return Object.freeze({VERSION,STATUSES,FINAL,numeric,editable,projectFor,keyFor,make,apply,assertRecord,counts,warnings,value,bulkPoints,forOutcome,exportData,HEADERS,csv,acceptedSets,basket,exportBasket,comparisonLabel,resultSetConflicts,basketConflicts});
});
