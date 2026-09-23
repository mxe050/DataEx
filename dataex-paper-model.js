/* Paper-first presentation and statistical guidance. No Raw mutation or automatic acceptance. */
(function (root, factory) {
  const node = typeof module === 'object' && module.exports;
  const api = factory(node ? require('./dataex-results-model.js') : root.DataExResultsModel, node ? require('./dataex-effect-type.js') : root.DataExEffectTypes, node ? require('./dataex-arm-ontology.js') : root.DataExArmOntology);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.DataExPaperModel = api;
})(typeof window === 'undefined' ? null : window, function (results, effectTypes, ontology) {
  'use strict';
  const VERSION = '5.0.2';
  const GUIDANCE_SOURCES = Object.freeze([
    {title:'Cochrane Handbook — effect measures and conversions',url:'https://www.cochrane.org/authors/handbooks-and-manuals/handbook/current/chapter-06'},
    {title:'Cochrane Handbook — crossover and multi-arm trials',url:'https://www.cochrane.org/authors/handbooks-and-manuals/handbook/current/chapter-23'}
  ]);
  const LABELS = Object.freeze({DIRECT:'そのまま使える',CONVERTIBLE:'変換すれば使える',REVIEW:'確認が必要',UNUSABLE:'この形では使えない'});
  const finite = x => typeof x === 'number' && Number.isFinite(x);
  const norm = value => String(value || '').normalize('NFKC').toLowerCase().replace(/[−–—]/g,'-').replace(/\s+/g,' ').trim();
  const unique = values => [...new Set(values)];
  const studyOf = value => value?.raw?.study || value?.study?.raw?.study || value?.study || value || {};
  const rawOf = value => value?.raw?.rawValues ? value.raw : value?.rawValues ? value : value?.study?.raw || {study:studyOf(value),outcomes:[],rawValues:[],sources:[]};
  const crossover = study => /cross[\s-]?over|クロスオーバー|交差試験/i.test(studyOf(study).design || '');
  const correlated = study => crossover(study) || /cluster|within[\s-]?person|split[\s-]?mouth|クラスター/i.test(studyOf(study).design || '');
  const isBaseline = results.isBaselineRow;
  const isSequence = arm => /→|->|\bsequence\b|投与順序|順序群/i.test([arm.label,arm.role].join(' '));
  const textOf = (row,outcome) => [row.effectMeasure,outcome.reportedName,outcome.conceptCandidate,outcome.instrument,row.statisticType].filter(Boolean).join(' ');
  // Explicitly unadjusted summaries may carry explanatory text after the label.
  // Do not turn that explanation into evidence of covariate adjustment.
  function adjustmentStatus(row) {
    const t=String(row.adjustment||'').trim();
    if(!t||/^(?:(?:none|unadjusted|raw|not\s+adjusted)\b|なし(?:$|[\s、。;]))/i.test(t))return 'unadjusted';
    // Explanatory prose is not proof of adjustment. Conflicting positive and
    // negative labels require review; never authorize an SE-to-SD conversion.
    if(/\b(?:unknown|unclear|not reported|unadjusted|not\s+(?:an?\s+)?adjusted)\b|不明|未確定/i.test(t))return 'unknown';
    if(/\badjusted\b|covariate|\bANCOVA\b|least[- ]squares|estimated marginal|調整済|共変量/i.test(t))return 'adjusted';
    return 'unknown';
  }
  const adjusted = row => adjustmentStatus(row)==='adjusted';
  const pairedEffect = row => /paired|within[- ]?(?:person|subject)|対応のある|対応解析/i.test(row.adjustment || '') && !/unavailable|unknown|not reported|missing|不足|未報告|不明/i.test(row.adjustment || '') && row.resultType === 'effect';
  const expectedN = row => ['OUTCOME_ANALYZED','SAFETY'].includes(row.nBasis);
  function answer(statisticType,readiness,hint,details=[],derived) {
    return {statisticType,readiness,label:LABELS[readiness],hint,details:[...details],...(derived ? {derived,derivedCandidates:[derived]} : {})};
  }
  function derived(row,kind,statistics,formula,inputs,assumptions) {
    return {id:`${row.id || 'value'}:paper:${kind.toLowerCase()}`,rawValueId:row.id || null,kind,status:'PROPOSED',statistics,formula,inputs,
      sourceRefs:{...(row.sourceRefs || {})},assumptions:[...assumptions],guidanceSources:GUIDANCE_SOURCES.map(s=>s.url)};
  }
  function ci95(row,s) {
    return s.ciLevel === 95 || s.ciLevel === .95 || (!finite(s.ciLevel) && /95\s*%\s*(?:ci|confidence|信頼)/i.test(row.effectMeasure || ''));
  }
  // Read the reported direction; never infer a sign from the clinical I/C order.
  function comparisonDirection(row,study={}) {
    if(row.comparisonDirection)return row.comparisonDirection;
    const raw=rawOf(study), refs=new Set(Object.values(row.sourceRefs||{}));
    const text=[row.comparisonDirection,row.adjustment,row.population,...(raw.sources||[]).filter(s=>refs.has(s.id)).map(s=>s.column)].filter(Boolean).join(' ');
    if(/control\s*(?:minus|[−–-])\s*intervention/i.test(text))return 'Control minus Intervention';
    if(/intervention\s*(?:minus|[−–-])\s*control/i.test(text))return 'Intervention minus Control';
    const arms=studyOf(study).arms||[],a=arms.find(a=>a.id===row.armId),b=arms.find(a=>a.id===row.comparatorArmId);
    return a&&b?`${a.label} vs ${b.label} (reported order)`:'Not reported';
  }
  function derivedPreview(candidate) {
    if(candidate.kind!=='EFFECT_CI')return candidate;
    const s=candidate.inputs||{},original=candidate.rawInputs||s;
    return {'Raw effect':original.estimate,'CI low':original.ciLow,'CI high':original.ciHigh,'confidence level':s.ciLevel===.95?'95%':`${s.ciLevel}%`,
      ...(candidate.basis==='HUMAN_FINAL'?{'Final effect / CI used':s}:{}),
      'Derived SE':candidate.statistics.se,'comparison direction':candidate.comparisonDirection||'Not reported',formula:candidate.formula};
  }
  function validCI(s,estimate) { return finite(s.ciLow) && finite(s.ciHigh) && s.ciLow < s.ciHigh && (!finite(estimate) || s.ciLow <= estimate && estimate <= s.ciHigh); }
  function guard(row,outcome,study,value) {
    const detail=[];
    let review=false;
    if (correlated(study) && !pairedEffect(row)) {
      review=true;
      detail.push(crossover(study) ? 'Cross-over：通常の独立2群RCTとして投入せず、paired analysis / within-person情報を優先します。両periodのevents/totalだけでは不一致ペアは分かりません。' : '相関を含むデザインです。クラスタリング・within-person調整を確認してください。');
    }
    if (!studyOf(study).design) { review=true; detail.push('研究デザインを確認してください。'); }
    if (finite(row.confidence) && row.confidence < .7 || finite(outcome.confidence) && outcome.confidence < .7) { review=true; detail.push('図の概算または確信度の低い候補です。原著を確認してください。'); }
    if (row.nBasis === 'UNKNOWN' && (finite(row.statistics?.n) || finite(row.statistics?.total))) { review=true; detail.push('この数値に対応する解析集団・分母を確認してください。'); }
    if (isBaseline(row)) detail.push('介入前の値です。介入後値やchangeのSDへ転用しないでください。');
    const raw=rawOf(study), byId=new Map((raw.sources || []).map(s=>[s.id,s]));
    const sdSource=byId.get(row.sourceRefs?.sd), meanSource=byId.get(row.sourceRefs?.mean);
    if (!isBaseline(row) && sdSource && /baseline|pre[- ]?treatment|介入前/i.test([sdSource.row,sdSource.column].join(' ')) && (!meanSource || !/baseline|pre[- ]?treatment|介入前/i.test([meanSource.row,meanSource.column].join(' ')))) {
      review=true; detail.push('SDの出典が介入前を指しています。介入後Meanと組み合わせないでください。');
    }
    if (review && ['DIRECT','CONVERTIBLE'].includes(value.readiness)) {
      value={...value,readiness:'REVIEW',label:LABELS.REVIEW,hint:crossover(study) && !pairedEffect(row) ? `${value.hint} / Cross-overの対応解析を確認` : value.hint};
    }
    return {...value,details:unique([...value.details,...detail])};
  }
  function classify(rawRow,outcome={},study={}) {
    const row=rawRow?.raw || rawRow || {}, s=row.statistics || {}, text=textOf(row,outcome), change=row.resultType==='change';
    if((studyOf(study).arms||[]).some(a=>ontology.isMetadata(a)&&[row.armId,row.comparatorArmId].includes(a.id)))return answer('Study metadata','UNUSABLE','研究全体の記述値です。Treatment arm・独立した比較として使用しません。');
    let value;
    const finish=x=>guard(row,outcome,study,x);
    if (/median|中央値/i.test(text) || finite(s.median)) {
      const type=/IQR|interquartile|四分位/i.test(text) || finite(s.q1) || finite(s.iqr) ? 'Median + IQR' : /range|範囲/i.test(text) || finite(s.min) ? 'Median + range' : 'Median';
      return finish(answer(type,'REVIEW','Mean/SDではありません。通常のMean Differenceへそのまま入力できません。',['変換を採用する場合は方法・分布の仮定を明示し、Rawの中央値を保持してください。']));
    }
    if (/mean ranks?|average ranks?|平均順位/i.test(text)) return finish(answer('Mean rank','UNUSABLE','平均順位です。測定値のMean/SDとしては使えません。',['順位を元の尺度の平均に読み替えません。']));
    const classification=effectTypes.resolve(row,outcome,rawOf(study));
    if(classification?.status==='NEEDS_REVIEW')return finish({...answer('Effect type unresolved','REVIEW',classification.reason),effectClassification:classification});
    const logRatio=classification?.isLog;
    const ratio=classification?({RATE_RATIO:'Rate ratio',RISK_RATIO:'RR',HR:'HR',OR:'OR'}[classification.kind]):null;
    const difference=/\bSMD\b|standardized mean difference/i.test(text)?'SMD':/\bRD\b|risk difference/i.test(text)?'RD':/\bMD\b|mean difference|群間差/i.test(text)||row.resultType==='effect'&&row.comparatorArmId&&/adjusted between[- ]group difference/i.test(text)?'MD':null;
    if ((ratio || difference) && finite(s.estimate)) {
      const measure=ratio || difference, type=`${adjusted(row)?'Adjusted ':''}${logRatio?'log ':''}${measure}`;
      const short=ratio==='HR' ? 'HRはRRではありません。通常 log(HR) + SE をGIVで扱います。' : ratio==='OR' ? 'ORとして扱います。RRとそのまま同じ解析へ混ぜません。' : ratio ? `${measure}として扱い、GIVでは通常log効果量 + SEを使用します。` : adjusted(row) ? '調整済み群間差です。arm別Mean/SDとは別にGIVで扱います。' : `${measure}としてGIVで扱う候補です。`;
      const reportedRatio=['RATE_RATIO','RISK_RATIO'].includes(classification?.kind);
      const result=x=>finish({...x,...(classification?{effectClassification:classification}:{}),...(reportedRatio?{hint:x.readiness==='CONVERTIBLE'?`${classification.reportedLabel} → ${classification.logLabel} + SE に変換可能 → Generic inverse variance候補`:x.readiness==='DIRECT'?`${classification.reportedLabel} → ${classification.logLabel} + SE → Generic inverse variance候補`:x.hint}: {})});
      const notes=['GIV = Generic inverse variance。効果方向、調整因子、SE/CIの計算方法が同じ解析に対応することを確認してください。',...(classification?.basis!=='EXTRACTED_LABEL'&&classification?[`原著の報告名: ${classification.reportedLabel}。推定方法: ${classification.estimationMethod||'出典参照'}。Rawの効果名は履歴として保持します。`]:[])];
      if (ratio && !logRatio && s.estimate<=0) return result(answer(type,'UNUSABLE',`${measure}は正の値である必要があります。`,notes));
      if (finite(s.se) && s.se>0 && (!ratio || logRatio)) return result(answer(type,'DIRECT',short,notes));
      if (finite(s.se) && s.se>0 && ratio && /(?:log|ln)[- ]?scale|対数尺度/i.test(row.adjustment || '')) {
        return result(answer(type,'CONVERTIBLE',short,notes,{...derived(row,'LOG_RATIO',{estimate:Math.log(s.estimate),se:s.se},`effect = ln(${measure}); SE(log effect) reported`,{estimate:s.estimate,se:s.se},['報告SEが対数効果量のSEであること。']),effectType:classification.exportType,effectClassification:classification,comparisonDirection:comparisonDirection(row,study)}));
      }
      if (validCI(s,s.estimate) && ci95(row,s)) {
        if (ratio && !logRatio && s.ciLow<=0) return result(answer(type,'UNUSABLE','対数変換には正のCI下限・上限が必要です。',notes));
        const low=ratio&&!logRatio?Math.log(s.ciLow):s.ciLow, high=ratio&&!logRatio?Math.log(s.ciHigh):s.ciHigh, estimate=ratio&&!logRatio?Math.log(s.estimate):s.estimate;
        // This is explicitly a proposed Wald conversion, not a claim about the report's CI method.
        const assumptions=['95% CIが正規近似（Wald型）に基づくこと。t分布・profile likelihood等の場合はその方法に合うSEを確認すること。','表示桁の丸めにより変換値は近似となること。'];
        const preciseMD=difference==='MD',denominator=preciseMD||reportedRatio?2*1.959964:3.92;
        const item=derived(row,ratio?'LOG_RATIO_CI':'EFFECT_CI',{estimate,se:(high-low)/denominator},ratio&&!logRatio?'effect = ln(ratio); SE = (ln(CI upper) − ln(CI lower)) / 3.92':preciseMD?'SE = (upper - lower) / (2 × 1.959964)':'SE = (CI upper − CI lower) / 3.92',{estimate:s.estimate,ciLow:s.ciLow,ciHigh:s.ciHigh,ciLevel:95},assumptions);
        item.comparisonDirection=comparisonDirection(row,study);
        item.effectType=preciseMD?(adjusted(row)?'adjusted mean difference':'mean difference'):type;
        if(classification){item.effectClassification=classification;item.effectType=classification.exportType;if(reportedRatio)item.formula=logRatio?'effect = reported log effect; SE = (CI upper − CI lower) / (2 × 1.959964)':`effect = ${classification.logLabel}; SE = (ln(CI upper) − ln(CI lower)) / (2 × 1.959964)`;}
        const asymmetry=Math.abs((high-estimate)-(estimate-low))/(high-low);
        if (asymmetry>.2) return result(answer(type,'REVIEW',`${short} CIの非対称性と算出法を確認してください。`,[...notes,'CIが効果量の適切な尺度で対称ではないため、数値変換候補を作成していません。']));
        return result(answer(type,'CONVERTIBLE',preciseMD&&adjusted(row)?'調整済み群間差 · 95% CIからSEを算出可能 · Generic inverse varianceで使用候補（arm別Mean/SDとは別）':short,[...notes,...assumptions],item));
      }
      return result(answer(type,'REVIEW',`${short} ${finite(s.se)&&ratio?'SEがlog尺度か確認してください。':'SEまたはCI水準を確認してください。'}`,notes));
    }
    if (finite(s.events) || finite(s.total)) {
      if (Number.isInteger(s.events) && Number.isInteger(s.total) && s.total>0 && s.events>=0 && s.events<=s.total) value=answer('Events / Total','DIRECT','二値アウトカムとして使用候補。Events / Total。',['参加者数と反復イベント数を区別し、同じ追跡期間・解析集団で比較してください。']);
      else value=answer('Events / Total','UNUSABLE','events/totalを確定できません。分子・分母を確認してください。');
      return finish(value);
    }
    if (finite(s.mean)) {
      const prefix=change?'Change mean':'Mean';
      if (/LS\s*mean|least[- ]squares|estimated marginal|最小二乗/i.test(text) || adjusted(row)) {
        return finish(answer(`${/LS|least/i.test(text)?'LS mean':'Adjusted mean'}${finite(s.se)?' + SE':validCI(s,s.mean)?' + CI':finite(s.sd)?' + SD':''}`,'REVIEW','調整済み平均です。SEをarm別SDへ置き換えません。',['原著の調整済み群間差とSE/CIがあれば、別のGIV候補として扱えます。']));
      }
      if(adjustmentStatus(row)==='unknown')return finish(answer(`${prefix}${finite(s.se)?' + SE':finite(s.sd)?' + SD':validCI(s,s.mean)?' + CI':''}`,'REVIEW','調整の有無を原著で確認してください。説明文だけで調整済み平均と判定せず、SE/CIからSDへ自動変換しません。',[row.adjustment]));
      if (finite(s.sd) && s.sd>=0) {
        value=answer(`${prefix} + SD`,s.n>1&&expectedN(row)&&s.sd>0?'DIRECT':'REVIEW',s.n>1&&expectedN(row)?`${change?'Change':'Endpoint'} Mean / SD / nを連続値として使用候補。`:'平均とSDはあります。対応する解析nを確認してください。',['同じ群・時点・result typeのMean / SD / nを使います。baseline、endpoint、changeを混用しません。']);
        if(s.sd===0)value.details.push('SD=0の妥当性を原著で確認してください。');
        return finish(value);
      }
      if (finite(s.se) && s.se>=0) {
        const eligible=s.n>1&&row.nBasis==='OUTCOME_ANALYZED'&&!correlated(study)&&s.se>0;
        const candidate=eligible?derived(row,'SE_TO_SD',{mean:s.mean,sd:s.se*Math.sqrt(s.n),n:s.n},'SD = SE × sqrt(n)',{se:s.se,n:s.n},['SEとnが同じ群・時点の非調整の標本平均に対応すること。']):null;
        return finish(answer(`${prefix} + SE`,eligible?'CONVERTIBLE':'REVIEW','これはSDではなくSEです。RevManのSD欄へそのまま入れないでください。',['対応する解析nを確認できればSD変換の候補になります。',...(correlated(study)?['対応・クラスタ構造を含むSEから通常の群内SDは算出しません。']:[])],candidate));
      }
      if (validCI(s,s.mean)) {
        if(ci95(row,s)&&s.n>100&&row.nBasis==='OUTCOME_ANALYZED'&&!correlated(study)){
          const se=(s.ciHigh-s.ciLow)/3.92;
          const item=derived(row,'MEAN_CI_NORMAL',{mean:s.mean,se,sd:se*Math.sqrt(s.n),n:s.n},'SE = (CI upper − CI lower) / 3.92; SD = SE × sqrt(n)',{mean:s.mean,ciLow:s.ciLow,ciHigh:s.ciHigh,ciLevel:95,n:s.n},['同じ非調整群平均の95% CIであり、大標本の正規近似が適切であること。','原著がt分布等を使用した場合は、その自由度・方法で再計算すること。']);
          return finish(answer(`${prefix} + CI`,'CONVERTIBLE','CIはSDではありません。大標本の正規近似によるSE / SDの変換候補です。',item.assumptions,item));
        }
        return finish(answer(`${prefix} + CI`,'REVIEW','CIはSDではありません。CI水準・n・算出法を確認してSE/SD変換を検討します。',['小標本の平均のCIではt分布の自由度が必要です。95%という仮定だけでSDを自動計算しません。']));
      }
      return finish(answer(`${prefix} only`,'REVIEW','Meanのみです。対応するSDまたはSE/CIと解析nを確認してください。'));
    }
    if (finite(s.eventCount) && s.eventCount>=0) return finish(answer('Count / person-time',s.personTime>0?'DIRECT':'UNUSABLE',s.personTime>0?'発生率の候補です。参加者のevents/totalとは別に扱います。':'person-timeが不明で発生率を確定できません。',['追跡時間の単位を揃え、反復イベントや過分散を確認してください。']));
    if (finite(s.estimate) && row.resultType==='effect' && row.comparatorArmId && /absolute (?:risk )?(?:reduction|difference)|difference in (?:percentages|proportions)|絶対(?:リスク)?(?:減少|差)/i.test(row.effectMeasure||'') && /percentage points?|percent(?:age)?[- ]points?|パーセントポイント/i.test(text)) return finish(answer('Absolute difference (percentage points)','REVIEW','群間の絶対差（パーセントポイント）です。群内割合やRRではありません。',['効果方向、単位、調整、CIの算出法を確認して扱います。Rawの数値を割合へ自動換算しません。','分子・分母の逆算やCIからの自動変換は行っていません。']));
    if (finite(s.estimate) && /percent|percentage|%|割合|比率/i.test(text)) return finish(answer('Percentage only','UNUSABLE','分母がない割合です。この形ではevents/totalにできません。',['割合から分子・分母を逆算しません。']));
    if (finite(s.estimate)) return finish(answer('Other estimate','REVIEW','統計量の種類とばらつきを確認してください。Mean/SDとは見なしません。'));
    return finish(answer('Not reported','UNUSABLE','この候補には解析用の数値がありません。'));
  }
  function cleanTreatment(label) {
    return String(label||'').replace(/\s*\([^)]*(?:period|pooled|paired|summary|completer|両期間)[^)]*\)/gi,'').replace(/\s*\[[^\]]*(?:period|pooled)[^\]]*\]/gi,'').trim();
  }
  function comparisons(input) {
    const raw=rawOf(input), study=studyOf(input), armOntology=ontology.build(raw), arms=armOntology.isFactorial?armOntology.analysisNodes:armOntology.treatmentArms, cross=crossover(study);
    const details=arms.map(a=>({armId:a.id,label:a.label,role:a.role,isSequence:isSequence(a)}));
    let treatmentArms=cross?arms.filter(a=>!isSequence(a)):arms.slice(), warning='';
    if(cross)warning='Cross-over：paired comparisonを優先します。通常の独立2群RCTとして扱わないでください。';
    if(cross&&treatmentArms.length<2){
      const treatments=unique(arms.filter(isSequence).flatMap(a=>String(a.label).split(/→|->/).map(cleanTreatment)).filter(Boolean));
      treatmentArms=treatments.map((label,i)=>({id:null,label,role:i?'comparator':'intervention'}));
    }
    const roleControls=treatmentArms.filter(a=>/comparator|control|対照/i.test(a.role||''));
    const controls=roleControls.length?roleControls:treatmentArms.filter(a=>/placebo|usual care|プラセボ|通常治療/i.test(a.label||''));
    const control=controls[0];
    const comparator=control || (treatmentArms.length===2?treatmentArms[1]:null);
    let pairs=[];
    if(controls.length>1){
      // Multiple diagnostic strata may each have their own control. Explicit
      // contrasts take precedence; a shared outcome alone does not join strata.
      const values=raw.rawValues||[], explicit=unique(values.filter(r=>r.armId&&r.comparatorArmId).map(r=>`${r.armId}\u0000${r.comparatorArmId}`));
      pairs=explicit.map(k=>k.split('\u0000').map(id=>treatmentArms.find(a=>a.id===id))).filter(pair=>pair.every(Boolean));
      const scope=r=>JSON.stringify([r.outcomeId,r.timepoint,r.resultType,populationKey(r,arms)]);
      const armScopes=a=>new Set(values.filter(r=>r.armId===a.id&&!r.comparatorArmId&&norm(r.population)).map(scope));
      const unresolved=[];
      for(const a of treatmentArms.filter(a=>!controls.includes(a)&&!pairs.some(([i])=>i.id===a.id))){
        const scopes=armScopes(a), matches=controls.filter(c=>[...armScopes(c)].some(k=>scopes.has(k)));
        if(matches.length===1)pairs.push([a,matches[0]]);else unresolved.push(a);
      }
      if(unresolved.length)warning='対照群が複数あります。対応する比較を原著で確認してください。未確定の群は詳細に保持しています。';
    }
    else if(comparator)pairs=treatmentArms.filter(a=>a!==comparator).map(a=>[a,comparator]);
    else {
      const explicit=unique((raw.rawValues||[]).filter(r=>r.armId&&r.comparatorArmId).map(r=>`${r.armId}\u0000${r.comparatorArmId}`));
      pairs=explicit.map(k=>k.split('\u0000').map(id=>treatmentArms.find(a=>a.id===id))).filter(pair=>pair.every(Boolean));
      if(!pairs.length&&treatmentArms.length>1)warning='比較対象の組合せを詳細で確認してください。対照群は自動で決めていません。';
    }
    const counts=new Map();for(const [,c]of pairs)counts.set(c.id,(counts.get(c.id)||0)+1);
    const items=pairs.map(([i,c],index)=>{
      const armIds=[i.id,c.id].filter(Boolean), values=raw.rawValues||[];
      const outcomeIds=unique(values.filter(r=>r.armId===i.id&&(r.comparatorArmId===c.id||values.some(other=>other.outcomeId===r.outcomeId&&other.armId===c.id))).map(r=>r.outcomeId));
      return {id:`comparison:${i.id||'t'+index}:${c.id||'control'}`,label:`${cleanTreatment(i.label)} vs ${cleanTreatment(c.label)}`,intervention:cleanTreatment(i.label),comparator:cleanTreatment(c.label),armIds,
        interventionArmId:i.id,comparatorArmId:c.id,sharedControl:!cross&&(counts.get(c.id)||0)>1,outcomeIds,isCrossover:cross,pooled:!!(i.pooled||c.pooled),fullLabel:`${i.fullLabel||i.label} vs ${c.fullLabel||c.label}`};
    });
    if(items.some(c=>c.sharedControl))warning='共有対照です。複数の比較へ同じ対照群を独立した観測として重複投入しないでください。';
    if(armOntology.isFactorial)warning='Factorial trial：pooled analysis nodeと元の割付群は独立した追加群ではありません。同じ参加者を含むcontrastを重複投入しないでください。';
    return {design:cross?'Cross-over RCT':armOntology.isFactorial?`${/3\s*[×x]\s*2/i.test(study.design)?'3 × 2 factorial trial':'Factorial trial'} · ${armOntology.originalArms.length} randomized groups · ${armOntology.analysisNodes.length} analysis nodes`:study.design||'研究デザイン未確認',isCrossover:cross,items,details,warning,armOntology};
  }
  function populationKey(row,arms=[]) {
    let p=norm(row.population);
    // Arm names may vary within the same analysis-population description. Remove only
    // known names, retaining all subgroup, exclusion, safety and missing-data qualifiers.
    const names=unique(arms.flatMap(a=>[norm(a.label),norm(cleanTreatment(a.label))])).filter(Boolean).sort((a,b)=>b.length-a.length);
    for(const name of names){
      const escaped=name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
      p=p.replace(new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}(?=$|[^\\p{L}\\p{N}])`,'gu'),(_,before)=>`${before}@arm`);
    }
    return `${row.nBasis || 'UNKNOWN'}:${p}`;
  }
  function setReadiness(rows,outcome,raw,comparison) {
    const classified=rows.map(v=>classify(v.raw||v,outcome,raw));
    const ranks={DIRECT:0,CONVERTIBLE:1,REVIEW:2,UNUSABLE:3};
    let value=classified.slice().sort((a,b)=>ranks[b.readiness]-ranks[a.readiness])[0] || answer('Not reported','UNUSABLE','解析用の数値がありません。');
    const hasEffect=rows.some(v=>(v.raw||v).comparatorArmId);
    const ids=unique(rows.map(v=>(v.raw||v).armId));
    if(!hasEffect&&comparison.armIds.length===2&&!comparison.armIds.every(id=>ids.includes(id))&&['DIRECT','CONVERTIBLE'].includes(value.readiness))value={...value,readiness:'REVIEW',label:LABELS.REVIEW,hint:'片側の群の候補です。比較側の同じ時点・解析集団の値を確認してください。'};
    if(comparison.sharedControl)value={...value,details:unique([...value.details,'共有対照の重複投入を避けるため、採用する比較と解析方法を確認してください。'])};
    return {...value,rowClassifications:classified};
  }
  function resultSets(model,comparisonModel) {
    const raw=model.raw, arms=new Map((raw.study.arms||[]).map(a=>[a.id,a])), sets=[];
    for(const o of [...(model.clinical||[]),...(model.metadata||[])]){
      const views=o.rows||[];
      for(const comparison of comparisonModel.items){
        const eligible=views.filter(v=>ontology.eligible(v.raw,comparison,raw));
        const groups=new Map();
        for(const view of eligible){
          const r=view.raw, key=JSON.stringify([r.timepoint,r.resultType,populationKey(r,[...arms.values()]),r.effectMeasure||'',r.adjustment||'',isBaseline(r),...(comparisonModel.armOntology.isFactorial?[ontology.analysisScope(r,raw)]:[])]);
          if(!groups.has(key))groups.set(key,[]);groups.get(key).push(view);
        }
        for(const rows of groups.values()){
          const r=rows[0].raw;
          sets.push({id:`paper-set:${o.id}:${comparison.id}:${rows.map(v=>encodeURIComponent(v.raw.id)).sort().join(',')}`,label:`${r.timepoint} · ${isBaseline(r)?'Baseline':r.resultType}`,comparisonId:comparison.id,comparison:comparison.label,
            outcomeId:o.id,timepoint:r.timepoint,resultType:isBaseline(r)?'baseline':r.resultType,rows,rawValueIds:rows.map(v=>v.raw.id),armIds:unique(rows.map(v=>v.raw.armId)),
            readiness:setReadiness(rows,o,raw,comparison),sequenceDetail:false,sharedControl:comparison.sharedControl});
        }
      }
      const details=comparisonModel.isCrossover?views.filter(v=>isSequence(arms.get(v.raw.armId)||{})):[];
      const represented=new Set(sets.filter(s=>s.outcomeId===o.id).flatMap(s=>s.rawValueIds));
      for(const view of views.filter(v=>details.includes(v)||!represented.has(v.raw.id))){
        const r=view.raw;
        sets.push({id:`paper-detail:${r.id}`,label:`${r.timepoint} · ${isBaseline(r)?'Baseline':r.resultType}`,comparisonId:null,comparison:arms.get(r.armId)?.label||'比較未確定',outcomeId:o.id,
          timepoint:r.timepoint,resultType:isBaseline(r)?'baseline':r.resultType,rows:[view],rawValueIds:[r.id],armIds:[r.armId].filter(Boolean),readiness:classify(r,o,raw),sequenceDetail:comparisonModel.isCrossover&&details.includes(view),ontologyDetail:comparisonModel.armOntology.isFactorial||ontology.isMetadata(arms.get(r.armId)),sharedControl:false});
      }
    }
    return sets;
  }
  function outcomeScore(o,sets) {
    // Keep noncomparative extension data searchable, without displacing the
    // randomized comparison. Use explicit existing context, never study names.
    const nonBaseline=sets.filter(s=>s.resultType!=='baseline');
    if(nonBaseline.length&&nonBaseline.every(s=>!s.comparisonId&&s.rows.every(v=>v.raw.armId==null&&/non[- ]randomized.*(?:extension|open[- ]label)|no concurrent control/i.test(v.raw.population||''))))return -25;
    const name=[o.reportedName,o.conceptCandidate,o.instrument].join(' '), usable=sets.filter(s=>s.resultType!=='baseline'&&!s.sequenceDetail&&!s.ontologyDetail&&s.rows.some(r=>r.raw.armId!=null||!(/pooled/i.test(r.raw.population||'')&&/not.*(?:arm|comparison)|no control/i.test([r.raw.population,r.raw.adjustment].join(' ')))));
    const sequenceOnly=!usable.length&&sets.some(s=>s.sequenceDetail&&s.resultType!=='baseline');
    if(!usable.length&&!sequenceOnly)return -100;
    if(sequenceOnly&&!/primary|VAS.*pain|pain.*VAS/i.test([o.mapping?.reason,name].join(' ')))return -30;
    let score=o.priority==='A'?45:o.priority==='B'?15:0;
    score+=usable.length?Math.max(...usable.map(s=>({DIRECT:25,CONVERTIBLE:20,REVIEW:12,UNUSABLE:0})[s.readiness.readiness]||0)):10;
    if(/primary|co.primary/i.test([o.mapping?.reason,o.reportedName].join(' ')))score+=40;
    if(/global.*pain.*(?:relief|improvement)|any.*pain.*(?:relief|improvement)|some or much|total.*pain.*(?:relief|improvement)/i.test(name))score+=36;
    if(/(?:VAS|NRS|BPI).*pain|pain.*(?:VAS|NRS|BPI)|roland|bothersomeness/i.test(name))score+=30;
    else if(/pain intensity|overall pain|pain (?:level|score|in the most affected)|(?:total|sensory|affective).*mcgill|mcgill.*(?:score|component)/i.test(name))score+=30;
    if(/adverse.*(?:event|effect)|safety/i.test(name))score+=12;
    if(/any adverse|participants.*adverse|one.*adverse/i.test(name))score+=15;
    if(/some.*relief|much.*relief/i.test(name)&&!/some or much/i.test(name))score-=12;
    if(/discontinu|mortality|death|quality of life|function/i.test(name))score+=10;
    if(/baseline|psychometric|SCL|NPS|inventory|resource|adherence|exploratory|withdraw/i.test(name))score-=20;
    return score;
  }
  function clinicalFamily(o) {
    const name=[o.reportedName,o.conceptCandidate,o.instrument].join(' ');
    if(/global.*(?:perceived)?.*pain.*relief|GPE.*pain/i.test(name))return 'global-pain-relief';
    if(/adverse|side effects|safety/i.test(name))return 'adverse-effects';
    return o.id;
  }
  function build(input,context={}) {
    const model=input?.rawViews ? input : results.build(input?.raw?input:{raw:input,analysisReadyCandidates:[],normalizedCandidates:[],proposals:[]},context);
    const comparisonModel=comparisons(model), sets=resultSets(model,comparisonModel);
    const entries=[...(model.clinical||[]),...(model.metadata||[])].map(o=>{
      const paperResultSets=sets.filter(s=>s.outcomeId===o.id);
      return {...o,paperResultSets,paperScore:outcomeScore(o,paperResultSets)};
    });
    const ranked=entries.slice().sort((a,b)=>b.paperScore-a.paperScore), families=new Set(),mainOutcomes=[];
    for(const o of ranked.filter(o=>o.paperScore>=0&&!o.parentOutcomeId&&!['denominator','conduct','baseline'].includes(o.presentationCategory))){const family=clinicalFamily(o);if(families.has(family))continue;families.add(family);mainOutcomes.push(o);if(mainOutcomes.length===5)break;}
    const selected=new Set(mainOutcomes.map(o=>o.id));
    return {version:VERSION,raw:model.raw,model,comparisons:comparisonModel,mainOutcomes,otherOutcomes:ranked.filter(o=>!selected.has(o.id)),resultSets:sets};
  }
  return Object.freeze({VERSION,LABELS,GUIDANCE_SOURCES,norm,crossover,correlated,classify,comparisonDirection,derivedPreview,comparisons,resultSets,build,armOntology:ontology.build,armOverlap:ontology.overlap,analysisScope:ontology.analysisScope,resolveEffectType:effectTypes.resolve,parseEffectType:effectTypes.parseLabel});
});
