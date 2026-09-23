/* Resolve reported effect names without rewriting extraction data or the estimator. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.DataExEffectTypes=api;})(typeof window==='undefined'?null:window,function(){
  'use strict';
  const VERSION='1.0.0';
  const normalize=v=>String(v||'').normalize('NFKC').replace(/([a-z])-\s+([a-z])/gi,'$1$2').replace(/[−–—]/g,'-').replace(/\s+/g,' ').trim();
  const TYPES={RATE_RATIO:{name:'Rate Ratio',label:'rate ratio',logLabel:'log(rate ratio)',exportType:'log Rate Ratio'},RISK_RATIO:{name:'Risk Ratio',label:'risk ratio',logLabel:'log(RR)',exportType:'log Risk Ratio'},HR:{name:'HR',label:'hazard ratio',logLabel:'log(HR)',exportType:'log(HR)'},OR:{name:'OR',label:'odds ratio',logLabel:'log(OR)',exportType:'log(OR)'}};
  const mixed=v=>/\brate\s*(?:or|\/)\s*risk\s+ratios?\b/i.test(normalize(v));
  function parseLabel(value){
    const text=normalize(value);if(mixed(text))return null;
    const kinds=[];
    if(/\b(?:incidence\s+)?rate\s+ratios?\b|\bIRR\b/i.test(text))kinds.push('RATE_RATIO');
    if(/\brisk\s+ratios?\b|\brelative\s+risk\b|\bRR\b/i.test(text))kinds.push('RISK_RATIO');
    if(/\bhazard\s+ratios?\b|\bHR\b/i.test(text))kinds.push('HR');
    if(/\bodds\s+ratios?\b/i.test(text)||/\bOR\b/.test(text))kinds.push('OR');
    if(kinds.length!==1)return null;
    return {kind:kinds[0],isLog:/\b(?:log|ln)\s*\(?\s*(?:rate\s+ratio|risk\s+ratio|hazard\s+ratio|odds\s+ratio|HR|RR|OR|IRR)\b/i.test(text)};
  }
  function scopeMatches(clause,label,outcome){
    const text=normalize(clause).toLowerCase(), name=normalize(label||outcome.reportedName).toLowerCase();
    const component=/\b(?:subcomponents?|composite component)\b/i.test([name,outcome.reportedName].join(' '))||/^death\s*$/.test(name);
    if(component)return /\b(?:subcomponents?|components?)\b/.test(text)&&/\b(?:death|ventilation)\b/.test(text);
    if(/\bmortality\b/.test(name))return /\bmortality\b/.test(text);
    if(/\bdischarg\w*/.test(name))return /\bdischarg\w*/.test(text);
    if(/\b(?:invasive mechanical ventilation|imv)\b/.test(name))return /\b(?:invasive mechanical ventilation|imv)\b/.test(text);
    const stop=new Set('the of in at and or with within from for outcome outcomes days day weeks months years'.split(' '));
    const terms=[...new Set(name.match(/[a-z]{3,}/g)||[])].filter(t=>!stop.has(t));
    return terms.length>=2&&terms.filter(t=>new RegExp('\\b'+t+'\\b').test(text)).length/terms.length>=.8;
  }
  function resolve(row,outcome={},input={}){
    if(typeof row.statistics?.estimate!=='number')return null;
    const declared=parseLabel(row.effectMeasure), raw=input.raw?.rawValues?input.raw:input;
    if(!declared&&/median|mean rank|difference|absolute.*(?:reduction|risk)|percent/i.test(row.effectMeasure||''))return null;
    const sources=raw.sources||[], refs=new Set(Object.values(row.sourceRefs||{})), linked=sources.filter(s=>refs.has(s.id));
    const anchor=sources.find(s=>s.id===row.sourceRefs?.estimate)||linked[0],label=anchor?.row||outcome.reportedName||'';
    const related=sources.filter(s=>refs.has(s.id)||anchor?.tableFigure&&s.tableFigure===anchor.tableFigure&&s.pdfPage===anchor.pdfPage&&s.pdfFile===anchor.pdfFile),claims=[];
    // An outcome-specific source assignment outranks a guessed Raw label. A mixed column does not.
    for(const source of related)for(const hit of normalize(source.evidenceText).matchAll(/\b(?:rate|risk|hazard|odds) ratios?\s+(?:have|has|were|was|are|is)\b[^.]*\./gi)){
      const assignment=/\b(?:with respect to|for (?:the )?outcomes? of|for the outcomes?)(.+)/i.exec(hit[0]);
      if(!assignment||!scopeMatches(assignment[1],label,outcome))continue;
      const measure=parseLabel(hit[0].split(/\s+(?:have|has|were|was|are|is)\b/i)[0]);
      if(measure)claims.push({...measure,source,quote:hit[0],basis:'OUTCOME_SPECIFIC_SOURCE'});
    }
    if(!claims.length)for(const source of linked){const measure=parseLabel(source.column);if(measure)claims.push({...measure,source,quote:source.column,basis:'UNAMBIGUOUS_SOURCE_COLUMN'});}
    if(!claims.length)for(const source of linked)for(const hit of normalize(source.evidenceText).matchAll(/[^.]*\b(?:reported as|used to estimate)\s+(?:the\s+)?(?:mortality\s+)?(?:rate|risk|hazard|odds) ratio[^.]*/gi)){
      if(!scopeMatches(hit[0],label,outcome))continue;
      const measure=parseLabel(hit[0].split(/reported as|used to estimate/i).pop());
      if(measure)claims.push({...measure,source,quote:hit[0],basis:'OUTCOME_SPECIFIC_SOURCE'});
    }
    const kinds=[...new Set(claims.map(c=>c.kind))],ambiguous=kinds.length>1||!claims.length&&linked.some(s=>mixed(s.column));
    if(ambiguous)return {version:VERSION,status:'NEEDS_REVIEW',kind:null,rawEffectMeasure:row.effectMeasure||'',basis:'UNRESOLVED_SOURCE',sourceIds:[...new Set(linked.map(s=>s.id))],evidence:claims.map(c=>({sourceId:c.source.id,quote:c.quote})),reason:'列見出しだけでは効果量を一意に判定できません。Outcomeに対応する脚注・本文を確認してください。'};
    const chosen=claims[0]||declared;if(!chosen)return null;
    const type=TYPES[chosen.kind],age=/age[- ]adjusted|adjusted for (?:the )?age/i.test([row.adjustment,...claims.map(c=>c.quote)].join(' '));
    const methodSources=[...linked,...sources.filter(s=>(raw.study?.sourceIds||[]).includes(s.id))];
    const method=methodSources.some(s=>/Cox regression/i.test(s.evidenceText||'')&&scopeMatches(s.evidenceText,label,outcome))?'Cox regression':methodSources.some(s=>/log-binomial/i.test(s.evidenceText||'')&&scopeMatches(s.evidenceText,label,outcome))?'Log-binomial regression':null;
    return {version:VERSION,status:'RESOLVED',kind:chosen.kind,isLog:!!declared?.isLog,...type,reportedLabel:(age?'Age-adjusted ':row.adjustment&&!/^(?:unadjusted|none|raw)$/i.test(row.adjustment)?'Adjusted ':'')+type.label,rawEffectMeasure:row.effectMeasure||'',basis:chosen.basis||'EXTRACTED_LABEL',sourceIds:[...new Set(claims.map(c=>c.source.id))],evidence:claims.map(c=>({sourceId:c.source.id,pdfPage:c.source.pdfPage,quote:c.quote})),estimationMethod:method};
  }
  return Object.freeze({VERSION,parseLabel,resolve});
});
