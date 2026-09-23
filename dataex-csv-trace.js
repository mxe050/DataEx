/* CSV-TRACE-1.0: additive approval snapshots and a portable, value-specific export.
 * No extraction, source search, model invocation or new statistical conversion. */
(function(root,factory){const api=factory(typeof module==='object'&&module.exports?require('./dataex-paper-model.js'):root.DataExPaperModel);if(typeof module==='object'&&module.exports)module.exports=api;if(root){root.DataExCSVTrace=api;root.DataExDecision=api.wrap(root.DataExDecision);}})(typeof window==='undefined'?null:window,(paper)=>{
 const proposal=()=>typeof module==='object'&&module.exports?require('./dataex-ai-proposal.js'):window.DataExAIProposal;
 'use strict';
 const VERSION='CSV-TRACE-1.1', copy=v=>structuredClone(v), stable=v=>JSON.stringify(v), own=(o,k)=>Object.prototype.hasOwnProperty.call(o||{},k);
 // Verification of existing approved conversions only. Never evaluate user formula text.
 const METHOD_VERSION='existing-conversions/1', HARD=new Set(['derivation_input_mismatch','derived_value_mismatch','reported_value_mismatch','fabricated_graph_quote','arithmetic_mismatch','invalid_method','invalid_rounding','invalid_inputs','invalid_origin','unit_mismatch','direction_mismatch','identity_mismatch','derivation_cycle','semantic_version']);
 function conversionField(c,output){
  const parsed=c.effectClassification||paper.parseEffectType(c.effectType),kind=parsed?.kind||null,log=!!parsed?.isLog;
  const precise=['RATE_RATIO','RISK_RATIO'].includes(kind)||/mean difference|\bMD\b/i.test(c.effectType||'')&&!/standardized|\bSMD\b/i.test(c.effectType||'');
  const z=precise?2*1.959964:3.92;
  const descriptor=(id,inputs,formula,calculate)=>({id,inputs,formula,calculate,effectKind:kind,inputScale:log?'log':'natural'});
  if(c.kind==='EFFECT_CI'&&output==='estimate'||['LOG_RATIO_CI'].includes(c.kind)&&log&&output==='estimate')return {identity:'estimate'};
  if(c.kind==='LOG_RATIO'&&output==='se')return {identity:'se'};
  if(['SE_TO_SD','MEAN_CI_NORMAL'].includes(c.kind)&&['mean','n'].includes(output))return {identity:output};
  if(['LOG_RATIO','LOG_RATIO_CI'].includes(c.kind)&&output==='estimate'&&!log)return descriptor('LOG_EFFECT',['effect'],'effect = ln(reported effect)',x=>Math.log(x.effect));
  if(['EFFECT_CI','LOG_RATIO_CI'].includes(c.kind)&&output==='se'){
   const toLog=c.kind==='LOG_RATIO_CI'&&!log,denom=precise?'(2 × 1.959964)':'3.92';
   return descriptor('CI95_SE_'+(toLog?'LOG_':'NATURAL_')+(precise?'Z1959964':'Z196'),['effect','ciLow','ciHigh','ciLevel'],toLog?`SE = (ln(CI upper) − ln(CI lower)) / ${denom}`:`SE = (CI upper − CI lower) / ${denom}`,x=>((toLog?Math.log(x.ciHigh):x.ciHigh)-(toLog?Math.log(x.ciLow):x.ciLow))/z);
  }
  if(c.kind==='COMPLEMENT_COUNT_V1'&&output==='events')return descriptor('COMPLEMENT_COUNT_V1',['total','events'],'deaths = total - alive',x=>x.total-x.events);
  if(c.kind==='SE_TO_SD'&&output==='sd')return descriptor('SE_TO_SD',['se','n'],'SD = SE × sqrt(n)',x=>x.se*Math.sqrt(x.n));
  if(c.kind==='MEAN_CI_NORMAL'&&['se','sd'].includes(output))return descriptor('MEAN_CI95_'+output.toUpperCase(),output==='sd'?['mean','ciLow','ciHigh','ciLevel','n']:['mean','ciLow','ciHigh','ciLevel'],'SE = (CI upper − CI lower) / 3.92'+(output==='sd'?'; SD = SE × sqrt(n)':''),x=>(x.ciHigh-x.ciLow)/3.92*(output==='sd'?Math.sqrt(x.n):1));
  return null;
 }
 function statisticUnit(c,field,value){
  field=field==='derivedEffect'?'effect':field==='derivedSE'?'se':field;
  if(['n','events','total','eventCount'].includes(field))return 'count';
  if(field==='ciLevel')return value>0&&value<=1?'probability':'%';
  if(field==='personTime')return c.person_time_unit||null;
  if(['effect','se','ciLow','ciHigh'].includes(field)&&(paper.parseEffectType(c.effect_type)||/standardized mean difference|\bSMD\b|risk difference|\bRD\b/i.test(c.effect_type||'')))return 'dimensionless';
  return c.outcome_scale_unit||null;
 }
 function traceContext(r,p,v,field,number,derived){
  const raw=r.snapshot.raw.rawValues.find(x=>x.id===p.id),base={...context(r,p,v),effect_type:derived?.effectType||v.effectType,statistic_type:field==='derivedEffect'?(derived?.effectType||'effect'):field==='derivedSE'?'SE':field,outcome_scale_unit:v.unit||null,analysis_unit:raw?.analysisUnit||r.snapshot.raw.study.analysisUnit||null,person_time_unit:raw?.personTimeUnit||null,source_arm_a:v.arm,source_arm_b:v.comparatorArm||null,comparison_direction:derived?.comparisonDirection||paper.comparisonDirection(raw||{},r.snapshot.raw)};
  base.statistic_unit=statisticUnit(base,field,number);base.unit=base.statistic_unit;
  return safe(base);
 }
 function validateSemantics(t){
  const errors=[],add=(code,message)=>errors.push(issue(code,message)),d=t.derivation,c=t.context||{};
  if(t.schema_version!==VERSION){add('semantic_version','旧版の数値別来歴です。旧承認を保持したまま、この候補を新版で再確認・採用してください。');return errors;}
  if(!['direct','derived','graph_digitized'].includes(t.origin))add('invalid_origin','値の由来が不正です');
  if((t.origin==='derived')!==!!d)add('invalid_origin','direct/derivedと計算来歴が一致しません');
  if(c.statistic_unit!==statisticUnit(c,t.field_key,t.final.numeric_value)||c.unit!==c.statistic_unit)add('unit_mismatch','統計値の単位とアウトカム尺度単位が混同されています');
  if(c.source_arm_a!==c.arm||c.source_arm_b!==(c.comparator_arm||null))add('direction_mismatch','原著の対比群と数値の群が一致しません');
  if(t.transfer){
   if(t.origin==='derived'||t.transfer.method!=='IDENTITY'||t.final.numeric_value!==t.transfer.source_value||t.final.numeric_value!==t.raw_extraction.raw_value&&!t.edits.some(e=>e.new_value===t.final.numeric_value))add('identity_mismatch','そのまま引き継ぐ値と元の値が一致しません');
   if(t.transfer.comparison_direction!==c.comparison_direction)add('direction_mismatch','引継ぎ前後の効果方向が一致しません');
  }
  if(!d)return errors;
  const inputs=d.inputs||[],x=Object.fromEntries(inputs.map(i=>[i.field,i.value])),effectInput=inputs.find(i=>i.field==='effect')?.trace;
  const inputType=effectInput?.context.effect_type||c.effect_type,parsed=paper.parseEffectType(inputType);
  const outputField=t.field_key==='derivedEffect'||t.field_key==='effect'?'estimate':t.field_key==='derivedSE'?'se':t.field_key;
  if(d.output_field!==outputField)add('invalid_method','計算の出力フィールドと、この数値のフィールドが一致しません');
  const spec=conversionField({kind:d.formula_id,effectType:inputType,effectClassification:parsed},d.output_field);
  if(!spec||spec.identity||d.method_contract!==METHOD_VERSION||d.method_id!==spec.id||d.formula_text!==spec.formula||d.input_scale!==spec.inputScale||d.effect_kind!==spec.effectKind){add('invalid_method','方法ID・出力フィールド・効果尺度・数値専用の式が一致しません');return errors;}
  if(spec.inputs.length!==inputs.length||new Set(inputs.map(i=>i.field)).size!==inputs.length||spec.inputs.some(k=>!numeric(x[k]))){add('invalid_inputs','必要な計算入力が不足・重複・非数値です');return errors;}
  if(d.formula_id==='COMPLEMENT_COUNT_V1'){const proof=d.applicability_confirmation?.proof;const checked=proposal().complement({total:x.total,alive:x.events,totalRef:'total',aliveRef:'events',population:c.analysis_population,timepoint:c.timepoint,armId:c.arm,proof});if(!checked.eligible)add('invalid_inputs','死亡人数換算の適用条件が満たされません');const sources=d.applicability_confirmation?.conditionSources||[];if(!proof?.sourceIds?.length||proof.sourceIds.some(id=>!sources.some(s=>s.source?.id===id&&s.source.evidenceText&&Number.isInteger(s.source.pdfPage)&&s.document?.sha256)))add('invalid_inputs','換算条件の原文・ページ・資料同一性が未記録です');}
  const ci=own(x,'ciLow');
  if(ci&&(!(x.ciHigh>x.ciLow)||![95,.95].includes(x.ciLevel)||(numeric(x.effect)&&(x.effect<x.ciLow||x.effect>x.ciHigh)))||own(x,'n')&&(!Number.isInteger(x.n)||x.n<=1)||own(x,'se')&&x.se<=0||spec.id==='LOG_EFFECT'&&x.effect<=0||spec.id.includes('_LOG_')&&x.ciLow<=0){add('invalid_inputs','既存変換の適用条件（CI水準・上下限・正値・n）を満たしません');return errors;}
  if(d.comparison_direction&&d.comparison_direction!==c.comparison_direction||effectInput&&effectInput.context.comparison_direction!==c.comparison_direction)add('direction_mismatch','元入力・派生値・出力の比較方向が一致しません');
  const recomputed=spec.calculate(x),tol=Math.max(1,Math.abs(recomputed))*1e-12;
  if(!numeric(recomputed)||!numeric(d.unrounded_result)||Math.abs(recomputed-d.unrounded_result)>tol||d.final_result!==t.final.numeric_value)add('arithmetic_mismatch','方法IDと入力から再計算した値が、未丸め値・出力値と一致しません');
  return errors;
 }

 const FIELDS=['n','mean','sd','events','total','effect','se','ciLow','ciHigh','eventCount','personTime','ciLevel'];
 const COLUMN_FIELDS={n:'n',mean:'mean',sd:'sd',events:'events',total:'total',effect:'effect',se:'se',ci_low:'ciLow',ci_high:'ciHigh',event_count:'eventCount',person_time:'personTime',ci_level:'ciLevel',derived_effect:'derivedEffect',derived_se:'derivedSE'};
 const alias=k=>k==='estimate'?'effect':k, refKey=k=>k==='effect'?'estimate':k, key=(id,field)=>JSON.stringify([id,field]);
 const current=p=>p.decision.finalValue||p.raw, numeric=v=>typeof v==='number'&&Number.isFinite(v), present=v=>v!==null&&v!==undefined&&v!=='';
 const stamp=()=>new Date().toISOString(), genericActor=/^(?:human\s*\/\s*local review|human|local review|source navigation)$/i;
 const actor=a=>typeof a==='string'&&a.trim()&&!genericActor.test(a.trim())?a.trim():null;
 const basename=s=>String(s||'').split(/[\\/]/).pop();
 function text(v){
  if(v==null)return null;
  let s=String(v);
  s=s.replace(/data:(?:application\/pdf|image\/[^;,]+);base64,[A-Za-z0-9+/=\s]+/gi,'[base64 omitted]');
  s=s.replace(/\b(?:[A-Za-z]:[\\/]|file:\/\/\/)[^\s"<>\r\n]*/g,'[local path omitted]');
  s=s.replace(/\b(?:api[_-]?key|access[_-]?token|refresh[_-]?token|authorization|password)\s*[:=]\s*[^\s,;]+/gi,'[credential omitted]');
  s=s.replace(/\bsk-[A-Za-z0-9_-]{16,}/g,'[credential omitted]');
  return s;
 }
 function safeURL(s){try{const u=new URL(s);if(!['https:','http:'].includes(u.protocol))return null;u.username='';u.password='';u.search='';u.hash='';return u.href;}catch(_){return null;}}
 function safe(v){if(typeof v==='string')return text(v);if(Array.isArray(v))return v.map(safe);if(v&&typeof v==='object')return Object.fromEntries(Object.entries(v).filter(([k])=>!/(?:api.?key|token|password|base64|pdfBytes|fileBytes)/i.test(k)).map(([k,x])=>[k,safe(x)]));return v??null;}
 function documentInfo(d={},studyId){return {
  document_id:text(d.document_id)||null,study_id:text(d.study_id||studyId),report_id:text(d.report_id),
  filename:basename(d.filename||d.pdfFile),title:text(d.title||d.label),role:text(d.role),bibliography:text(d.bibliography),doi:text(d.doi),pmid:text(d.pmid),url:safeURL(d.url),
  sha256:/^[a-f\d]{64}$/i.test(d.sha256||'')?d.sha256.toLowerCase():null,byte_size:Number.isSafeInteger(d.byte_size)&&d.byte_size>0?d.byte_size:null,page_count:Number.isSafeInteger(d.page_count)&&d.page_count>0?d.page_count:null,
  hash_method:d.hash_method==='SHA-256/file-bytes'?'SHA-256/file-bytes':null,hashed_at:text(d.hashed_at),relation:safe(d.relation||null)
 };}
 function documentMatch(a,b){return /^[a-f\d]{64}$/i.test(a?.sha256||'')&&/^[a-f\d]{64}$/i.test(b?.sha256||'')?(a.sha256.toLowerCase()===b.sha256.toLowerCase()?'same_bytes':'different_bytes'):'unknown';}
 function sourceInfo(s={},studyId){const d=documentInfo(s.document||{},studyId);return {
  source_id:text(s.source_id||s.id),source_revision:s.source_revision??0,role:s.role||'value',document:d,
  locations:(s.locations||[]).map(l=>({pdf_page_number:Number.isInteger(l.pdf_page_number)?l.pdf_page_number:null,printed_page_label:l.printed_page_label===null?null:text(l.printed_page_label),printed_page_status:l.printed_page_status||'unknown',pdf_page_label:text(l.pdf_page_label),section:text(l.section),region:text(l.region),paragraph:text(l.paragraph),table:text(l.table),figure:text(l.figure),row_label:text(l.row_label),column_label:text(l.column_label),footnote:text(l.footnote),line_start:l.line_basis?l.line_start??null:null,line_end:l.line_basis?l.line_end??null:null,line_basis:safe(l.line_basis||null),rects:safe(l.rects||null),coordinate_space:text(l.coordinate_space),page_rotation:l.page_rotation??null,cropbox:safe(l.cropbox||null),capture_method:text(l.capture_method)})),
  quote_segments:(s.quote_segments||[]).map(q=>({text:text(q.text),role:q.role||'text',location_index:q.location_index??0,capture_method:q.capture_method||'not_recorded',image_verified:q.image_verified??null})),
  prefix:text(s.prefix),suffix:text(s.suffix),normalized_search_text:text(s.normalized_search_text),
  source_confirmation:s.source_confirmation?{actor:actor(s.source_confirmation.actor),at:s.source_confirmation.at||null,status:s.source_confirmation.status||'not_recorded',target_revision:s.source_confirmation.target_revision??null}:null
 };}
 function legacySource(r,p,field){
  // Only an explicit statistic -> source ID edge is followed. Never fall back to a nearby field.
  const v=current(p),id=v.sourceRefs?.[refKey(field)],s=r.snapshot.raw.sources.find(s=>s.id===id);
  if(!s)return [];
  return [sourceInfo({source_id:id,role:'value',document:{study_id:r.studyId,document_id:null,filename:s.pdfFile,title:null,page_count:basename(s.pdfFile)===basename(r.snapshot.pdf.filename)?r.snapshot.pdf.pageCount:null},locations:[{
   pdf_page_number:s.pdfPage,printed_page_label:s.printedPage,printed_page_status:s.printedPage?'known':'unknown',section:s.section,table:/table/i.test(s.tableFigure||'')?s.tableFigure:null,figure:/figure|fig\./i.test(s.tableFigure||'')?s.tableFigure:null,row_label:s.row,column_label:s.column,
   rects:s.rects||null,coordinate_space:s.coordinateSpace||null,capture_method:'existing_source_trace'
  }],quote_segments:s.evidenceText?[{text:s.evidenceText,role:'existing_evidence',capture_method:'not_recorded'}]:[]},r.studyId)];
 }
 function fieldValue(r,p,k,v=current(p)){if(k==='ciLevel')return v.ciLevel??r.snapshot.raw.rawValues.find(x=>x.id===p.id)?.statistics?.ciLevel??null;return v[k]??null;}
 function context(r,p,v){return safe({study:r.snapshot.raw.study.label,study_id:r.studyId,comparison:[v.arm,v.comparatorArm].filter(Boolean).join(' vs '),arm_id:v.armId,arm:v.arm,comparator_arm_id:v.comparatorArmId,comparator_arm:v.comparatorArm,outcome_id:v.outcomeId,outcome:v.outcome,review_outcome:r.outcomes[p.outcomeId]?.canonicalLabel,scale:v.scale,unit:v.unit,timepoint:v.timepoint,time_origin:r.snapshot.extractionContext?.timeOrigin||null,result_type:v.resultType,analysis_population:v.population,denominator_basis:v.nBasis,adjustment:v.adjustment,effect_type:v.effectType});}
 function editsFor(r,id,field){return r.history.flatMap(h=>(h.changes||[]).filter(c=>c.pointId===id).flatMap(c=>{
  const p=r.points[id],a=c.before?.finalValue||p.raw,b=c.after?.finalValue||p.raw;
  if(stable(a[field]??null)===stable(b[field]??null)&&stable(context(r,p,a))===stable(context(r,p,b)))return [];
  return [{old_value:safe(fieldValue(r,p,field,a)),new_value:safe(fieldValue(r,p,field,b)),old_context:context(r,p,a),new_context:context(r,p,b),reason:text(c.after?.reviewerNote||h.note)||null,actor:actor(h.traceActor||h.actor),at:h.at||null,revision:h.revision??null,action:h.action}];
 }));}
 function sourceEdits(r,id,field){return r.history.filter(h=>h.action==='TRACE_EDIT'&&h.pointId===id&&h.field===field).map(h=>({old_source_snapshot:copy(h.beforeTrace||null),new_source_snapshot:copy(h.afterTrace||null),reason:text(h.note),actor:actor(h.actor),at:h.at,revision:h.revision}));}
 function fieldsFor(r,p,v){const raw=r.snapshot.raw.rawValues.find(x=>x.id===p.id),out=FIELDS.filter(k=>fieldValue(r,p,k,v)!=null||raw?.sourceRefs?.[refKey(k)]||r.csvTrace?.fields?.[key(p.id,k)]||p.missing?.[k]);
  if(v.dataType==='continuous'&&!v.comparatorArmId)for(const k of ['mean','n'])if(!out.includes(k))out.push(k);
  if(v.dataType==='binary'&&!v.comparatorArmId)for(const k of ['events','total'])if(!out.includes(k))out.push(k);
  return out;
 }
 function draftFor(r,id,k){return r.csvTrace?.fields?.[key(id,k)]||{};}
 function issue(code,message,path=''){return {code,message,path};}
 function parseReported(s){if(typeof s!=='string')return null;const words=['zero','one','two','three','four','five','six','seven','eight','nine','ten','eleven','twelve','thirteen','fourteen','fifteen','sixteen','seventeen','eighteen','nineteen','twenty'];const word=words.indexOf(s.trim().toLowerCase());if(word>=0)return word;const n=s.trim().replace(/[−–]/g,'-').replace(/·/g,'.').replace(/,/g,'');return /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(n)?Number(n):null;}
 const HUMAN_POLICY='HUMAN-APPROVAL-CSV-1.0', HUMAN_CORRECTION_POLICY='HUMAN-APPROVAL-CSV-2.0';
 const isHumanPolicy=p=>[HUMAN_POLICY,HUMAN_CORRECTION_POLICY].includes(p);
 const HUMAN_SOURCE_WARNINGS=new Set(['missing_reported_value','missing_source','missing_document_identity','missing_location','missing_quote','missing_quote_method','unverified_ocr','unconfirmed_source']);
 const humanBasis=t=>stable({value_id:t.value_id,result_id:t.result_id,revision:t.value_revision,context:t.context,final:t.final,sources:t.sources,reported_value:t.reported_value});
 function humanConfirmed(t){const h=t.human_review,a=t.approval;return isHumanPolicy(h?.policy)&&h.actor===a?.actor_id&&!!h.actor&&h.approved_at===a.approved_at&&!!h.approved_at&&!!h.method&&h.approval_id===a.approval_id&&!!h.approval_id&&h.basis===humanBasis(t)&&a.confirmation_method===BUTTON_METHOD&&!a.legacy;}
 function humanWarning(t,e){return HUMAN_SOURCE_WARNINGS.has(e.code)||t.human_review?.policy===HUMAN_CORRECTION_POLICY&&e.code==='reported_value_mismatch';}
 function validateTrace(t,depth=0){const all=auditTrace(t,depth);return humanConfirmed(t)?all.filter(e=>!humanWarning(t,e)):all;}
 function refreshTraceStatus(t){const all=auditTrace(t);t.provenance_issues=validateTrace(t);t.provenance_warnings=humanConfirmed(t)?all.filter(e=>humanWarning(t,e)):[];t.provenance_status=t.provenance_issues.length?'incomplete':t.provenance_warnings.length?'human_confirmed':'complete';return t;}
 function auditTrace(t,depth=0){const issues=[];if(depth>20)return [issue('derivation_cycle','来歴の循環または深さ上限')];const add=(c,m,p)=>issues.push(issue(c,m,p));
  if(!t.approval?.actor_id)add('missing_reviewer','確認・採用者は記録なし');
  if(!t.approval?.approved_at)add('missing_approval_time','採用日時は記録なし');
  if(t.approval?.legacy)add('missing_approval_snapshot','承認時点の値別出典snapshotは記録なし');
  if(!t.selection?.reason)add('missing_selection_reason','採用理由は未記録');
  if(!t.context.outcome||!t.context.timepoint||!t.context.arm||!t.context.analysis_population)add('ambiguous_context','群・Outcome・時点・解析集団の一部が未記録');
  if(t.final.numeric_value==null){if(!t.final.missing_status)add('missing_value_status','数値は空欄、欠測種別は未記録');if(t.final.missing_status==='NOT_REPORTED'&&(!t.final.missing_scope||!t.final.missing_reason))add('missing_absence_check','記載なしの確認範囲・理由が不足');return issues;}
  issues.push(...validateSemantics(t));
  if(t.origin==='derived'){
   const d=t.derivation;
   if(!d?.formula_text||!d.formula_id||!d.formula_version)add('missing_derivation_method','式・方法・版が不足');
   if(!d?.inputs?.length)add('missing_derivation_input','計算入力が不足');
   for(const [i,input] of (d?.inputs||[]).entries()){
    if(!input.trace)add('missing_derivation_input','計算入力の来歴が未記録です','input.'+i);
    else if(input.trace.final.numeric_value!==input.value)add('derivation_input_mismatch','計算時の入力と確認中の入力値が一致しません','input.'+i);
    for(const e of input.trace?validateTrace(input.trace,depth+1):[])issues.push({...e,path:'input.'+i+(e.path?'.'+e.path:'')});
   }
   if(!d?.applicability_confirmation?.confirmed||!d.applicability_confirmation.actor)add('unconfirmed_assumptions','仮定・適用条件の確認記録が不足');
   if(!d?.rounding?.method||!numeric(d.unrounded_result))add('missing_precision','未丸め値・丸め方法が不足');
   if(d&&numeric(d.unrounded_result)){
    const validRounding=d.rounding?.method==='none'||d.rounding?.method==='decimal_places'&&Number.isInteger(d.rounding.digits)&&d.rounding.digits>=0&&d.rounding.digits<=15;
    if(!validRounding)add('invalid_rounding','丸め方法・桁数が不正です');
    const expected=validRounding&&d.rounding?.method==='decimal_places'?Number(d.unrounded_result.toFixed(d.rounding.digits)):d.unrounded_result;
    if(expected!==t.final.numeric_value)add('derived_value_mismatch','既存の計算結果・丸めと出力値が一致しません');
   }
  }else if(t.origin==='graph_digitized'){
   if(!t.graph?.method||!t.graph.series||!t.graph.point||!t.graph.calibration||!t.graph.precision)add('missing_graph_method','図の系列・点・校正・方法・精度が不足');
   if(t.reported_value?.lexical_value)add('fabricated_graph_quote','図の概算値を原著の数値引用とは扱えません');
  }else{
   if(!present(t.reported_value?.lexical_value))add('missing_reported_value','最終値を支持する原著表記が未記録');
   else if(parseReported(t.reported_value.lexical_value)!==t.final.numeric_value)add('reported_value_mismatch','保存された原著表記と本人が確認した採用値が異なります。原著表記・修正前後の値・担当者を併記しています。換算値はDerivedで扱ってください');
  }
  if(t.origin!=='derived'&&!t.sources.length)add('missing_source','この統計値専用の出典が未記録');
  for(const [i,s] of t.sources.entries()){
   const d=s.document,path='sources.'+i;
   if(!d.document_id||!d.filename||!d.title||!d.role||!d.sha256||!d.byte_size||!d.page_count||d.hash_method!=='SHA-256/file-bytes')add('missing_document_identity','資料名・区分・実PDFのSHA256/サイズ/ページ数が不足',path);
   if(!s.locations.length||s.locations.some(l=>!Number.isInteger(l.pdf_page_number)||l.pdf_page_number<1||(d.page_count&&l.pdf_page_number>d.page_count)||(l.table?(!l.row_label||!l.column_label):!(l.section&&(l.region||l.paragraph)||l.figure))))add('missing_location','PDFページと表行列、または節・段位置を確認してください',path);
   if(!s.quote_segments.some(q=>q.text?.trim()))add('missing_quote','根拠原文が未記録',path);
   if(s.quote_segments.some(q=>!['native_pdf_text','manual_transcription','existing_ocr'].includes(q.capture_method)))add('missing_quote_method','原文の取得方法が未記録',path);
   if(s.quote_segments.some(q=>q.capture_method==='existing_ocr'&&q.image_verified!==true))add('unverified_ocr','OCR原文の画像照合が未記録',path);
   if(s.source_confirmation?.status!=='confirmed'||!s.source_confirmation.actor||!s.source_confirmation.at)add('unconfirmed_source','原文と位置の人間確認・担当者・日時が未記録',path);
  }
  if(t.edits.some(e=>e.old_value!==e.new_value)&&!t.edits.some(e=>e.reason))add('missing_edit_reason','修正理由が未記録');
  if(t.edits.some(e=>(e.old_value!==e.new_value||stable(e.old_context)!==stable(e.new_context))&&(!e.actor||!e.at)))add('missing_edit_actor','修正時の担当者・日時が未記録');
  return issues;
 }
 function locateNativeQuote(source,data,matches){
  // Actual PDF text geometry; never manufacture column or paragraph numbers.
  if(!source.evidenceText||data.page.rotate||!Array.isArray(data.page.view))return null;
  const found=matches(data.raw,source.evidenceText);if(found.length!==1)return null;
  const hit=found[0],items=data.textContent.items.filter(i=>typeof i.str==='string'),[x0,y0,x1,y1]=data.page.view,W=x1-x0,H=y1-y0,rects=[];
  if(!(W>0&&H>0))return null;
  data.spans.forEach((s,i)=>{if(s.end<=hit.start||s.start>=hit.end)return;const item=items[i],t=item?.transform;
   if(!t||Math.abs(t[1])>.01||Math.abs(t[2])>.01||!(item.width>0&&item.height>0))return;
   const x=Math.max(0,(t[4]-x0)/W),y=Math.max(0,(y1-t[5]-item.height)/H);
   rects.push({x,y,width:Math.min(item.width/W,1-x),height:Math.min(item.height/H,1-y)});
  });
  if(!rects.length)return null;
  const left=Math.min(...rects.map(r=>r.x)),right=Math.max(...rects.map(r=>r.x+r.width)),top=Math.min(...rects.map(r=>r.y)),bottom=Math.max(...rects.map(r=>r.y+r.height));
  return {pdf_page_number:source.pdfPage,region:`ページ左上原点: 横${Math.floor(left*100)}–${Math.ceil(right*100)}%、縦${Math.floor(top*100)}–${Math.ceil(bottom*100)}%（PDFテキスト照合）`,rects,coordinate_space:'page-normalized-top-left',capture_method:'unique-native-text-quote-geometry'};
 }
 // Copy only observed file identity and exactly matched existing native-text evidence.
 // This is approval-time provenance, never a mutation of Raw, legacy approvals or source IDs.
 function inheritedEvidence(r,p,field,evidence){
  if(!evidence||evidence.studyId!==r.studyId)return null;
  const row=r.snapshot.raw.rawValues.find(x=>x.id===p.id),sid=row?.sourceRefs?.[refKey(field)],s=r.snapshot.raw.sources.find(s=>s.id===sid);
  if(!s||s.kind==='VISUAL'||!evidence.matchedSourceIds?.includes(sid)||basename(evidence.document?.filename)!==basename(s.pdfFile))return null;
  const value=fieldValue(r,p,field),rawValue=row.statistics?.[refKey(field)];
  if(value!==rawValue)return null; // A revised value needs its own explicitly revised provenance.
  // An adjacent range separator (0.75–0.93, -3.69–-1.56) is not
  // the upper bound's unary minus. Preserve actual signed spellings.
  const nativeNumbers=String(s.evidenceText).replace(/(\d)[–-](?=[−+-]?\d)/g,'$1 ');
  const countWords=['n','events','total','eventCount'].includes(refKey(field))?(String(s.evidenceText).match(/\b(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)\b(?=\s+(?:sub(?:-\s*)?jects?|participants?|patients?|cases?|events?)\b)/gi)||[]):[];
  const lexical=[...(nativeNumbers.match(/[−–+-]?\d+(?:[·.]\d+)?/g)||[]),...countWords].find(x=>parseReported(x)===value);
  const directTokens=String(s.directValue).match(/[−–+-]?\d+(?:[·.]\d+)?/g)||[],directMatch=directTokens.some(x=>parseReported(x)===value)||parseReported(String(s.directValue))===value;
  // A descriptive directValue is not a second required numeric transcription.
  // The explicit field->source edge, unchanged Raw, exact PDF quote and human
  // approval still apply. Contradictory numeric transcriptions stay unresolved.
  const reportedMatch=!!lexical&&(directMatch||(!directTokens.length&&parseReported(String(s.directValue))===null));
  // File identity and exact quote geometry remain observed facts when a PDF
  // font encodes a minus sign as a control glyph. Keep those facts, but leave
  // the numeric transcription unresolved; never guess the glyph's meaning.
  const sources=legacySource(r,p,field);for(const source of sources){source.document=documentInfo({...evidence.document,study_id:r.studyId},r.studyId);for(const q of source.quote_segments)q.capture_method='native_pdf_text';
   const located=evidence.sourceLocations?.[sid];if(located?.pdf_page_number===s.pdfPage&&located.capture_method==='unique-native-text-quote-geometry')source.locations=source.locations.map(l=>l.region||l.table?l:{...l,...copy(located)});
   // A quote/value mismatch must not erase independently observed PDF identity.
   // Keep filename/hash/size/page count and known page metadata, but do not
   // claim that the unresolved quote proves this numeric field.
   if(!reportedMatch)source.quote_segments=[];
  }
  return {sources,reportedValue:reportedMatch?lexical:null};
 }
 function editDefaults(r,set,pointId,field){
  const draft=draftFor(r,pointId,field);if(Object.keys(draft).length)return copy(draft);
  const frozen=r.csvTrace?.approvals?.[set?.id];
  if(!frozen||r.csvTrace.savedRevision!==r.revision||frozen.basis!==basis(r,set))return {};
  const t=frozen.values?.[pointId]?.[field];if(!t||t.origin==='derived'||t.final.numeric_value!==fieldValue(r,r.points[pointId],field))return {};
  // Display defaults only. Editor confirmations remain unchecked; saving a
  // revision still invalidates adoption and records a new TRACE_EDIT action.
  return {sources:copy(t.sources),reportedValue:t.reported_value?.lexical_value||'',origin:t.origin,selectionReason:t.selection?.reason||''};
 }
 const BUTTON_METHOD='確認・採用ボタンによる本人の表明';
 function buildApprovedValueTrace(r,pointId,field,options={}){
  const pathKey=(options.rawInput?'RAW:':'')+key(pointId,field),stack=options.stack||[];if(stack.includes(pathKey))throw Error('来歴の循環参照: '+pathKey);
  const p=r.points[pointId];if(!p)throw Error('来歴の入力値が見つかりません: '+pointId);
  const v=options.rawInput?p.raw:(options.values?.[pointId]||current(p)),draft=options.rawInput?{}:draftFor(r,pointId,field),derived=options.candidate||draft.derivation?.candidate;
  const fieldInCandidate=field==='derivedEffect'?'estimate':field==='derivedSE'?'se':refKey(field),number=options.outputValue!==undefined?options.outputValue:fieldValue(r,p,field,v);
  const a=options.approval||{},revision=a.revision??r.revision;
  const rawRow=r.snapshot.raw.rawValues.find(x=>x.id===pointId);
  const method=derived?conversionField(derived,fieldInCandidate):null;
  if(method?.identity){
   const sourceField=alias(method.identity),identity=buildApprovedValueTrace(r,pointId,sourceField,{...options,candidate:undefined,outputValue:undefined,stack:[...stack,pathKey]});
   identity.field_key=field;identity.value_id=pointId+':'+field;identity.final={...identity.final,numeric_value:number,lexical_value:number==null?null:String(number)};
   identity.transfer={method:'IDENTITY',source_field:sourceField,source_value:fieldValue(r,p,sourceField,v),comparison_direction:text(derived.comparisonDirection||identity.context.comparison_direction)};
   if(identity.human_review)identity.human_review.basis=humanBasis(identity);return refreshTraceStatus(identity);
  }
  const inherited=inheritedEvidence(options.rawInput?{...r,points:{...r.points,[pointId]:{...p,decision:{...p.decision,finalValue:null}}}}:r,options.rawInput?{...p,decision:{...p.decision,finalValue:null}}:p,field,options.evidence);
  const reviewed=options.reviewEvidence?.[pointId];
  // Freeze the explicit review note with this approval. It is an audit statement,
  // not a replacement for the original quote or proof of automatic cell location.
  const review=reviewed&&reviewed.pdfId===r.studyId&&reviewed.fields?.includes(refKey(field))?{
   pdf_page:reviewed.page??null,location_status:reviewed.sourceLocation||null,
   manual_note:text(reviewed.manualNote),located_quote:text(reviewed.locatedQuote),
   scope:'result-review',located_source_id:reviewed.locatedSourceId||null,
   automatic_pdf_page:reviewed.locatedPdfPage??null,
   location_applies_to_value:!!reviewed.locatedSourceId&&reviewed.locatedSourceId===rawRow?.sourceRefs?.[refKey(field)]
  }:null;
  const sources=draft.sources?draft.sources.map(s=>sourceInfo(s,r.studyId)):(inherited?.sources||legacySource(r,p,field));
  const trace={schema_version:VERSION,value_id:pointId+':'+field,value_revision:revision,result_id:options.resultId||pointId,field_key:field,
   context:traceContext(r,p,v,field,number,derived),
   final:{numeric_value:number??null,lexical_value:number==null?null:String(number),missing_status:p.missing?.[field]?.kind||null,missing_scope:text(p.missing?.[field]?.scope),missing_reason:text(p.missing?.[field]?.reason)},
   raw_extraction:{raw_id:pointId,raw_value:fieldValue(r,p,field,p.raw),run_id:r.extractionId,model_version:r.snapshot.raw.modelVersion||null,prompt_version:r.snapshot.raw.coreVersion||null},
   reported_value:present(draft.reportedValue)?{lexical_value:text(draft.reportedValue),source_role:'value'}:(!draft.sources&&inherited?{lexical_value:inherited.reportedValue,source_role:'value'}:null),
   origin:derived?'derived':draft.origin||'direct',sources,edits:options.rawInput?[]:editsFor(r,pointId,field),source_edits:options.rawInput?[]:sourceEdits(r,pointId,field),
   selection:{reason:text(draft.selectionReason||a.selectionReason),rule_id:text(draft.ruleId),rule_version:text(draft.ruleVersion),conflicting_candidates:(draft.conflicts||[]).map(c=>({value:c.value,reason:text(c.reason),sources:(c.sources||[]).map(s=>sourceInfo(s,r.studyId))}))},
   review,graph:safe(draft.graph||null),derivation:null,
   approval:{approval_id:a.id||null,actor_id:actor(a.actor),approved_at:a.at||null,approved_value_revision:revision,approved_source_revision:draft.revision??0,approved_context_revision:revision,confirmation_method:a.method||null,legacy:!!a.legacy},
   provenance_status:'incomplete',provenance_issues:[]};
  if(a.method===BUTTON_METHOD)for(const s of trace.sources)s.source_confirmation={actor:actor(a.actor),at:a.at,status:'confirmed',target_revision:s.source_revision,method:a.method};
  if(derived){
   const allInputs=Array.isArray(derived.inputs)?derived.inputs:Object.entries(derived.inputs||{}).map(([k,value])=>({field:alias(k),value,pointId}));
   if(allInputs.some(i=>!i.rawInput&&key(i.pointId||pointId,alias(i.field||i.key))===pathKey))throw Error('来歴の循環参照: '+pathKey);
   const inputs=method?allInputs.filter(i=>method.inputs.includes(alias(i.field||i.key))):allInputs;
   const data=draft.derivation||{},assumptions=copy(derived.assumptions||[]);
   trace.sources=[];trace.reported_value=null;
   trace.derivation={formula_id:derived.kind||null,formula_version:derived.methodVersion||r.derivedCandidateVersion||null,formula_text:method?.formula||text(derived.formula),output_field:fieldInCandidate,method_id:method?.id||null,method_contract:METHOD_VERSION,effect_kind:method?.effectKind||null,input_scale:method?.inputScale||null,inputs:inputs.map(input=>{
    const id=input.pointId||pointId,f=alias(input.field||input.key),next=buildApprovedValueTrace(r,id,f,{...options,candidate:undefined,outputValue:undefined,rawInput:input.rawInput===true,stack:[...stack,pathKey]});
    return {field:f,value:input.value,raw_input:input.rawInput===true,value_id:id+':'+f,context:copy(next.context),trace:next};
   }),assumptions:assumptions.map(x=>({text:text(typeof x==='string'?x:x.text),origin:typeof x==='object'?x.origin||'method_condition':'method_condition'})),applicability_confirmation:copy(data.applicability||options.applicability||{confirmed:false,actor:null,at:null}),
    unrounded_result:derived.statistics?.[fieldInCandidate]??null,precision:'IEEE-754 binary64; stored numeric precision retained',rounding:copy(data.rounding||{method:'none',description:'保存精度の値をそのまま出力。表示用丸めは適用しない。'}),final_result:number??null,comparison_direction:text(derived.comparisonDirection||null)};
  }
  if(!derived&&rawRow?.confidence<.7&&/visual|figure|graph/i.test(rawRow.adjustment||''))trace.graph||={method:null};
  if(isHumanPolicy(a.humanReview?.policy)&&a.method===BUTTON_METHOD&&actor(a.actor)&&a.id&&a.at){trace.human_review={...copy(a.humanReview),actor:actor(a.actor),approved_at:a.at,approval_id:a.id,basis:humanBasis(trace)};}
  return refreshTraceStatus(trace);
 }
 function basis(r,set){
  const ids=new Set(set.pointIds),visit=(id,f,seen=new Set())=>{const k=key(id,f);if(seen.has(k))return;seen.add(k);const d=draftFor(r,id,f).derivation?.candidate;for(const i of Array.isArray(d?.inputs)?d.inputs:[]){if(i.pointId)ids.add(i.pointId);visit(i.pointId||id,alias(i.field),seen);}};
  for(const id of set.pointIds)for(const f of FIELDS)visit(id,f);
  const values=[...ids].sort().map(id=>({id,value:current(r.points[id]),complementRaw:FIELDS.some(f=>draftFor(r,id,f).derivation?.candidate?.kind==='COMPLEMENT_COUNT_V1')?r.snapshot.raw.rawValues.find(v=>v.id===id):undefined,drafts:FIELDS.map(f=>[f,draftFor(r,id,f)]),missing:r.points[id].missing||{},reviewOutcome:r.outcomes[r.points[id].outcomeId]?.canonicalLabel}));
  const refs=new Set(values.flatMap(x=>[...Object.values(x.value.sourceRefs||{}),...x.drafts.flatMap(([,d])=>d.derivation?.candidate?.proof?.sourceIds||[])]));
  return stable({values,sources:r.snapshot.raw.sources.filter(s=>refs.has(s.id)),pdf:r.snapshot.pdf,derived:set.acceptedDerived||[],comparison:set.comparison,timepoint:set.timepoint,resultType:set.resultType});
 }
 function freezeApproval(r,set,action){
  const approval={id:action.operationId||'approval:'+r.revision,at:r.updatedAt,actor:actor(action.traceActor),revision:r.revision,selectionReason:action.traceSelectionReason||null,method:action.confirmationMethod||null,humanReview:action.type==='UX_CONFIRM_ADOPT'&&action.confirmed===true?copy(action.humanReview||null):null};
  const values={};for(const id of set.pointIds){const p=r.points[id];values[id]={};for(const field of fieldsFor(r,p,set.acceptedValues[id]))values[id][field]=buildApprovedValueTrace(r,id,field,{values:set.acceptedValues,approval,resultId:set.id,evidence:action.traceEvidence,reviewEvidence:action.evidence});
   const d=set.acceptedDerived?.find(d=>d.rawId===id);if(d)for(const [f,k] of [['derivedEffect','estimate'],['derivedSE','se']])values[id][f]=buildApprovedValueTrace(r,id,f,{values:set.acceptedValues,approval,resultId:set.id,evidence:action.traceEvidence,reviewEvidence:action.evidence,candidate:d,outputValue:d.statistics[k],applicability:{confirmed:action.confirmed===true&&action.useDerived===true,actor:actor(action.traceActor),at:r.updatedAt}});
  }
  return {version:VERSION,resultId:set.id,approval,basis:basis(r,set),values};
 }
 function applyTraceEdit(record,action){
  if(record.status==='LOCKED')throw Error('ロック中です。既存の再編集操作で解除してください。');
  if(action.expectedRevision!=null&&record.revision!==action.expectedRevision)throw Error('保存内容が更新されました。補記を開き直してください。');
  if(action.operationId&&record.history.some(h=>h.operationId===action.operationId))return copy(record);
  if(!record.points[action.pointId]||!FIELDS.includes(action.field))throw Error('数値フィールドを選択してください。');
  if(!action.reason?.trim())throw Error('出典補記・訂正の理由を入力してください。');
  const r=copy(record),t=r.csvTrace||={version:VERSION,fields:{},approvals:{}},k=key(action.pointId,action.field),before=copy(t.fields[k]||null),d=copy(action.draft||{});
  if(d.derivation&&!before?.derivation)throw Error('既存の計算候補から選択してください。新しい計算式は追加できません。');
  if(action.candidateId){const c=r.derivedCandidates?.find(c=>c.id===action.candidateId);if(!c||c.rawId!==action.pointId||c.readiness!=='CONVERTIBLE'||!numeric(c.statistics?.[refKey(action.field)]))throw Error('対応する既存の変換候補がありません。');d.origin='derived';d.derivation={candidate:copy(c),applicability:copy(action.applicability||{confirmed:false}),rounding:copy(action.rounding||{method:'none'})};}
  else if(d.derivation&&before?.derivation)d.derivation={...copy(before.derivation),applicability:copy(action.applicability||before.derivation.applicability)};
  if(d.origin==='direct')delete d.derivation;
  d.sources=(d.sources||[]).map(s=>sourceInfo(s,r.studyId));
  for(const s of d.sources){s.source_revision=(before?.revision||0)+1;if(s.source_confirmation?.status==='confirmed')s.source_confirmation={...s.source_confirmation,actor:actor(action.actor),at:stamp(),target_revision:s.source_revision};}
  d.revision=(before?.revision||0)+1;d.updatedAt=stamp();d.updatedBy=actor(action.actor);t.fields[k]=safe(d);
  r.revision++;r.updatedAt=d.updatedAt;
  if(r.verification?.points?.[action.pointId])r.verification.points[action.pointId]={...r.verification.points[action.pointId],status:'NEEDS_REVIEW'};
  const previousSets={};for(const set of Object.values(r.resultSets||{}))if(set.status==='ACCEPTED'){
   const frozen=t.approvals[set.id];if(set.pointIds.includes(action.pointId)||frozen&&frozen.basis!==basis(r,set)){previousSets[set.id]=copy(set);set.status='EDITED_DRAFT';}
  }
  r.history.push({action:'TRACE_EDIT',at:r.updatedAt,revision:r.revision,operationId:action.operationId||null,actor:actor(action.actor),pointId:action.pointId,field:action.field,target:action.pointId,note:text(action.reason),changes:[],beforeTrace:before,afterTrace:copy(t.fields[k]),previousSets});return r;
 }
 function wrap(base){
  if(!base||base.csvTraceVersion===VERSION)return base;
  function apply(record,action){
   if(action.type==='TRACE_EDIT')return applyTraceEdit(record,action);
   if(action.type==='UX_EDIT_VALUE'){
    if(action.operationId&&record.history.some(h=>h.operationId===action.operationId))return copy(record);
    if(action.expectedRevision!==record.revision)throw Error('表示後に内容が更新されました。修正を開き直してください。');
    const t=action.target,p=record.points[t?.pointId],v=p&&current(p),s=action.resultSet;
    if(!p||t.candidateId!==s?.id||!s.pointIds.includes(t.pointId)||!(base.numeric.includes(t.field)||t.field==='ciLevel')||t.armId!==v.armId||t.timepoint!==v.timepoint||t.resultType!==v.resultType||t.effectType!==v.effectType)throw Error('修正対象が一致しません。対象の数値から修正を開き直してください。');
    if(action.value===fieldValue(record,p,t.field,v))return copy(record);
    if(!action.reason?.trim())throw Error('修正理由を入力してください。');
    const edited=base.apply(record,{type:'RESULT_SET',resultSet:s,status:'EDITED_DRAFT',edits:[{id:p.id,patch:{...(t.field==='ciLevel'?{}:{[t.field]:action.value}),reviewerNote:action.reason}}],...(t.field==='ciLevel'?{metadataEdits:[{id:p.id,patch:{ciLevel:action.value}}]}:{}),expectedRevision:record.revision,operationId:action.operationId,traceActor:action.traceActor});
    edited.history.at(-1).traceActor=actor(action.traceActor);edited.history.at(-1).numericTarget=copy(t);
    // The field's source remains versioned separately. Both changes are committed by one store transaction.
    if(action.sourceDraft){const next=applyTraceEdit(edited,{type:'TRACE_EDIT',pointId:p.id,field:t.field,draft:action.sourceDraft,reason:action.reason,actor:action.traceActor,expectedRevision:edited.revision,operationId:action.operationId+':source'});return next;}
    return edited;
   }
   if(action.type==='UX_CONFIRM_ADOPT'&&action.confirmationMethod&&!(action.confirmed===true&&action.humanReview?.policy===HUMAN_CORRECTION_POLICY&&actor(action.traceActor)))for(const id of action.resultSet?.pointIds||[])for(const field of FIELDS){const d=draftFor(record,id,field);if(d.origin!=='derived'&&present(d.reportedValue)&&parseReported(d.reportedValue)!==fieldValue(record,record.points[id],field))throw Error('原著表記と現在値が一致しません（'+id+' / '+field+'）。修正または「出典を確認・補記」で対応を確認してください。');}
   const result=base.apply(record,action);if(result.revision===record.revision)return result;
   if(action.traceActor)result.history.at(-1).traceActor=actor(action.traceActor);
   // Only the actual adoption action may freeze an approval, never a timestamp coincidence or Undo.
   const adoptedId=(action.type==='UX_CONFIRM_ADOPT'||action.type==='RESULT_SET'&&action.status==='ACCEPTED')?(action.resultSet?.id||action.id):null;
   for(const set of Object.values(result.resultSets||{}))if(set.id===adoptedId&&set.status==='ACCEPTED'){
    result.csvTrace||={version:VERSION,fields:{},approvals:{}};
    const previous=result.csvTrace.approvals[set.id];
    if(previous){result.csvTrace.previousApprovals||=[];result.csvTrace.previousApprovals.push(copy(previous));}
    const frozen=freezeApproval(result,set,action),failures=Object.values(frozen.values).flatMap(v=>Object.values(v)).flatMap(t=>validateTrace(t)).filter(e=>HARD.has(e.code));
    if(failures.length)throw Error('採用を保存できません: '+failures.map(e=>e.message).join('；')+'。該当値の出典・既存変換候補を再確認してください。');
    result.csvTrace.approvals[set.id]=frozen;
   }
   if(action.type==='UX_UNDO'&&result.csvTrace){
    // Restoring a previous approval restores its own frozen provenance, not the latest source.
    for(const set of Object.values(result.resultSets||{}))if(set.status==='ACCEPTED'){
     const snapshots=[result.csvTrace.approvals[set.id],...(result.csvTrace.previousApprovals||[]).filter(x=>x.resultId===set.id)].filter(Boolean),match=snapshots.find(x=>x.approval.at===set.acceptedAt&&x.basis===basis(result,set));
     if(match)result.csvTrace.approvals[set.id]=copy(match);
    }
   }
   return result;
  }
  function guardedExport(records,options={},method){
   const out=base[method](records,options);if(options.format==='audit')return out;
   const gate=preflightExport(records,base,options,out);const extra=proposal()?.exportIssues(records)||[];if(extra.length){gate.issues.push(...extra);gate.blocked=true;}
   if(!gate.blocked)return out;
   return {...out,blocked:true,rows:[],csv:'',tsv:'',warnings:[...out.warnings,...gate.issues]};
  }
  const wrapped=Object.freeze({...base,apply,exportBasket:(records,options)=>guardedExport(records,options,'exportBasket'),exportData:(records,options)=>guardedExport(records,options,'exportData'),csvTraceVersion:VERSION,exportGateVersion:EXPORT_GATE_VERSION});
  exportBases.set(wrapped,base);return wrapped;
 }
 const none=x=>present(x)?String(x):'記録なし';
 function sourceLines(s,index){const d=s.document,lines=[`【資料${index+1}】${none(d.title)}／${none(d.filename)}／${none(d.role)}；SHA-256=${none(d.sha256)}；${none(d.byte_size)} bytes；${none(d.page_count)} pages`];
  if(d.bibliography||d.doi||d.pmid)lines.push(`【書誌】${[d.bibliography,d.doi&&'DOI='+d.doi,d.pmid&&'PMID='+d.pmid].filter(Boolean).join('／')}`);
  for(const l of s.locations){lines.push(`【位置】PDF ${none(l.pdf_page_number)}/${none(d.page_count)}頁／誌面${l.printed_page_status==='none'?'なし':l.printed_page_status==='known'?none(l.printed_page_label):'不明'}／${[l.region,l.section,l.paragraph,l.table,l.figure].filter(Boolean).join('／')||'詳細位置未記録'}`);if(l.row_label||l.column_label||l.footnote)lines.push(`【表の位置】行「${none(l.row_label)}」／列「${none(l.column_label)}」／脚注${none(l.footnote)}`);if(l.line_basis&&l.line_start!=null)lines.push(`【行位置】${l.line_start}–${l.line_end??l.line_start}；基準=${typeof l.line_basis==='string'?l.line_basis:stable(l.line_basis)}`);}
  for(const q of s.quote_segments)lines.push(`【根拠原文・${q.role}】「${none(q.text)}」（取得=${q.capture_method}）`);
  lines.push(`【出典確認】${none(s.source_confirmation?.actor)}／${none(s.source_confirmation?.at)}／${s.source_confirmation?.status||'未記録'}`);return lines;
 }
 function formatSourceNote(t,depth=0){
  const c=t.context,lines=[`【値】${t.field_key}=${t.final.numeric_value==null?'空欄':t.final.numeric_value}；${none(c.outcome)}；${none(c.arm)}；${none(c.timepoint)}；${none(c.result_type)}；統計値の単位=${none(c.statistic_unit)}；アウトカム尺度単位=${none(c.outcome_scale_unit)}；解析単位（原記録）=${none(c.analysis_unit)}；解析集団=${none(c.analysis_population)}`];
  if(c.comparison_direction)lines.push('【原著の対比・方向】'+none(c.source_arm_a)+' / '+none(c.source_arm_b)+'；'+c.comparison_direction+'；レビューI/Cとは独立、符号変更なし');
  if(t.transfer)lines.push('【そのままの引継ぎ】'+t.transfer.source_field+'='+t.transfer.source_value+'。SEの計算をこの効果値へ適用していません。');
  if(t.final.numeric_value==null)lines.push(`【欠測状態】${none(t.final.missing_status)}；確認範囲=${none(t.final.missing_scope)}；理由=${none(t.final.missing_reason)}`);
  lines.push(`【由来】${t.origin==='derived'?'計算値。この数値の直接記載箇所はない。':t.origin==='graph_digitized'?'図からの概算。架空の数値引用は作らない。':t.edits.some(e=>e.old_value!==e.new_value)?'人間が候補を修正して採用':'原著から直接採用（原表記の照合状態は下記）'}`);
  lines.push(`【AI候補】${none(t.raw_extraction.raw_value)}；【原著表記】${none(t.reported_value?.lexical_value)}；【最終値】${none(t.final.numeric_value)}`);
  for(const e of t.edits){lines.push(`【修正】${none(e.old_value)} → ${none(e.new_value)}；理由=${none(e.reason)}；修正者=${none(e.actor)}／${none(e.at)}`);
   const changed=Object.keys(e.new_context||{}).filter(k=>stable(e.old_context?.[k])!==stable(e.new_context[k]));if(changed.length)lines.push('【文脈の修正】'+changed.map(k=>k+': '+none(typeof e.old_context?.[k]==='object'?stable(e.old_context[k]):e.old_context?.[k])+' → '+none(typeof e.new_context[k]==='object'?stable(e.new_context[k]):e.new_context[k])).join('；'));
  }
  for(const e of t.source_edits)lines.push(`【出典改訂】${none(e.reason)}；担当者=${none(e.actor)}／${none(e.at)}；前版=${e.old_source_snapshot?.revision??0}→${e.new_source_snapshot?.revision??0}`);
  t.sources.forEach((s,i)=>lines.push(...sourceLines(s,i)));
  if(t.derivation){const d=t.derivation;lines.push(`【計算】${none(d.formula_text)}；方法=${none(d.formula_id)}／${none(d.formula_version)}`);
   d.inputs.forEach((input,i)=>{lines.push(`【入力${i+1}】${input.field}=${none(input.value)}`);lines.push(formatSourceNote(input.trace,depth+1));});
   lines.push(`【仮定・適用条件】${d.assumptions.map(a=>a.text+'（'+a.origin+'）').join('；')||'記録なし'}`,`【条件確認】${d.applicability_confirmation.confirmed?'確認済み':'未確認'}／${none(d.applicability_confirmation.actor)}／${none(d.applicability_confirmation.at)}`,`【精度・丸め】未丸め=${none(d.unrounded_result)}；${none(d.precision)}；${stable(d.rounding)}；出力=${none(d.final_result)}`);
    for(const s of d.applicability_confirmation.conditionSources||[])lines.push('【適用条件の原著根拠】'+stable(s));
    if(d.comparison_direction)lines.push('【比較方向】'+d.comparison_direction);
  }
  if(t.graph)lines.push('【図読み取り】'+stable(t.graph));
  lines.push(`【採用理由】${none(t.selection.reason)}`);
  if(t.review){
   lines.push(`【確認操作の記録・結果単位】確認時の指定ページ=${none(t.review.pdf_page)}；この数値専用の出典ページは上の【位置】を参照`);
   if(t.review.location_applies_to_value)lines.push(`【この数値の自動照合】PDF ${none(t.review.automatic_pdf_page)}頁；自動位置状態=${none(t.review.location_status)}（確認・採用の表明とは別）`);
   else lines.push(`【結果内の直前の位置確認】自動位置状態=${none(t.review.location_status)}；この統計値の位置特定を意味しません`);
   if(t.review.manual_note)lines.push('【確認時の補記】'+t.review.manual_note);
  }
  for(const alternative of t.selection.conflicting_candidates||[]){lines.push(`【比較した別報告】値=${none(alternative.value)}；判断=${none(alternative.reason)}`);alternative.sources.forEach((s,i)=>lines.push(...sourceLines(s,i)));}
  lines.push(`【確認・採用】${none(t.approval.actor_id)}／${none(t.approval.approved_at)}；確認方法=${none(t.approval.confirmation_method)}；採用ID=${none(t.approval.approval_id)}；値版=${t.value_revision}／出典版=${t.approval.approved_source_revision}／文脈版=${t.approval.approved_context_revision}`);
  if(humanConfirmed(t))lines.push('【人による原著確認】'+t.human_review.method+'；担当者='+t.human_review.actor+'；承認日時='+t.human_review.approved_at+'。未記録の出典項目は自動照合済みを意味しません。');
  const sourceWarnings=[...t.provenance_issues,...(t.provenance_warnings||[])];if(sourceWarnings.length)lines.push('【出典不足・未記録】'+sourceWarnings.map(e=>e.code+': '+e.message+(e.path?' ('+e.path+')':'')).join('；'));
  return lines.join('\n');
 }
 function serializeCsv(base,columns,rows,{maxCellLength=32767}={}){
  const output=rows.map(row=>{const safeRow=copy(row),escapes={};for(const column of columns){const value=safeRow[column];if(typeof value==='string'&&/^\s*[=+@-]/.test(value))escapes[column]={original:value,method:'prefix_apostrophe',exported:"'"+value};}
   safeRow.text_escapes_json=stable(escapes);for(const [column,v] of Object.entries(safeRow))if(String(v??'').length>maxCellLength)throw Error(`CSVセル上限${maxCellLength}文字を超えました: ${column}。切り捨てず出力を停止しました。`);return safeRow;});
  return {rows:output,csv:base.csv(columns,output)};
 }
 const EXPORT_GATE_VERSION='OUTPUT-GATE-1.0', exportBases=new WeakMap();
 const exportFields=format=>format==='master'?COLUMN_FIELDS:format==='continuous'?{Intervention_N:'n',Intervention_Mean:'mean',Intervention_SD:'sd',Comparator_N:'n',Comparator_Mean:'mean',Comparator_SD:'sd'}:format==='binary'?{Intervention_Events:'events',Intervention_Total:'total',Comparator_Events:'events',Comparator_Total:'total'}:{Effect:'effect',SE:'se'};
 function validateExportSet(r,set,{allowIncomplete=false}={}){
  const issues=[],add=(code,message,field)=>issues.push({code,message,field,recordId:r.id,resultId:set.id,setId:set.id,blocking:true}),frozen=r.csvTrace?.approvals?.[set.id];
  if(!frozen?.approval?.id||!frozen.approval.at||frozen.approval.legacy){add('APPROVAL_MISSING','採用時の記録がありません。対象候補を明示的に再確認・採用し、保存してください。');return issues;}
  if(frozen.version!==VERSION){add('semantic_version','旧版の採用記録です。旧承認を保持したまま、対象候補を再確認・採用してください。');return issues;}
  if(r.csvTrace.savedRevision!==r.revision||r.verification?.savedRevision!==r.revision)add('UNSAVED','採用記録または確認状態が未保存です。保存完了を確認してプレビューを更新してください。');
  if(frozen.resultId!==set.id||frozen.approval.at!==set.acceptedAt||frozen.approval.revision>r.revision)add('REVISION_MISMATCH','採用対象・日時・版が一致しません。対象候補を再確認・採用してください。');
  try{if(frozen.basis!==basis(r,set))add('REVISION_MISMATCH','数値・出典・派生入力が採用時の版と一致しません。変更内容を確認し、明示的に再採用・保存してください。');}catch(_){add('APPROVAL_MISSING','採用対象または依存する数値がありません。対象候補を開き直してください。');return issues;}
  for(const id of set.pointIds){
   const p=r.points[id],v=set.acceptedValues?.[id];
   if(!p||!v){add('APPROVAL_MISSING','採用した数値がありません。対象候補を再確認してください。');continue;}
   if(stable(v)!==stable(current(p)))add('VALUE_MISMATCH','現在値と採用値が一致しません。修正内容を再確認・採用してください。',id);
   const derived=set.acceptedDerived?.find(d=>d.rawId===id),fields=new Set([...fieldsFor(r,p,v),...Object.keys(frozen.values?.[id]||{}),...(derived?['derivedEffect','derivedSE']:[])]);
   for(const field of fields){
    const t=frozen.values?.[id]?.[field],actual=field==='derivedEffect'?derived?.statistics.estimate??null:field==='derivedSE'?derived?.statistics.se??null:fieldValue(r,p,field,v);
    if(!t){if(actual!=null)add('APPROVAL_MISSING','書き出す数値に対応する採用時の記録がありません。再確認・採用してください。',id+':'+field);continue;}
    if(t.field_key!==field||t.value_id!==id+':'+field||t.result_id!==set.id||t.raw_extraction?.raw_id!==id||t.approval?.approval_id!==frozen.approval.id||t.approval?.approved_at!==frozen.approval.at||t.value_revision!==frozen.approval.revision||t.approval?.approved_value_revision!==frozen.approval.revision||t.approval?.approved_context_revision!==frozen.approval.revision||t.approval?.approved_source_revision!==(draftFor(r,id,field==='derivedEffect'&&t.transfer?'effect':field).revision??0))add('REVISION_MISMATCH','数値・出典の対象または採用版が一致しません。再確認・採用してください。',id+':'+field);
    if(actual!==t.final?.numeric_value)add('VALUE_MISMATCH','実際に書き出す値と採用時の値が一致しません。承認を自動更新せず、対象候補を再確認してください。',id+':'+field);
    try{for(const e of validateTrace(t))if(!allowIncomplete||HARD.has(e.code))issues.push({...e,recordId:r.id,resultId:set.id,setId:set.id,field:id+':'+field,blocking:true});}catch(_){add('APPROVAL_MISSING','採用時の数値別来歴が不完全です。再確認・採用してください。',id+':'+field);}
   }
  }
  return issues;
 }
 function validateOutputRow(r,set,row,format,pointId){
  const issues=[],snap=r.csvTrace?.approvals?.[set.id],fields=exportFields(format);
  for(const [column,field] of Object.entries(fields)){
   let id=pointId||set.pointIds[0],f=field;
   if(format==='continuous'||format==='binary'){
    const c=typeof set.comparison==='object'?set.comparison:{},role=column.startsWith('Comparator_')?'comparator':'intervention',arm=c[role]||c[role+'Id']||c[role+'ArmId'];
    const ids=set.pointIds.filter(id=>set.acceptedValues[id].armId===arm);id=ids.length===1?ids[0]:null;
   }
   if(format==='giv'&&set.acceptedDerived?.length)f=field==='effect'?'derivedEffect':'derivedSE';
   const t=id&&snap?.values?.[id]?.[f],actual=row[column]??null;
   if(actual!=null&&(!t||actual!==t.final?.numeric_value))issues.push({code:t?'VALUE_MISMATCH':'APPROVAL_MISSING',message:'CSVの出力値と採用時の記録が一致しません。対象候補を再確認・採用してください。',field:column,recordId:r.id,resultId:set.id,setId:set.id,blocking:true});
  }
  return issues;
 }
 function preflightExport(records,base,options={},output=null){
  const format=options.format||'master',issues=[],entries=acceptedEntries(records,options.projectId),rawBase=exportBases.get(base)||base;
  const pending=options.pending||{};
  if(pending.busy||pending.drafts||pending.error)issues.push({code:'UNSAVED',message:'未保存の編集・保存処理中・保存失敗があります。保存完了を確認してください。',blocking:true});
  for(const {record,set} of entries)issues.push(...validateExportSet(record,set,options));
  if(issues.length)return {blocked:true,issues};
  const planned=[];
  for(const {record:r,set} of entries){
   const one={...r,resultSets:{[set.id]:set}},result=rawBase.exportBasket([one],{...options,format});
   for(const row of result.rows){
    const ids=format==='master'?set.pointIds.filter(id=>{const v=set.acceptedValues[id];return v.outcomeId===row.outcome_id&&v.arm===row.arm&&v.timepoint===row.timepoint&&v.resultType===row.result_type;}):[null];
    if(ids.length!==1){issues.push({code:'OUTPUT_TARGET_MISMATCH',message:'CSV行に対応する採用対象が一意ではありません。候補の群・時点を確認してください。',blocking:true});continue;}
    issues.push(...validateOutputRow(r,set,row,format,ids[0]));planned.push(row);
   }
  }
  if(output)for(const row of output.rows){
   const projection=v=>stable(output.columns.map(c=>v[c]??null));
   if(!planned.some(p=>projection(p)===projection(row)))issues.push({code:'OUTPUT_TARGET_MISMATCH',message:'出力行が保存済みの採用記録と一致しません。プレビューを更新し、対象候補を再確認してください。',blocking:true});
  }
  return {blocked:issues.length>0,issues};
 }

 function entrySnapshot(r,set){const frozen=r.csvTrace?.approvals?.[set.id];
  if(frozen)return {frozen:copy(frozen),mismatch:frozen.basis!==basis(r,set),unsaved:r.csvTrace.savedRevision!==r.revision};
  const values={},approval={id:null,actor:null,at:set.acceptedAt||null,revision:r.revision,legacy:true};
  for(const id of set.pointIds){const p=r.points[id];values[id]={};for(const f of fieldsFor(r,p,set.acceptedValues?.[id]||current(p)))values[id][f]=buildApprovedValueTrace(r,id,f,{values:set.acceptedValues,approval,resultId:set.id});const d=set.acceptedDerived?.find(d=>d.rawId===id);if(d)for(const [f,k] of [['derivedEffect','estimate'],['derivedSE','se']])values[id][f]=buildApprovedValueTrace(r,id,f,{values:set.acceptedValues,approval,resultId:set.id,candidate:d,outputValue:d.statistics[k]});}
  return {frozen:{values,approval},mismatch:set.pointIds.some(id=>stable(set.acceptedValues?.[id])!==stable(current(r.points[id]))),unsaved:false,legacy:true};
 }
 function acceptedEntries(records,projectId){const result=[];for(const r of records.filter(r=>!projectId||r.project.id===projectId)){
  const sets=Object.values(r.resultSets||{}),covered=new Set(sets.flatMap(s=>s.pointIds));
  for(const set of sets)if(set.status==='ACCEPTED')result.push({record:r,set});
  // Old pre-basket approvals are retained as legacy handover rows, never promoted to analysis eligibility.
  for(const p of Object.values(r.points))if(!covered.has(p.id)&&['ACCEPTED','EDITED'].includes(p.decision.status)&&r.history.some(h=>['ADOPT_OUTCOME','FINALIZE_OUTCOME','POINT'].includes(h.action)&&(h.changes||[]).some(c=>c.pointId===p.id&&c.after?.decidedAt===p.decision.decidedAt&&['ACCEPTED','EDITED'].includes(c.after.status))))result.push({record:r,set:{id:'legacy:'+p.id,pointIds:[p.id],acceptedValues:{[p.id]:copy(current(p))},acceptedDerived:[],acceptedAt:p.decision.decidedAt,status:'ACCEPTED',timepoint:current(p).timepoint,resultType:current(p).resultType,comparison:current(p).arm}});
 }return result;}
 function buildApprovedWithSourcesRows(input,base,options={}){
  // An owned snapshot is captured once; preview, copy and save consume this same object.
  const records=copy(input),format=options.format||'master',entries=acceptedEntries(records,options.projectId),rows=[],fieldMap=[],issues=[];
  const exportId=options.exportId||('export:'+stamp()+':'+Math.random().toString(36).slice(2)),exportedAt=options.exportedAt||stamp();
  const analysisCheck=format==='master'?null:base.exportBasket(records,{projectId:options.projectId,format,allowIncomplete:options.allowIncomplete});
  if(analysisCheck?.blocked)issues.push(...analysisCheck.warnings.filter(w=>w.blocking));
  let baseColumns=base.exportBasket([],{format}).columns;
  if(format==='master')baseColumns=[...baseColumns,'event_count','person_time','ci_level'];
  const fields=exportFields(format);
  const summary={acceptedRows:0,completeRows:0,incompleteRows:0,staleOrUnsavedRows:0,analysisGatedRows:0,numericCells:0,acceptedResultSets:entries.length};
  const gate=preflightExport(records,base,options);const extra=proposal()?.exportIssues(records)||[];if(extra.length){gate.issues.push(...extra);gate.blocked=true;}
  if(gate.blocked)return {format,columns:baseColumns,rows:[],csv:'',summary:{...summary,acceptedRows:entries.reduce((n,{set})=>n+(format==='master'?set.pointIds.length:1),0),staleOrUnsavedRows:entries.reduce((n,{set})=>n+(format==='master'?set.pointIds.length:1),0)},issues:gate.issues,blocked:true,error:gate.issues[0]?.message,fieldMap:[],exportId,exportedAt,datasetSignature:stable(records.map(r=>[r.id,r.revision]).sort()),snapshotVersion:VERSION};
  for(const {record:r,set} of entries){
   const snap=entrySnapshot(r,set),count=format==='master'?set.pointIds.length:1;summary.acceptedRows+=count;
   if(snap.mismatch||snap.unsaved){summary.staleOrUnsavedRows+=count;issues.push({code:snap.unsaved?'UNSAVED':'REVISION_MISMATCH',resultId:set.id,message:'値・出典・入力の承認版が未保存または不一致です。再確認・保存してください。'});continue;}
   let output=[];
   if(format==='master'){
    for(const id of set.pointIds){const p=copy(r.points[id]),v=set.acceptedValues[id];p.decision.finalValue=copy(v);const rec={...r,points:{[id]:p}},audit=base.exportData([rec],{format:'audit'}).rows[0],d=set.acceptedDerived?.find(d=>d.rawId===id);output.push({row:{...Object.fromEntries(baseColumns.map(k=>[k,audit[k]??null])),result_set_id:set.id,comparison:base.comparisonLabel(set),event_count:v.eventCount??null,person_time:v.personTime??null,ci_level:fieldValue(r,p,'ciLevel',v),derived_kind:d?.kind||'',derived_effect:d?.statistics.estimate??null,derived_se:d?.statistics.se??null,derived_formula:d?.formula||''},ids:[id]});}
   }else{
    const rec=copy(r);rec.resultSets={[set.id]:copy(set)};const result=base.exportBasket([rec],{format,allowIncomplete:options.allowIncomplete});
    if(result.blocked||result.rows.length!==1){summary.analysisGatedRows++;issues.push(...result.warnings.map(w=>({...w,resultId:set.id})),{code:'ANALYSIS_GATE',resultId:set.id,message:'既存の解析適格性ゲートにより出力できません。全件引継ぎにはMaster形式を使用してください。'});continue;}
    output=[{row:result.rows[0],ids:set.pointIds}];
   }
   for(const item of output){const row=Object.fromEntries(Object.entries(item.row).map(([k,v])=>[k,k==='source_pdf'?basename(v):typeof v==='string'?text(v):copy(v)])),traces={},pointIds=item.ids;row.study_id=text(r.studyId);row.result_id=text(set.id);row.value_revision=snap.frozen.approval.revision;row.dataset_revision=r.revision;row.export_id=exportId;row.exported_at=exportedAt;row.export_schema_version=VERSION;row.record_kind=r.recordKind||'study';
    row.context_json=stable(pointIds.map(id=>context(r,r.points[id],set.acceptedValues[id])));
    for(const [column,field] of Object.entries(fields)){
     let id=pointIds[0],f=field;
     if(format==='continuous'||format==='binary'){const role=column.startsWith('Comparator_')?'comparator':'intervention',c=typeof set.comparison==='object'?set.comparison:{},arm=c[role]||c[role+'Id']||c[role+'ArmId'];id=pointIds.find(id=>set.acceptedValues[id].armId===arm);if(!id)throw Error('比較と値の対応が一意ではありません: '+column);}
     if(format==='giv'&&set.acceptedDerived?.length)f=field==='effect'?'derivedEffect':'derivedSE';
     const trace=copy(snap.frozen.values[id]?.[f]||null);if(trace)refreshTraceStatus(trace);
     if(trace){if((row[column]??null)!==trace.final.numeric_value)throw Error('CSV値と採用snapshotが不一致: '+column);traces[column]=copy(trace);row[column+'_source_note']=formatSourceNote(trace);row[column+'_trace_json']=stable(trace);if(numeric(row[column]))summary.numericCells++;}
     else {if(row[column]!=null)throw Error('数値に対応するsnapshotがありません: '+column);row[column+'_source_note']='【値】空欄。この採用結果に当該統計値の記録はありません。0を意味しません。';row[column+'_trace_json']=stable({schema_version:VERSION,field_key:field,final:{numeric_value:null,missing_status:'not_recorded'},provenance_status:'not_target'});}
    }
    const problems=Object.entries(traces).flatMap(([column,t])=>t.provenance_issues.map(x=>({...x,field:column})));row.provenance_status=problems.length?'incomplete':Object.values(traces).some(t=>t.provenance_status==='human_confirmed')?'human_confirmed':'complete';row.provenance_issues=stable(problems);summary[problems.length?'incompleteRows':'completeRows']++;rows.push(row);fieldMap.push({resultId:set.id,pointIds,fields:Object.keys(traces)});issues.push(...problems.map(x=>({...x,resultId:set.id})));
   }
  }
  const metadata=['record_kind','study_id','result_id','value_revision','context_json','provenance_status','provenance_issues','export_id','exported_at','export_schema_version','dataset_revision'];
  const columns=[...baseColumns.flatMap(c=>fields[c]?[c,c+'_source_note']:[c]),...metadata.filter(c=>!baseColumns.includes(c)),...Object.keys(fields).map(c=>c+'_trace_json'),'text_escapes_json'];
  let csv='',serializedRows=rows,error=null;try{const serialized=serializeCsv(base,columns,rows,options);csv=serialized.csv;serializedRows=serialized.rows;}catch(e){error=e.message;issues.push({code:'CSV_CELL_LIMIT',message:error});}
  if(issues.some(e=>HARD.has(e.code)))error||=issues.filter(e=>HARD.has(e.code)).every(e=>e.code==='semantic_version')?'旧版の数値別来歴です。旧承認を保持したまま、対象候補を新版で再確認・採用してください。':'数値と原著表記／計算入力の対応が一致しません。出典不足の明示出力では解除できません。該当値を再確認してください。';
  const blocked=!!error||!!analysisCheck?.blocked||summary.analysisGatedRows>0||summary.staleOrUnsavedRows>0||summary.incompleteRows>0&&!options.allowIncomplete;
  return {format,columns,rows:serializedRows,csv,summary,issues,blocked,error,fieldMap,exportId,exportedAt,datasetSignature:stable(records.map(r=>[r.id,r.revision]).sort()),snapshotVersion:VERSION};
 }
 return Object.freeze({VERSION,EXPORT_GATE_VERSION,preflightExport,validateExportSet,validateOutputRow,conversionField,validateSemantics,METHOD_VERSION,FIELDS,key,alias,documentInfo,documentMatch,sourceInfo,legacySource,locateNativeQuote,inheritedEvidence,editDefaults,fieldsFor,buildApprovedValueTrace,validateTrace,formatSourceNote,serializeCsv,buildApprovedWithSourcesRows,acceptedEntries,entrySnapshot,basis,wrap});
});
