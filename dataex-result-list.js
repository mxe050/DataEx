/* Read-only projection. Never merges candidates, sources or adoption records. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.DataExResultList=api;})(typeof window==='undefined'?null:window,function(){
 'use strict';
 const VERSION='UI-FINAL-1.0';
 const stable=value=>Array.isArray(value)?'['+value.map(stable).join(',')+']':value&&typeof value==='object'?'{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+stable(value[k])).join(',')+'}':JSON.stringify(value);
 const unique=values=>[...new Set(values)];
 // Navigation labels only: never write these groups to Raw, decisions or exports.
 const CATEGORIES=Object.freeze([
  {id:'safety',label:'有害事象・安全性',pattern:/adverse|side[ -]?effects?|safety|toxicit|complication|nausea|vomiting|dysphoria|hallucinat|delusion|psychomimetic|blurred vision|有害|副作用|安全性|悪心|嘔吐|霧視|精神模倣/i},
  {id:'pain',label:'疼痛・症状',pattern:/\bpain\b|mcgill|allodynia|hyperalgesia|symptom|疼痛|痛み|灼熱痛|誘発痛|圧痛|アロディニア|症状/i},
  {id:'function',label:'身体機能・日常生活',pattern:/function|disability|roland|womac|oswestry|finger tap|tap test|interfer|general activity|physical activity|level of activity|身体機能|障害|活動|タップ|日常生活/i},
  {id:'qol',label:'生活の質・睡眠・心理',pattern:/quality of life|\bqol\b|sleep|awaken|depress|anxiety|生活の質|睡眠|覚醒|抑うつ|不安/i},
  {id:'survival',label:'死亡・生存',pattern:/mortality|\bdeath\b|survival|死亡|生存/i},
  {id:'disease',label:'疾患・治療反応',pattern:/cancer|cardiovascular|infarction|stroke|recurrence|remission|response|responder|individual improvement|疾患|がん|心血管|再発|寛解|改善者|奏効/i},
  {id:'measurement',label:'検査値・生理指標',pattern:/plasma|serum|blood pressure|temperature|detection threshold|\bbmi\b|body mass|weight|血漿|血清|血圧|温度|皮膚温|検出閾値|体重/i},
  {id:'other',label:'その他・未分類',pattern:null}
 ].map(Object.freeze));
 function categoryIds(outcome,sources=[],rows=[]){
  const name=[outcome.reportedName,outcome.conceptCandidate,outcome.instrument].filter(Boolean).join(' ');
  const ids=CATEGORIES.filter(c=>c.pattern?.test(name)).map(c=>c.id);
  // Section headings supply useful context for generically named safety symptoms.
  const safetyContext=sources.some(s=>/adverse|side[ -]?effects?|safety|有害|副作用|安全性/i.test([s.section,s.tableFigure,s.sourceText,s.quote].filter(Boolean).join(' ')));
  if(safetyContext&&!ids.includes('safety'))ids.unshift('safety');
  const preOnly=rows.length&&rows.every(r=>r.resultType==='baseline'||/^(baseline|pre[- ]?(treatment|intervention)|介入前)$/i.test(String(r.timepoint||'').trim()));
  if(preOnly&&!safetyContext&&!/adverse|side[ -]?effects?|safety|有害|副作用|安全性/i.test(name)){const i=ids.indexOf('safety');if(i>=0)ids.splice(i,1);if(!ids.includes('pain'))ids.push('pain');}
  return ids.length?ids:['other'];
 }
 function categoryIndex(raw,cards){
  const sources=new Map((raw.sources||[]).map(s=>[s.id,s]));
  return (raw.outcomes||[]).map(outcome=>{
   const rows=(raw.rawValues||[]).filter(r=>r.outcomeId===outcome.id);
   const linked=unique(rows.flatMap(r=>Object.values(r.sourceRefs||{}))).map(id=>sources.get(id)).filter(Boolean);
   return {outcome,categories:categoryIds(outcome,linked,rows),candidateIds:cards.filter(c=>(c.reportedOutcomeId||c.outcomeId||c.outcome?.id)===outcome.id).map(c=>c.id)};
  });
 }
 function project(cards,raw,readRow,context={}){
  const positions=new Map(raw.rawValues.map((r,i)=>[r.id,i])),outcomeOrder=new Map((raw.outcomes||[]).map((o,i)=>[o.id,i])),groups=new Map();
  for(const card of cards){
   const rows=card.rows.map(readRow),o=card.outcome||{},first=rows[0];if(!first)continue;
   // Every semantic dimension remains distinct. Missing metadata never implies equality
   // with known metadata. Source positions, ID and timepoint stay on individual entries.
   const semantics=rows.map(v=>({armId:v.armId,comparatorArmId:v.comparatorArmId||null,dataType:v.dataType,resultType:v.resultType,effectMeasure:v.effectMeasure,population:v.population,adjustment:v.adjustment,comparisonDirection:v.comparisonDirection,nBasis:v.nBasis,unit:v.unit??o.unit}));
   const contexts=unique(semantics.map(({armId,comparatorArmId,...rest})=>stable(rest))).sort();
   const comparative=rows.length===1&&!!first.comparatorArmId;
   const key=stable({outcomeId:card.reportedOutcomeId||o.id,scale:o.scale,instrument:o.instrument,comparisonId:card.comparisonId||rows.map(v=>[v.armId,v.comparatorArmId]),comparative,resultType:card.displayType,contexts});
   const sourceOrder=Math.min(...card.pointIds.map(id=>positions.get(id)??Number.MAX_SAFE_INTEGER));
   const explicit=!!context.outcomes?.length&&!!o.mapping?.target&&['EXACT','COMPATIBLE','RELATED'].includes(o.mapping?.relation);
   const primary=/\bprimary(?:\s+\w+){0,2}\s+(?:outcome|end\s*point)\b|主評価/i.test(o.mapping?.reason||'');
   const rank=explicit?0:primary?1:2;
   if(!groups.has(key))groups.set(key,{key,outcome:o,label:card.label,comparison:card.comparison,comparative:rows.length===1&&!!first.comparatorArmId,semantics,rank,outcomeOrder:outcomeOrder.get(o.id)??0,sourceOrder,detailOnly:!!card.detailOnly,entries:[]});
   const group=groups.get(key);group.sourceOrder=Math.min(group.sourceOrder,sourceOrder);group.rank=Math.min(group.rank,rank);
   const time=stable(unique(rows.map(v=>v.timepoint))),numbers=stable(rows.map(v=>({armId:v.armId,statistics:v.statistics})));
   const same=group.entries.find(e=>e.time===time&&e.numbers===numbers);
   if(same){same.cards.push(card);same.rawIds.push(...card.pointIds);same.sourceIds=unique([...same.sourceIds,...rows.flatMap(v=>Object.values(v.sourceRefs||{}))]);}
   else group.entries.push({time,numbers,timepoint:unique(rows.map(v=>v.timepoint)).join(' / '),cards:[card],rawIds:[...card.pointIds],sourceIds:unique(rows.flatMap(v=>Object.values(v.sourceRefs||{}))),sourceOrder,conflict:false});
  }
  const result=[...groups.values()].sort((a,b)=>a.rank-b.rank||Number(a.detailOnly)-Number(b.detailOnly)||a.outcomeOrder-b.outcomeOrder||a.sourceOrder-b.sourceOrder);
  for(const g of result){g.entries.sort((a,b)=>a.sourceOrder-b.sourceOrder);for(const e of g.entries)e.conflict=g.entries.some(other=>other!==e&&other.time===e.time&&other.numbers!==e.numbers);}
  return result;
 }
 return Object.freeze({VERSION,project,CATEGORIES,categoryIds,categoryIndex});
});
