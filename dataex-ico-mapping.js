/* Review concepts and human-approved terminology. Never changes extracted values. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.DataExICO=api;})(typeof window==='undefined'?null:window,function(){
 'use strict';
 const VERSION='1.0.0', norm=s=>String(s||'').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
 const terms=o=>[o.reportedName,o.instrument,o.conceptCandidate].filter(Boolean);
 function construct(text){
  const s=norm(text);
  if(/bother|煩わし/.test(s))return 'bothersomeness';
  if(/interference|痛みの干渉/.test(s))return 'pain-interference';
  if(/pressure pain|\bppt\b|圧痛/.test(s))return 'pressure-pain-threshold';
  if(/analgesic|medication|鎮痛薬/.test(s))return 'medication-use';
  if(/disability|roland|\brmdq\b|\bodi\b|oswestry|functional disability|機能障害/.test(s))return 'disability';
  if(/pain|疼痛|痛み/.test(s))return 'pain-intensity';
  return null;
 }
 function outcome(o,context={},learned=[]){
  const requested=context.outcomes||[],paper=terms(o),paperConstruct=construct(paper.join(' '));
  for(const target of requested){
   const wanted=construct(target);if(wanted&&paperConstruct&&wanted!==paperConstruct)continue;
   const ai=norm(o.mapping?.target)===norm(target)&&['EXACT','COMPATIBLE'].includes(o.mapping?.relation);
   const exact=[o.reportedName,o.instrument].filter(Boolean).some(t=>norm(t)===norm(target));
   const known=wanted&&wanted===paperConstruct;
   const previous=learned.find(m=>norm(m.reviewConcept)===norm(target)&&m.acceptedPaperTerms?.some(t=>paper.some(p=>norm(p)===norm(t)))&&(!m.construct||!paperConstruct||m.construct===paperConstruct));
   if(ai||exact||known||previous)return {reviewConcept:target,paperTerm:o.reportedName,relation:exact?'EXACT':'COMPATIBLE',reason:ai?o.mapping.reason:previous?'同じレビューで人間が確認した用語との対応候補':'尺度・構成概念に基づく対応候補',needsReview:true,learned:!!previous};
  }
  return null;
 }
 function arms(raw,context={}){
  // Roles originate in the AI's reading of Methods. Similar names never pool arms.
  return raw.study.arms.map(a=>{
   const role=norm(a.role),sham=/sham|simulat|placebo|偽|模擬/i.test(a.label+' '+role),i=context.intervention||'',c=context.comparator||'';
   const explicitSham=/sham|simulat|placebo|偽|模擬/i.test(i);
   const target=sham&&!explicitSham?(/sham|simulat|placebo|偽|模擬/i.test(c)?c:null):sham&&explicitSham?i:/comparator|control|usual care/.test(role)?c:/intervention|active|experimental|real/.test(role)?i:null;
   return {armId:a.id,paperTerm:a.label,reviewConcept:target||null,needsReview:true,reason:sham&&!target?'Simulated / sham群は別群として保持。介入群へ自動統合しません。':'原著の群・Methodsに基づく対応候補。群は統合しません。'};
  });
 }
 function accepted(record,id){
  const state=record.outcomes[id],o=record.snapshot.raw.outcomes.find(o=>o.id===id);
  if(!state||!o)return null;
  return {reviewConcept:state.canonicalLabel,acceptedPaperTerms:[...new Set([o.reportedName,o.instrument].filter(Boolean))],construct:construct(terms(o).join(' ')),recordId:record.id,outcomeId:id,confirmedAt:state.confirmedAt};
 }
 function learned(records,context={}){
  const project=(context.reviewName||'default').trim()||'default';
  return records.filter(r=>r.project.id===project).flatMap(r=>Object.values(r.outcomes).filter(o=>o.clinical&&o.status==='CONFIRMED'&&o.reviewMapping).map(o=>structuredClone(o.reviewMapping)));
 }
 const GUIDANCE=`\n\n# Review ICO semantic mapping — v1.0.0
The SR's Intervention, Comparator and Outcome text is canonical review wording, not an exact-string filter. Read the original PDF Methods, arm descriptions and outcome definitions. Consider generic/brand names, dose, route, procedures, combination therapy, and simulated/sham/placebo controls. Preserve every original arm and timepoint in Raw; a mapping is not permission to pool arms or select a final value.
For each Outcome use outcomes[].mapping {target, relation, reason} to explain its semantic correspondence to a supplied SR concept. Disability can correspond to Roland disability score / Roland-Morris Disability Questionnaire / RMDQ / ODI. Pain intensity can correspond to VAS/NRS, but bothersomeness, interference, pressure pain threshold and analgesic use are different constructs: retain these separately, using RELATED with an explanation when appropriate. Never silently equate them.
Represent Intervention/Comparator correspondence using the original study.arms[].role and explain ambiguous mappings in proposals of kind OTHER (include the original armIds). Individualized and standardized acupuncture may be candidates for Acupuncture; simulated acupuncture stays separate and is never automatically assigned or combined merely because its name contains acupuncture. Missing ICO remains allowed; empty Outcomes means DISCOVERY of primary, secondary and safety outcomes.
mappingDecisions are human-confirmed terminology from this Review Workspace. Prioritize these as candidate correspondences for a new paper, checking the construct and original definition again. They are not automatic acceptance or finalization and do not override Raw. Keep all source references and report only ambiguities as Needs review, without numerical mapping-confidence percentages.`;
 function prompt(core,context,manifest,decisions){const result=core.prompt(context,manifest,decisions);return {...result,icoMappingVersion:VERSION,mappingDecisions:decisions,prompt:result.prompt+GUIDANCE};}
 return Object.freeze({VERSION,construct,outcome,arms,accepted,learned,prompt,GUIDANCE});
});
