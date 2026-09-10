/* Compact result cards. Every displayed value retains the original Raw and source IDs. */
window.DataExResultsUI = (() => {
  'use strict';
  const model=window.DataExResultsModel;
  const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!=null)n.textContent=String(text);if(cls)n.className=cls;return n;};
  const button=(text,handler,cls)=>{const n=el('button',text,cls);n.type='button';n.addEventListener('click',handler);return n;};
  const uniq=items=>[...new Set(items)];
  // Display aliases only: never change the reported labels, Raw or SourceAnchors.
  const armAliases=new Map([
    ['individualized acupuncture','Indiv.'],['standardized acupuncture','Standard'],
    ['simulated acupuncture','Simulated'],['usual care','Usual care']
  ]);
  const outcomeAliases=new Map([
    ['Roland disability score (modified Roland Disability Questionnaire)','Roland disability'],
    ['Symptom bothersomeness in the past week','Symptom bothersomeness'],
    ['Improvement of at least 3 points on the Roland scale','Roland ≥3-point improvement'],
    ['Improvement of at least 2 points on the symptom bothersomeness scale','Bothersomeness ≥2-point improvement'],
    ['Moderate or severe adverse experience possibly related to treatment','Moderate / severe adverse experience'],
    ['Severe adverse experience: pain lasting one month','Severe adverse experience'],
    ['Moderate adverse experience possibly related to treatment','Moderate adverse experience']
  ]);
  const compact=(text,max)=>{const chars=Array.from(String(text));return chars.length>max?chars.slice(0,max-1).join('').trimEnd()+'…':String(text);};
  function armHeaders(arms) {
    const short=arms.map(a=>armAliases.get(a.label.trim().toLowerCase())||compact(a.label,18));
    return arms.map((a,i)=>{const label=short.filter(s=>s===short[i]).length>1?`${short[i]} (${a.id})`:short[i];
      const abbr=el('abbr',label,'result-arm-short');abbr.title=a.label;abbr.tabIndex=0;abbr.setAttribute('aria-label',a.label);return abbr;});
  }
  function fold(label,build,id) {
    const d=el('details',null,'result-details');if(id)d.id=id;d.append(el('summary',label));
    let built=false;d.addEventListener('toggle',()=>{if(d.open&&!built){built=true;build(d);}});return d;
  }
  function warning(label,detail) {
    const d=fold(label,node=>node.append(el('p',detail,'result-note')));d.classList.add('result-warning');return d;
  }
  function download(value,type,filename) {
    const url=URL.createObjectURL(new Blob([value],{type})), a=el('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  function table(headers,rows,label) {
    const wrap=el('div',null,'result-table-wrap'), t=el('table',null,'result-table'), caption=el('caption',label), head=el('thead'), tr=el('tr'), body=el('tbody');
    t.dataset.columns=headers.length;
    for(const h of headers){const th=el('th');if(h instanceof Node)th.append(h);else th.textContent=h;th.scope='col';tr.append(th);}head.append(tr);
    for(const values of rows){const tr=el('tr');values.forEach((v,i)=>{const cell=el(i===0?'th':'td');if(i===0)cell.scope='row';if(v instanceof Node)cell.append(v);else cell.textContent=v==null?'—':String(v);tr.append(cell);});body.append(tr);}
    t.append(caption,head,body);wrap.append(t);return wrap;
  }
  function render({root,study,context,loaded,navigation,review}) {
    const view=model.build(study,context), raw=view.raw, armMap=new Map(raw.study.arms.map(a=>[a.id,a])), outcomeMap=new Map(raw.outcomes.map(o=>[o.id,o]));
    const paper=window.DataExPaperModel.build(view,context), crossing=paper.comparisons.isCrossover;
    root.replaceChildren();root.classList.add('result-workspace','paper-workspace');
    const labels={headings:uniq(raw.sources.map(s=>s.row?.split(/\s+\/\s+/)).filter(p=>p?.length>1).map(p=>p[0])),rows:uniq(raw.sources.map(s=>s.row?.split(/\s+\/\s+/).at(-1)).filter(Boolean))};
    const go=async (anchor,rawId)=>{if(anchor){const result=await navigation.navigateToSource(anchor,labels);if(rawId)await review?.viewed(rawId,result);return result;}};
    function sourceButton(anchor,text,rawId) {
      const b=button(text||[anchor?.label,anchor?.pdfPage?'p.'+anchor.pdfPage:''].filter(Boolean).join(' · ')||'出典未確定',()=>go(anchor,rawId),'result-source');
      b.disabled=!loaded||!anchor;if(anchor){b.dataset.sourceId=anchor.sourceId;b.title=[anchor.pdfFile,'PDF p.'+anchor.pdfPage,anchor.label,anchor.row,anchor.column].filter(Boolean).join(' / ');}return b;
    }
    function valueButton(row) {
      const s=row.raw.statistics||{},finite=n=>typeof n==='number'&&Number.isFinite(n);
      let display=row.display;
      if(finite(s.mean)&&!finite(s.sd)&&!finite(s.se)&&finite(s.ciLow)&&finite(s.ciHigh))display=`${s.mean} [${s.ciLow}, ${s.ciHigh}]`;
      if(finite(s.median))display=`${s.median}${finite(s.q1)&&finite(s.q3)?` [${s.q1}, ${s.q3}]`:finite(s.min)&&finite(s.max)?` [${s.min}, ${s.max}]`:''}`;
      const presented={...row,display},b=sourceButton(row.sourceAnchor,display,row.raw.id);b.className='result-value';b.dataset.rawId=row.raw.id;
      b.setAttribute('aria-label',`${display} — ${armMap.get(row.raw.armId)?.label||row.raw.population||'比較効果'}, ${row.raw.timepoint}の原著`);return review?review.wrapValue(presented,b):b;
    }
    function matrix(rows,o,caption) {
      const regular=rows.filter(r=>!r.raw.comparatorArmId&&armMap.has(r.raw.armId));
      const times=uniq([...(o?.timepoints||[]).filter(t=>rows.some(r=>r.raw.timepoint===t)),...regular.map(r=>r.raw.timepoint)]);
      const shortTime=t=>t.replace(/weeks?/i,'週').replace(/Treatment period through /i,'治療期間 ～ ');
      const result=el('div');
      if(regular.length)result.append(table(['時点',...armHeaders(raw.study.arms)],times.map(time=>[shortTime(time),...raw.study.arms.map(a=>{
        const matches=regular.filter(r=>r.raw.timepoint===time&&r.raw.armId===a.id),cell=el('div',null,'result-cell');
        if(!matches.length)cell.append(el('span','未報告','result-missing'));
        matches.forEach(r=>{cell.append(valueButton(r));if(matches.length>1)cell.append(sourceButton(r.sourceAnchor));});return cell;
      })]),caption));
      const separate=rows.filter(r=>!regular.includes(r));
      if(separate.length)result.append(rowTable(separate,'比較・統合集団（元の報告単位）'));
      if(!rows.length)result.append(el('p','群別の追跡値は未報告。BaselineやRaw / Traceの記載を確認できます。','hint'));
      return result;
    }
    function rowTable(rows,label) {
      return table(['時点 / 比較','値','出典'],rows.map(r=>[
        [r.raw.timepoint,armMap.get(r.raw.armId)?.label||'統合集団',r.raw.comparatorArmId?'vs '+(armMap.get(r.raw.comparatorArmId)?.label||r.raw.comparatorArmId):''].filter(Boolean).join(' / '),
        valueButton(r),sourceButton(r.sourceAnchor)
      ]),label);
    }
    function rawBrowser(parent,subset=view.rawViews) {
      const controls=el('div',null,'result-filters'), choices={outcomeId:'Outcome',timepoint:'Time',armId:'Arm',resultType:'Type'}, selects={};
      let page=0;
      const list=el('div'), pager=el('div',null,'result-pagination'), status=el('span');status.setAttribute('role','status');
      function update() {
        const filtered=subset.filter(r=>Object.entries(selects).every(([key,node])=>!node.value||String(r.raw[key])===node.value)), pages=Math.max(1,Math.ceil(filtered.length/20));
        page=Math.min(page,pages-1);list.replaceChildren();
        const rows=filtered.slice(page*20,page*20+20);
        list.append(table(['Outcome / 時点 / 群','原値・候補','Source Trace'],rows.map(r=>{
          const details=fold('全統計量・解析集団',d=>{d.append(el('pre',JSON.stringify(r.raw,null,2)));const candidates=study.analysisReadyCandidates.filter(c=>c.rawValueId===r.raw.id||c.id===r.raw.id);d.append(el('pre',JSON.stringify(candidates,null,2)));});
          const val=el('div');val.append(valueButton(r),details);
          const source=el('div');r.sourceAnchors.forEach(a=>source.append(sourceButton(a)));
          return [[model.name(outcomeMap.get(r.raw.outcomeId)),r.raw.timepoint,armMap.get(r.raw.armId)?.label||'比較 / 統合集団',r.raw.resultType].join(' / '),val,source];
        }),'Raw / Trace — 最大20件ずつ表示'));
        status.textContent=`${filtered.length}件 · ${page+1}/${pages}ページ`;prev.disabled=page===0;next.disabled=page>=pages-1;
      }
      for(const [key,label] of Object.entries(choices)) {
        const wrap=el('label',label), select=el('select');select.setAttribute('aria-label',label+'でRawを絞り込み');const all=el('option','すべて');all.value='';select.append(all);
        for(const val of uniq(subset.map(r=>r.raw[key]).filter(v=>v!=null))){const opt=el('option',key==='outcomeId'?model.name(outcomeMap.get(val)):key==='armId'?armMap.get(val)?.label||val:val);opt.value=val;select.append(opt);}
        select.addEventListener('change',()=>{page=0;update();});selects[key]=select;wrap.append(select);controls.append(wrap);
      }
      const prev=button('前へ',()=>{page--;update();}),next=button('次へ',()=>{page++;update();});pager.append(prev,status,next);
      parent.append(controls,list,pager);update();
    }
    const shortTime=t=>{
      const text=String(t||'時点未記載');
      if(crossing&&/both.*(?:period|treatment)|pooled|両期間/i.test(text)){
        const weeks=([text,raw.study.followUp].join(' ')).match(/(\d+)[- ]?weeks?/i);
        return '両期間'+(weeks?`（各${weeks[1]}週）`:'');
      }
      return text.replace(/weeks?/ig,'週').replace(/Treatment period through /i,'治療期間 ～ ');
    };
    const distinctRows=rows=>[...new Map(rows.map(r=>[r.raw.id,r])).values()];
    const isBase=r=>r.raw.resultType==='baseline'||model.baseline(r.raw.timepoint);
    const isEffect=r=>r.raw.resultType==='effect'||!!r.raw.comparatorArmId;
    function treatmentHeaders(arms) {
      const headers=armHeaders(arms);
      if(crossing)arms.forEach((arm,i)=>{const c=paper.comparisons.items.find(c=>c.armIds.includes(arm.id));if(c)headers[i].textContent=arm.id===c.interventionArmId?c.intervention:c.comparator;});
      return headers;
    }
    function statistic(row,o) {return window.DataExPaperModel.classify(row.raw,o,raw);}
    function setDescriptor(set,o) {
      const comparison=paper.comparisons.items.find(c=>c.id===set.comparisonId);
      return {...set,label:model.name(outcomeMap.get(o.parentOutcomeId)||o),pointIds:set.rawValueIds||set.rows.map(r=>r.raw.id),outcomeId:o.parentOutcomeId||o.id,
        comparison:comparison?{...comparison,intervention:comparison.interventionArmId,comparator:comparison.comparatorArmId}:set.comparison};
    }
    function datum(row,o) {
      const box=el('div',null,'paper-datum'),type=el('span',null,'paper-statistic-type'),sample=el('span',null,'paper-sample-size');
      box.append(valueButton(row),type,sample);
      // Final edits update the number, statistical type and its own n together.
      const refresh=()=>{const current=review?.readFinalRow?.(row.raw.id)||row.raw,s=statistic({...row,raw:current},o);type.textContent=s.statisticType||'報告値';const n=current.statistics?.n;sample.textContent=n==null?'':'n='+n;sample.hidden=n==null;};
      refresh();review?.watchFinal?.(refresh);
      return box;
    }
    function metaHint(rows,o,readiness) {
      const box=el('div',null,'paper-meta-hints');
      let fingerprint='';
      const refresh=()=>{
      const finalRows=rows.map(r=>({...r,raw:review?.readFinalRow?.(r.raw.id)||r.raw}));
      const key=JSON.stringify(finalRows.map(r=>[r.raw.statistics,r.raw.nBasis]));if(key===fingerprint)return;fingerprint=key;box.replaceChildren();
      const infos=finalRows.map(r=>({row:r,...statistic(r,o)})), unique=[...new Map(infos.map(s=>[s.statisticType+'|'+s.hint,s])).values()];
      const severity={DIRECT:0,CONVERTIBLE:1,REVIEW:2,UNUSABLE:3};
      let state=infos.slice().sort((a,b)=>severity[b.readiness]-severity[a.readiness])[0]||readiness;
      if(readiness&&/片側/.test(readiness.hint||'')&&severity[state?.readiness]<2)state=readiness;
      if(state){const badge=el('p','● '+(state.label||state.readiness),'paper-readiness');badge.dataset.readiness=state.readiness||'';box.append(badge);}
      for(const info of unique) {
        const line=el('div',null,'paper-meta-line'), text=el('span',info.hint||info.label||'統計量と解析方法を確認してください。');
        line.append(text);if(info.row.sourceAnchor)line.append(sourceButton(info.row.sourceAnchor,'統計量の原著',info.row.raw.id));box.append(line);
        if(info.details)box.append(fold('統計量の扱い · 詳細',d=>{for(const t of Array.isArray(info.details)?info.details:[info.details])d.append(el('p',t));}));
      }
      // Guidance may be shared; conversions belong to each separate arm's Raw/Final row.
      for(const info of infos){const derived=info.derivedCandidates;if(!derived?.length)continue;
        const arm=armMap.get(info.row.raw.armId),label=(/HR/i.test(info.statisticType)?'log(HR) / SE変換候補':'変換候補を見る')+' · '+(arm?armAliases.get(arm.label.toLowerCase())||compact(arm.label,24):'比較効果');
        const detail=fold(label,d=>{d.classList.add('paper-derived-preview');d.append(el('p',[arm?.label,shortTime(info.row.raw.timepoint)].filter(Boolean).join(' / ')),el('p','Derivedの確認用候補です。Rawを保持し、自動採用・CSV反映はしません。','hint'),el('pre',JSON.stringify(derived,null,2)));});
        detail.dataset.derivedRawId=info.row.raw.id;box.append(detail);
      }
      };refresh();review?.watchFinal?.(refresh);return box;
    }
    function selectionSuggestion() {
      const eligible=paper.mainOutcomes.flatMap((o,index)=>(o.paperResultSets||[]).filter(s=>!s.sequenceDetail&&s.resultType!=='baseline'&&s.rows.length).map(set=>({o,set,index})));
      const typeRank={endpoint:0,event:0,effect:1,change:2,other:3};
      eligible.sort((a,b)=>a.index-b.index||(typeRank[a.set.resultType]??3)-(typeRank[b.set.resultType]??3));
      const choice=eligible[0];if(!choice)return null;
      const {o,set}=choice,stats=set.rows.map(r=>r.raw.statistics||{}),finite=n=>typeof n==='number'&&Number.isFinite(n);
      const all=key=>stats.every(s=>finite(s[key]));let reason;
      if(all('events')&&all('total'))reason='Events / Totalを比較候補として抽出しています。';
      else if(all('mean')&&all('sd'))reason=all('n')?'Mean / SD / nを抽出しています。':'Mean / SDを抽出しています。対応する解析nは要確認です。';
      else if(all('mean')&&all('se'))reason='抽出値はMean / SEです。SDへの換算条件を確認してください。';
      else if(all('mean'))reason='平均値の候補です。対応するばらつきと解析nを確認してください。';
      else reason=(set.readiness.statisticType||'報告値')+'の候補です。統計量の扱いを確認してください。';
      if(crossing)reason='両治療の値を優先表示しています。paired解析・within-person情報を確認してください。';
      const section=el('section',null,'paper-selection-suggestion');section.dataset.suggestedOutcome=o.id;section.dataset.suggestedTime=set.timepoint;section.dataset.suggestedType=set.resultType;
      section.append(el('h4','候補の選び方'),el('p',(outcomeAliases.get(model.name(o))||compact(model.name(o),44))+' · '+shortTime(set.timepoint)+' · '+set.resultType),el('p',reason),el('p','数値を押して原著を確認し、採用するデータを選んでください。'));
      return section;
    }
    function outcomeCard(o,initiallyOpen=false) {
      const article=el('article',null,'outcome-card');article.dataset.outcomeId=o.id;article.dataset.priority=o.priority;
      const header=el('div',null,'outcome-card-header'), h=el('h4'), body=el('div',null,'outcome-card-body');body.hidden=true;
      let built=false;
      const open=()=>{if(!built){built=true;buildBody();}body.hidden=!body.hidden;toggle.setAttribute('aria-expanded',String(!body.hidden));toggle.textContent=body.hidden?'値を表示':'閉じる';};
      const formalName=model.name(o), shortName=outcomeAliases.get(formalName)||compact(formalName,52);
      const title=button(shortName,()=>{if(body.hidden)open();go(o.sourceAnchor);},'outcome-title');title.disabled=!loaded;title.title=formalName;h.append(title);
      const toggle=button('値を表示',open,'outcome-toggle');toggle.setAttribute('aria-expanded','false');header.append(h,toggle);article.append(header);
      const formal=el('p',formalName,'outcome-formal-name');formal.title=formalName;article.append(formal);
      if(o.reviewMapping){const mapping=el('p',`SR: ${o.reviewMapping.reviewConcept} ↳ 原著: ${o.reportedName}`,'outcome-review-mapping');mapping.title=o.reviewMapping.reason+'（対応候補）';article.append(mapping);}
      const range=o.scale?.min!=null&&o.scale?.max!=null?`${o.scale.min}–${o.scale.max}`:'';
      const unit=range?String(o.scale?.unit||'').replace('('+range+')','').replace('('+range.replace('–','-')+')','').trim():o.scale?.unit;
      const direction=/lower.*better|higher.*worse|低.*良|高.*悪/i.test(o.scale?.direction||'')?'低いほど良い':/higher.*better|lower.*worse|高.*良|低.*悪/i.test(o.scale?.direction||'')?'高いほど良い':'';
      const sub=el('div',null,'outcome-card-meta');sub.append(el('span',[direction,range,unit].filter(Boolean).join(' · ')));
      if(o.sourceAnchor)sub.append(sourceButton(o.sourceAnchor));article.append(sub,body);
      function buildBody() {
        const sets=o.paperResultSets||paper.resultSets.filter(s=>s.outcomeId===o.id);
        const mainSets=sets.filter(s=>!s.sequenceDetail), detailSets=sets.filter(s=>s.sequenceDetail);
        const mainRows=distinctRows(mainSets.flatMap(s=>s.rows));
        const ordinary=mainRows.filter(r=>!isBase(r)&&!isEffect(r));
        const featuredEffects=ordinary.length?[]:mainRows.filter(isEffect);
        const times=uniq([...ordinary,...featuredEffects].map(r=>r.raw.timepoint));
        const availableComparisons=paper.comparisons.items.filter(c=>mainSets.some(s=>s.comparisonId===c.id));
        let selectedComparison=availableComparisons[0]?.id||null;
        let selectedTime=times[0]||mainSets.find(s=>s.resultType!=='baseline')?.timepoint||'';
        const tabs=el('div',null,'paper-time-tabs');tabs.setAttribute('role','group');tabs.setAttribute('aria-label',formalName+'の時点');
        const candidates=el('div',null,'paper-current-result');
        function draw() {
          candidates.replaceChildren();tabs.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.timepoint===selectedTime)));
          const endpoint=ordinary.filter(r=>r.raw.timepoint===selectedTime&&r.raw.resultType!=='change');
          const change=ordinary.filter(r=>r.raw.timepoint===selectedTime&&r.raw.resultType==='change');
          const baselines=mainRows.filter(isBase);
          const clinicalArms=crossing?raw.study.arms.filter(a=>mainRows.some(r=>r.raw.armId===a.id&&!r.raw.comparatorArmId)):raw.study.arms;
          const cell=(rows,a)=>{const c=el('div',null,'result-cell');const matches=rows.filter(r=>r.raw.armId===a.id);if(!matches.length)c.append(el('span','未報告','result-missing'));for(const r of matches)c.append(datum(r,o));return c;};
          if(o.dataType==='continuous'&&clinicalArms.length) {
            const baselineCell=a=>{
              const rows=baselines.filter(r=>r.raw.armId===a.id), endpointLabel=endpoint.find(r=>r.raw.armId===a.id)?.sourceAnchor?.label;
              const sameReport=endpointLabel?rows.filter(r=>r.sourceAnchor?.label===endpointLabel):[];
              const chosen=sameReport.length===1?sameReport:rows.length===1?rows:[];
              if(!chosen.length&&rows.length>1){const b=el('span','報告差あり · Baseline詳細','result-missing');b.title='単一の介入前値を選べないため、全報告をBaseline詳細に保持しています。';return b;}
              const content=cell(chosen,a);if(rows.length>1)content.append(el('span','他の報告はBaseline詳細','paper-sample-size'));return content;
            };
            const layers=[['介入前',...clinicalArms.map(baselineCell)],['介入後 '+shortTime(selectedTime),...clinicalArms.map(a=>cell(endpoint,a))],['変化量 '+shortTime(selectedTime),...clinicalArms.map(a=>cell(change,a))]];
            const t=table(['報告値',...treatmentHeaders(clinicalArms)],layers,'介入前 / 介入後 / 変化量 — 各行の統計量を区別');t.classList.add('paper-three-layers');candidates.append(t);
          } else if(endpoint.length||change.length) {
            const values=[...endpoint,...change];
            if(clinicalArms.length)candidates.append(table(['時点',...treatmentHeaders(clinicalArms)],[[shortTime(selectedTime),...clinicalArms.map(a=>cell(values,a))]],o.dataType==='binary'?'Events / Total（割合のみの場合は%）':'原著の報告値'));
            const ungrouped=values.filter(r=>!clinicalArms.some(a=>a.id===r.raw.armId));if(ungrouped.length)candidates.append(rowTable(ungrouped,'比較・統合集団'));
          } else if(featuredEffects.length)candidates.append(rowTable(featuredEffects.filter(r=>r.raw.timepoint===selectedTime),'Reported effect — 原著の効果量・CI'));
          else candidates.append(el('p',crossing?'治療比較の統合値は未報告。Sequence / periodの候補を詳細に保持しています。':'追跡値は未報告。原著の候補とBaselineを詳細に保持しています。','paper-no-paired'));
          const selectedSets=mainSets.filter(s=>s.timepoint===selectedTime&&s.resultType!=='baseline'&&(featuredEffects.length||s.resultType!=='effect')&&(!selectedComparison||s.comparisonId===selectedComparison));
          const guidanceRows=distinctRows([...endpoint,...change,...featuredEffects.filter(r=>r.raw.timepoint===selectedTime)]);
          if(guidanceRows.length&&!selectedSets.length)candidates.append(metaHint(guidanceRows,o));
          // Each control addresses exactly one comparison, timepoint and result type.
          for(const set of selectedSets){const target=el('section',null,'paper-result-set');target.dataset.resultSetId=set.id;target.dataset.resultType=set.resultType;
            target.append(el('p',`Result type: ${set.resultType} · ${shortTime(set.timepoint)}`,'paper-result-type'),metaHint(set.rows,o,set.readiness));
            review?.attachResultSet?.(target,setDescriptor(set,o));candidates.append(target);}
          if(!guidanceRows.length&&detailSets.length)candidates.append(el('p','● 確認が必要 · paired analysis / within-person情報を優先します。','paper-readiness'));
        }
        for(const t of times){const b=button(shortTime(t),()=>{selectedTime=t;draw();},'paper-time-button');b.dataset.timepoint=t;b.title=t;tabs.append(b);}
        if(times.length>1)body.append(el('p','時点','paper-time-label'),tabs);
        if(availableComparisons.length>1){const label=el('label','採用する比較','paper-comparison-choice'),select=el('select');select.setAttribute('aria-label',formalName+'の採用する比較');for(const c of availableComparisons){const option=el('option',c.label);option.value=c.id;select.append(option);}select.value=selectedComparison;select.addEventListener('change',()=>{selectedComparison=select.value;draw();});label.append(select);body.append(label);}
        body.append(candidates);draw();
        if(o.nMissing)body.append(warning('n未確定 · 詳細','時点別の尺度解析nは未確定。追跡人数を自動代入していません。'));
        if(detailSets.length)body.append(fold('Sequence / periodの詳細',d=>{d.append(el('p','投与順序・期間別の値です。独立した介入群として扱いません。','hint'));for(const set of detailSets){d.append(rowTable(set.rows,set.label||[set.timepoint,set.resultType].join(' / ')),metaHint(set.rows,o,set.readiness));review?.attachResultSet?.(d,setDescriptor(set,o));}}));
        const changes=(o.followUpRows||[]).filter(r=>r.raw.resultType==='change');if(changes.length)body.append(fold('Change / 改善量を表示',d=>d.append(matrix(changes,o,'原著のchange（正負の定義はRaw参照）'))));
        const variants=o.variants||[],adjustedVariants=variants.filter(v=>/adjusted/i.test(model.textOf(v)));
        const effects=distinctRows([...(o.followUpRows||[]).filter(isEffect),...adjustedVariants.flatMap(v=>v.rows)]);
        if(effects.length)body.append(fold('調整済み効果を表示',d=>{d.classList.add('outcome-effects');d.append(rowTable(effects,'Reported effect — 原著の効果量・CI'),metaHint(effects,o));
          for(const set of mainSets.filter(s=>s.resultType==='effect'))review?.attachResultSet?.(d,setDescriptor(set,o));
          for(const v of adjustedVariants)for(const set of paper.resultSets.filter(s=>s.outcomeId===v.id&&!s.sequenceDetail))review?.attachResultSet?.(d,setDescriptor(set,v));
          d.append(fold('調整方法・その他の効果',x=>{uniq(effects.map(r=>r.raw.adjustment).filter(Boolean)).forEach(s=>x.append(el('p',s)));variants.forEach(v=>x.append(el('p',model.name(v)+' — '+v.mapping.reason)));}));}));
        const otherEffects=variants.filter(v=>!adjustedVariants.includes(v));if(otherEffects.length)body.append(fold('関連する効果（NNTなど）',d=>{for(const v of otherEffects){d.append(el('p',model.name(v)),rowTable(v.rows,'関連する効果'),el('p',v.mapping.reason));}}));
        if(o.baselineRows?.length)body.append(fold('Baselineを表示',d=>{d.append(matrix(o.baselineRows,{timepoints:['Baseline']},'Baseline — 原著の各報告を保持'));if(o.baselineRows.some((r,i,rows)=>rows.some((other,j)=>i!==j&&other.raw.armId===r.raw.armId&&other.display!==r.display)))d.append(warning('Baselineに報告差 · 詳細','表によってBaselineの値・SDが異なります。両方の報告を保持しています。'));}));
        body.append(fold('Raw / Trace',d=>rawBrowser(d,[...o.rows,...variants.flatMap(v=>v.rows)])));
        body.append(fold('Outcomeの詳細',d=>{d.append(el('p',o.mapping?.reason||''),el('p',`AIの自己評価: ${o.confidence>=.85?'High':o.confidence>=.6?'Medium':'Low'}（正答率ではありません）`));d.append(el('pre',JSON.stringify({reportedName:o.reportedName,conceptCandidate:o.conceptCandidate,instrument:o.instrument,scale:o.scale,mapping:o.mapping,sourceAnchor:o.sourceAnchor},null,2)));}));
        body.append(fold('Outcome全体の判断・確定',d=>review?.attachOutcome(d,o)));
      }
      if(initiallyOpen)open();return article;
    }
    const summary=el('section',null,'result-study');summary.id='fuzzy-study-summary';
    const studyTitle=(raw.study.label||study.pdf.filename).split(/\s+[—–]\s+/)[0];summary.append(el('h3',studyTitle));
    summary.append(el('p',paper.comparisons.design,'result-study-line'));
    const comparisons=el('section',null,'paper-comparisons');comparisons.setAttribute('aria-label','使えそうな比較');comparisons.append(el('h4','使えそうな比較'));
    for(const c of paper.comparisons.items.slice(0,3)){
      const item=el('div',null,'paper-comparison-card');item.dataset.comparisonId=c.id;item.append(el('strong',c.label));
      const names=paper.mainOutcomes.filter(o=>c.outcomeIds?.includes(o.id)).slice(0,3).map(o=>outcomeAliases.get(model.name(o))||compact(model.name(o),35));
      item.append(el('p',names.length?names.join(' / '):'原著の比較可能な結果を確認','paper-comparison-outcomes'));comparisons.append(item);
    }
    if(!paper.comparisons.items.length)comparisons.append(el('p','比較候補は未確定。報告された値はOutcomeとRawに保持しています。','hint'));
    summary.append(comparisons);
    if(paper.comparisons.warning)summary.append(el('p',paper.comparisons.warning,'paper-design-warning'));
    const suggestion=selectionSuggestion();if(suggestion)summary.append(suggestion);
    summary.append(fold(crossing?'Sequence / period・研究集団の詳細':`${raw.study.arms.length}群すべてを見る`,d=>d.append(table(['原著の報告単位','割付 n','解析集団 n','Safety n'],raw.study.arms.map(a=>[a.label,a.randomizedN,a.analyzedN,a.safetyN]),'研究集団（尺度別・時点別のnとは別）'))));
    if(context.intervention||context.comparator)summary.append(fold('SRのICOとの対応候補',d=>{for(const m of window.DataExICO.arms(raw,context)){const p=el('p',`SR: ${m.reviewConcept||'Needs review（対応未確定）'} ↳ 原著: ${m.paperTerm}`);p.title=m.reason;d.append(p);}d.append(el('p','元の全群を保持しています。対応候補から群の数値を自動統合しません。','hint'));}));
    summary.append(fold('研究概要・人数・実施状況',d=>{
      d.append(el('p',raw.study.design),el('p',raw.study.followUp),el('p',raw.study.analysisUnit));
      for(const id of raw.study.sourceIds||[]){const s=raw.sources.find(s=>s.id===id);if(s)d.append(sourceButton(model.sourceAnchor(s,raw)));}
      for(const [category,title] of [['denominator','Outcome denominator metadata'],['baseline','Baseline characteristics'],['conduct','Study conduct'],['effect','Analysis details']]) {
        const entries=view.metadata.filter(o=>o.presentationCategory===category&&!o.parentOutcomeId);
        if(entries.length)d.append(fold(title,x=>{for(const o of entries){x.append(el('h4',model.name(o)));x.append(matrix(o.rows,o,'原著の報告値'));x.append(el('p',o.mapping?.reason||''));}}));
      }
    }));root.append(summary);
    const inventory=el('section');inventory.id='fuzzy-outcome-inventory';
    if(paper.mainOutcomes.length){const section=el('section',null,'outcome-group paper-main-outcomes');section.append(el('h3',`主要なOutcome ${paper.mainOutcomes.length}件`));paper.mainOutcomes.forEach(o=>section.append(outcomeCard(o,true)));inventory.append(section);}
    if(paper.otherOutcomes.length)inventory.append(fold(`その他の使えるOutcome ${paper.otherOutcomes.length}件`,d=>paper.otherOutcomes.forEach(o=>d.append(outcomeCard(o))),'other-outcomes'));
    root.append(inventory);
    if(view.issueGroups.length){const needs=fold('要確認事項 · 詳細',()=>{});needs.id='fuzzy-needs-review';
      view.issueGroups.forEach(g=>{const d=fold(`${g.label} · ${g.items.length}件`,node=>{g.items.forEach(s=>node.append(el('p',s)));});d.classList.add('result-issue-group');needs.append(d);});root.append(needs);}
    root.append(fold(`Raw / Trace — 全${view.rawCount}件`,d=>{rawBrowser(d);d.append(button('Raw JSON保存',()=>download(JSON.stringify(raw,null,2),'application/json',`${studyTitle.replace(/[<>:"/\\|?*]/g,'_')}-raw.json`),'result-export'));},'fuzzy-raw'));
    root.append(fold('換算・メタ解析用候補・提案',d=>{
      d.append(el('p','原値を基準にした候補です。換算・群統合・代表時点の採用を自動確定しません。','hint'));
      for(const [title,items] of [['換算候補',study.normalizedCandidates],['AIからの提案',study.proposals]])d.append(fold(`${title} ${items.length}件`,x=>x.append(el('pre',JSON.stringify(items,null,2)))));
      const c=el('div');c.id='fuzzy-candidates';rawBrowser(c);d.append(c);
    }));
    review?.attachStudy(root);
    return view;
  }
  return Object.freeze({render});
})();
