/* Read-only presentation ontology. Author-reported pools are references, never new observations. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.DataExArmOntology=api;})(typeof window==='undefined'?null:window,function(){
  'use strict';
  const unique=xs=>[...new Set(xs)], norm=x=>String(x||'').normalize('NFKC').toLowerCase().replace(/\s+/g,' ').trim();
  const rawOf=x=>x?.raw?.study?x.raw:x?.snapshot?.raw||x||{};
  const isMetadata=a=>/\bSTUDY_TOTAL\b|\bSTUDY_METADATA\b/i.test(a?.role||'')||/^(?:all participants|study total|total participants)(?:\s*\(study total\))?$/i.test(String(a?.label||'').trim());
  const isPooled=a=>/REPORTED_POOLED_ARM|POOLED_ANALYSIS_NODE|DERIVED_ANALYSIS_NODE/i.test(a?.role||'')||/\b(?:reported pooled group|pooled analysis node)\b/i.test(a?.label||'');
  const baseline=r=>/baseline|pre[- ]?treatment|介入前/i.test(r.timepoint||'')||r.resultType==='baseline';
  const originalLabel=a=>String(a.label||'').replace(/\s+in general practice$/i,'').replace(/\s+alone$/i,'').replace(/\s+plus\s+/gi,' + ');
  function nodeLabel(a){
    const label=originalLabel(a).replace(/\s*\([^)]*(?:pooled|private and NHS)[^)]*\)/gi,'');
    return label.replace(/^Best care\s*\+\s*/i,'').replace(/^./,c=>c.toUpperCase())+(isPooled(a)?(/private/i.test(a.label)&&/NHS/i.test(a.label)?' (NHS/private pooled)':' (pooled)'):'');
  }
  // Only an explicit list of existing arm IDs is used for participant overlap.
  // Unknown membership stays unknown; labels or numeric Ns are not used to invent a pool.
  function members(a,originals){
    if(!isPooled(a))return [a.id];
    const explicit=a.componentArmIds||a.memberArmIds||a.sourceArmIds;
    const ids=Array.isArray(explicit)?explicit:originals.filter(o=>new RegExp('(^|[^A-Za-z0-9_])'+o.id.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'(?=$|[^A-Za-z0-9_])').test(a.role||'')).map(o=>o.id);
    return unique(ids.filter(id=>originals.some(o=>o.id===id)));
  }
  function build(input){
    const raw=rawOf(input),study=raw.study||input?.study||input||{},arms=study.arms||[];
    const isFactorial=/factorial|要因(?:計画|試験)/i.test(study.design||'');
    const originalArms=arms.filter(a=>!isMetadata(a)&&!isPooled(a)), metadata=arms.filter(isMetadata), pools=arms.filter(a=>!isMetadata(a)&&isPooled(a));
    const reported=new Set((raw.rawValues||[]).filter(r=>r.armId&&r.comparatorArmId&&!baseline(r)).flatMap(r=>[r.armId,r.comparatorArmId]));
    const analysis=arms.filter(a=>!isMetadata(a)&&(reported.has(a.id)||pools.includes(a)));
    const wrap=(a,layer)=>({...a,fullLabel:a.label,label:isFactorial?(layer==='ORIGINAL_RANDOMIZED_ARM'?originalLabel(a):nodeLabel(a)):a.label,layer,pooled:isPooled(a),memberArmIds:members(a,originalArms),membershipKnown:!isPooled(a)||members(a,originalArms).length>1,badge:isPooled(a)?'Derived / pooled analysis node':layer==='ANALYSIS_NODE'?'Analysis node · original arm':'Original randomized arm'});
    const originals=originalArms.map(a=>wrap(a,'ORIGINAL_RANDOMIZED_ARM'));
    const nodes=(isFactorial?analysis:arms.filter(a=>!isMetadata(a))).map(a=>wrap(a,'ANALYSIS_NODE'));
    return {isFactorial,originalArms:originals,analysisNodes:nodes,metadata:metadata.map(a=>({...a,layer:'STUDY_METADATA',memberArmIds:[],badge:'Study metadata'})),treatmentArms:arms.filter(a=>!isMetadata(a)).map(a=>wrap(a,isPooled(a)?'ANALYSIS_NODE':'ORIGINAL_RANDOMIZED_ARM'))};
  }
  function analysisScope(row,input){
    const raw=rawOf(input),refs=new Set(Object.values(row.sourceRefs||{}));
    const tables=unique((raw.sources||[]).filter(s=>refs.has(s.id)&&s.tableFigure).map(s=>[s.pdfFile||raw.pdfId,s.pdfPage,norm(s.tableFigure)].join('|'))).sort();
    return [row.analysisId||row.analysisModel||'',...tables].filter(Boolean).join(';');
  }
  function eligible(row,comparison,input){
    if(!comparison.armIds.includes(row.armId)||row.comparatorArmId&&row.comparatorArmId!==comparison.comparatorArmId)return false;
    const ontology=build(input);if(!ontology.isFactorial)return true;
    if(baseline(row))return false;
    if(row.comparatorArmId)return row.armId===comparison.interventionArmId;
    const raw=rawOf(input),scope=analysisScope(row,raw);
    // The control mean must come from the same table/model as this contrast.
    const effects=(raw.rawValues||[]).filter(r=>r.outcomeId===row.outcomeId&&r.timepoint===row.timepoint&&r.armId===comparison.interventionArmId&&r.comparatorArmId===comparison.comparatorArmId);
    if(effects.length)return !!scope&&effects.some(r=>analysisScope(r,raw)===scope);
    const partner=(raw.rawValues||[]).filter(r=>r.outcomeId===row.outcomeId&&r.timepoint===row.timepoint&&r.resultType===row.resultType&&r.armId===(row.armId===comparison.interventionArmId?comparison.comparatorArmId:comparison.interventionArmId)&&!r.comparatorArmId);
    return !!scope&&partner.some(r=>analysisScope(r,raw)===scope);
  }
  function overlap(input,ids,otherIds){
    const ontology=build(input),byId=new Map(ontology.treatmentArms.map(a=>[a.id,a]));
    const a=unique(ids.filter(Boolean).flatMap(id=>byId.get(id)?.memberArmIds||[])),b=unique(otherIds.filter(Boolean).flatMap(id=>byId.get(id)?.memberArmIds||[]));
    return {shared:a.filter(id=>b.includes(id)),unknown:[...ids,...otherIds].some(id=>id&&!byId.get(id)?.membershipKnown)};
  }
  return Object.freeze({build,isMetadata,isPooled,analysisScope,eligible,overlap});
});
