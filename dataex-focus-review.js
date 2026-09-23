/* One displayed comparison at a time; delegates persistence and CSV to the existing Workspace. */
window.DataExFocusReview=(()=>{
 'use strict';
 const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!=null)n.textContent=String(text);if(cls)n.className=cls;return n;};
 const button=(label,fn,cls)=>{const b=el('button',label,cls);b.type='button';b.addEventListener('click',fn);return b;};
 const short=(text,n=44)=>String(text||'').length>n?String(text).slice(0,n-1)+'…':String(text||'');
 const fold=(label,build)=>{const d=el('details'),s=el('summary',label);d.append(s);let built=false;d.addEventListener('toggle',()=>{if(d.open&&!built){built=true;build(d);}});return d;};
 // Search is a display projection of existing cards and Final values; IDs/order stay intact.
 const STAT_LABELS={estimate:'Effect 効果量',mean:'Mean 平均',sd:'SD 標準偏差',se:'SE 標準誤差',n:'n 人数',events:'Events イベント数',total:'Total 総数',ciLow:'CI lower 信頼区間の下限',ciHigh:'CI upper 信頼区間の上限',ciLevel:'CI level 信頼水準',eventCount:'Event count',personTime:'Person-time'};
 const proportion=row=>row?.resultType!=='effect'&&/^(?:proportion|percentage|percent)(?:\s|\(|$)/i.test(row?.effectMeasure||'');
 const estimateLabel=row=>proportion(row)?'割合 (%)':row?.resultType!=='effect'&&/^median$/i.test(row?.effectMeasure||'')?'中央値 (Median)':row?.resultType==='effect'?'Effect 効果量':row?.effectMeasure||'報告値';
 const normalize=text=>String(text||'').normalize('NFKC').toLocaleLowerCase().replace(/[−–—]/g,'-');
 function primaryTimeMatch(outcome,timepoint){
  // Use an existing explicit primary-time statement, not effect sizes or paper names.
  const numbers={one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10,eleven:11,twelve:12};
  const text=[outcome?.mapping?.reason,outcome?.reportedName].filter(Boolean).join('; ').replace(/\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\b/gi,n=>numbers[n.toLowerCase()]);
  const m=/\bprimary\b[^.;]*?\bat\s*(\d+(?:\.\d+)?)\s*(hours?|days?|weeks?|months?|years?)\b/i.exec(text);
  if(!m)return false;
  const unit=m[2].replace(/s$/i,'');
  return new RegExp(`(?:^|[^\\d.])${m[1].replace('.','\\.')}\\s*${unit}s?\\b`,'i').test(timepoint||'');
 }
 function primaryTypeMatch(outcome,type){
  const reason=String(outcome?.mapping?.reason||'');
  // A explicitly reported primary change score may be prominent without changing its type.
  return type==='change'&&/\bprimary\s+(?:outcome|end\s*point)\s*(?::|was|is)?\s*(?:the\s+)?change\b/i.test(reason);
 }
 function visualEstimate(row,key,sources){
  const source=sources.find(s=>s.id===row.sourceRefs?.[key]);
  return source?.kind==='VISUAL'&&(/^[~≈]/.test(source.directValue||'')||['mean','sd','se','estimate','ciLow','ciHigh'].includes(key)&&(row.confidence<.7||/visual(?:ly)?[ -]+estimat|概算/i.test(row.adjustment||'')));
 }
 function displayNumber(row,key,sources){
  return (visualEstimate(row,key,sources)?'≈ ':'')+String(row.statistics?.[key]);
 }
 function overviewCandidates(eligible,limit){
  // One representative per comparison first, then additional timepoints.
  // Source/primary-time order is supplied by the caller; never rank by numerical result.
  const unique=[],seen=new Set();
  for(const c of eligible){const k=c.comparisonId+'|'+c.timepoint;if(!seen.has(k)){seen.add(k);unique.push(c);}}
  const chosen=[],comparisons=new Set();
  for(const c of unique)if(!comparisons.has(c.comparisonId)){comparisons.add(c.comparisonId);chosen.push(c);if(chosen.length===limit)return chosen;}
  for(const c of unique)if(!chosen.includes(c)){chosen.push(c);if(chosen.length===limit)break;}
  return chosen;
 }
 function primaryDetailNotice(outcome,cards,readRow){
  if(!/\bprimary(?:\s+\w+){0,2}\s+outcome\b|主評価/i.test(outcome?.mapping?.reason||''))return null;
  const same=cards.filter(c=>c.outcomeId===outcome.id);
  if(same.some(c=>(!c.detailOnly||primaryTypeMatch(outcome,c.resultType))&&c.rows.some(r=>['mean','estimate','events','eventCount'].some(k=>readRow(r).statistics?.[k]!=null))))return null;
  return same.find(c=>c.resultType!=='baseline')||same[0]||null;
 }
 function candidateIndex(cards,readRow,arms,state){
  const name=id=>arms.get(id)?.label||id||'',unique=values=>[...new Set(values.filter(v=>v!=null&&v!==''))];
  return cards.map(card=>{
   const rows=card.rows.map(row=>readRow(row)||row.raw),first=rows[0],set=state?.resultSets?.[card.id];
   const status=set?.status==='ACCEPTED'?(set.verified?'ACCEPTED':'NEEDS_REVIEW'):['HOLD','EXCLUDED'].includes(set?.status)?set.status:set?.status==='EDITED_DRAFT'||card.pointIds.some(id=>state?.points?.[id]?.verification==='NEEDS_REVIEW')?'NEEDS_REVIEW':'CANDIDATE';
   const comparison=first.comparatorArmId?name(first.armId)+' vs '+name(first.comparatorArmId):unique(rows.map(v=>name(v.armId))).join(' vs ')||card.comparison?.label||'';
   const times=unique(rows.map(v=>v.timepoint)),types=unique(rows.map(v=>v.resultType)),population=unique(rows.map(v=>v.population)),adjustment=unique(rows.map(v=>v.adjustment));
   const values=rows.map(v=>[rows.length>1?name(v.armId):'',v.effectMeasure,Object.entries(v.statistics||{}).filter(([,value])=>value!=null).map(([key,value])=>(key==='estimate'?estimateLabel(v):STAT_LABELS[key]||key)+' '+value).join(' · ')].filter(Boolean).join(' ')).join(' / ');
   const title=card.label,detail=[comparison,times.join(' / '),types.join(' / '),values].filter(Boolean).join(' · '),context=[population.length?'解析集団: '+population.join(' / '):'解析集団: 未記録',adjustment.length?'調整: '+adjustment.join(' / '):'調整: 未記録'].join(' · ');
   const strings=v=>typeof v==='string'?[v]:v&&typeof v==='object'?Object.values(v).flatMap(strings):[];
   const aliases=[...strings(card.outcome),...rows.flatMap(v=>[...strings(arms.get(v.armId)),...strings(arms.get(v.comparatorArmId))])];
   return {id:card.id,card,title,detail,context,status,times,comparisonId:card.comparisonId,outcomeId:card.reportedOutcomeId,type:card.displayType,search:normalize([title,detail,context,...aliases,...rows.map(v=>Object.keys(v.statistics||{}).join(' '))].join(' '))};
  });
 }
 function filterCandidates(index,filters={}){const terms=normalize(filters.query).trim().split(/\s+/).filter(Boolean);return index.filter(item=>terms.every(term=>item.search.includes(term))&&(!filters.comparison||item.comparisonId===filters.comparison)&&(!filters.outcome||item.outcomeId===filters.outcome)&&(!filters.type||item.type===filters.type)&&(!filters.timepoint||item.times.includes(filters.timepoint))&&(!filters.status||item.status===filters.status));}
 function analysisReady(card,format,readRow){
  const values=card.rows.map(r=>readRow(r)||r.raw),number=v=>typeof v==='number'&&Number.isFinite(v),count=(v,total)=>Number.isSafeInteger(v)&&Number.isSafeInteger(total)&&v>=0&&total>=v;
  if(format==='binary')return values.length>=2&&values.every(v=>count(v.statistics?.events,v.statistics?.total));
  if(format==='continuous')return values.length>=2&&values.every(v=>number(v.statistics?.mean)&&number(v.statistics?.sd)&&v.statistics.sd>=0&&Number.isSafeInteger(v.statistics?.n)&&v.statistics.n>0);
  if(format==='giv')return values.some(v=>number(v.statistics?.estimate)&&(number(v.statistics?.se)&&v.statistics.se>0||number(v.statistics?.ciLow)&&number(v.statistics?.ciHigh)&&v.statistics.ciHigh>v.statistics.ciLow));
  return false;
 }
 function proposedIdsForRecord(catalog,recordId,cards,readRow,proposalApi){
  const run=[...(catalog?.aiProposals||[])].reverse().find(r=>r.phase==='ready');if(!run)return null;
  const byId=new Map(cards.map(c=>[c.id,c])),ids=new Set();
  for(const table of proposalApi.tables(run,catalog))for(const row of table.rows||[])if(['candidate','needs_review'].includes(row.status))for(const match of row.matches||[]){if(match.recordId!==recordId)continue;const card=byId.get(match.candidateId);if(card&&analysisReady(card,table.format,readRow))ids.add(card.id);}
  return ids;
 }
 function render({root,study,view,paper,loaded,navigation,review,context,reviewContext}){
  const started=performance.now(),C=window.DataExConfirmation,D=window.DataExDecision,all=C.cards(paper,view),raw=view.raw;
  const arms=new Map(raw.study.arms.map(a=>[a.id,a])),locations=new Map(),byId=new Map(all.map(c=>[c.id,c]));
  let flow=null,workflowScope=null;
  let proposed=proposedIdsForRecord(review.workflowCatalog?.(),review.snapshot()?.id,all,r=>review.readFinalRow(r.raw.id),window.DataExAIProposal),proposalOnly=proposed!==null;
  let current=all.find(c=>c.id===review.workflowCatalog?.().session?.candidateId&&(proposalOnly?proposed.has(c.id):true))||(proposalOnly?all.find(c=>proposed.has(c.id)):all[0]),shown=proposalOnly?all.filter(c=>proposed.has(c.id)):all,working=false,sourceSequence=0,lastPaintKey='',lastError='',lastNumeric=null,drawnId=null,catalog=[],catalogRevision=null,listLimit=20,activeCategory='';
  const categories=window.DataExResultList.categoryIndex(raw,all);
  const recordState=()=>review.focusSnapshot?review.focusSnapshot(current?.pointIds||[]):review.snapshot();
  root.className='focus-workspace';root.setAttribute('aria-label','原著を確認して採用');
  const top=el('div',null,'focus-top'),title=el('h3',raw.study.label),saved=el('span','保存データを読込中','focus-save');saved.setAttribute('role','status');
  top.append(title,saved);root.append(top);if(String(study.pdf.pdfId).startsWith('csv:'))root.append(el('p','外部CSV由来・未確認の取り込み候補。PDF・数値別出典は未接続です。CSV内の承認記載は内部の採用ではありません。','external-csv-warning'));
  const curation=el('section',null,'focus-curation'),curationNote=el('p'),curationActions=el('div');
  const showProposal=button('AI提案の解析候補だけを見る',()=>{proposalOnly=true;activeCategory='';search.value='';Object.values(selects).forEach(s=>s.value='');applyFilters();}),showAll=button('全抽出候補を確認',()=>{proposalOnly=false;activeCategory='';search.value='';Object.values(selects).forEach(s=>s.value='');applyFilters();});
  curationActions.append(showProposal,showAll);curation.append(curationNote,curationActions);root.append(curation);
  function refreshCuration(){curation.hidden=proposed===null;if(proposed===null)return;curationNote.textContent=proposed.size?`AI提案で数値が揃う解析候補 ${proposed.size}件を優先表示（定義・期間が要確認の候補を含む）。全${all.length}候補のRaw・出典も保持しています。`:`この研究のAI提案には、数値が揃う解析候補がありません。全${all.length}候補のRaw・出典は保持しています。`;showProposal.disabled=proposalOnly;showAll.disabled=!proposalOnly;}
  const drawer=fold('研究・Review Workspaceを切り替える',d=>{const host=review.workspaceElement?.();if(host)d.append(host);});root.append(drawer);
  const categoryNav=el('section',null,'outcome-category-nav');categoryNav.setAttribute('aria-label','アウトカムを大分類から探す');
  const categoryButtons=el('div',null,'outcome-category-buttons'),categoryStatus=el('p',null,'outcome-category-status'),categoryOutcomes=el('div',null,'outcome-category-outcomes');categoryStatus.setAttribute('role','status');
  categoryNav.append(el('h4','2 アウトカムを大分類から探す'),categoryButtons,categoryStatus,categoryOutcomes);root.append(categoryNav);
  const overview=el('section',null,'focus-overview');overview.setAttribute('aria-label','主要な比較と結果');root.append(overview);
  const finderFold=el('details',null,'focus-search-fold');finderFold.append(el('summary',`全${all.length}候補を検索・絞り込み`));
  const finder=el('section',null,'focus-finder');finder.setAttribute('aria-label','候補を検索して選択');
  const searchLabel=el('label','候補を検索'),search=el('input');search.type='search';search.placeholder='アウトカム・群・時点・統計量';search.setAttribute('aria-label','候補を検索');searchLabel.append(search);
  const filters=el('div',null,'focus-filters'),selects={},statusNames={CANDIDATE:'未採用',ACCEPTED:'採用済み',NEEDS_REVIEW:'再確認が必要',HOLD:'保留',EXCLUDED:'使わない'};
  function select(label,key,choices){const l=el('label',label),s=el('select');s.setAttribute('aria-label',label);const any=el('option','すべて');any.value='';s.append(any);for(const [id,text] of choices){const o=el('option',text);o.value=id;s.append(o);}l.append(s);filters.append(l);selects[key]=s;s.onchange=applyFilters;}
  select('比較','comparison',paper.comparisons.items.map(c=>[c.id,c.label]));select('Outcome','outcome',raw.outcomes.map(o=>[o.id,o.reportedName]));select('結果の種類','type',[...new Set(all.map(c=>c.displayType))].map(t=>[t,t==='baseline'?'Baseline':t==='endpoint'?'Endpoint':t==='change'?'Change':t]));
  select('時点','timepoint',[...new Set(all.flatMap(c=>c.rows.map(r=>effective(r).timepoint)))].filter(Boolean).map(t=>[t,t]));select('採用状況','status',Object.entries(statusNames));
  const matches=el('p',null,'focus-match-count');matches.setAttribute('role','status');
  const results=el('div',null,'focus-candidate-list'),list=el('details',null,'focus-candidate-picker'),listTitle=el('summary','候補一覧から直接移動');list.append(listTitle,results);
  window.addEventListener('dataex-clear-view',()=>{if(root.isConnected){activeCategory='';search.value='';Object.values(selects).forEach(s=>s.value='');applyFilters();}},{signal:undefined});
  const reset=button('絞り込みを解除',()=>{activeCategory='';search.value='';Object.values(selects).forEach(s=>s.value='');applyFilters();list.open=false;});
  const comparisonStep=el('section',null,'simple-comparison-step');comparisonStep.append(el('h4','1 比較する群'),selects.comparison.parentElement,fold('抽出済みの全群・解析nodeを見る',d=>{for(const a of raw.study.arms)d.append(el('p',a.label+' · '+(a.role||'役割未記録')));d.append(el('p','原著の比較・方向を保持します。表示上の選択で効果量の符号は反転しません。'));}));categoryNav.before(comparisonStep);
  const validPairs=paper.comparisons.items.filter(c=>c.interventionArmId&&c.comparatorArmId),groupIds=[...new Set(validPairs.flatMap(c=>[c.interventionArmId,c.comparatorArmId]))];
  if(groupIds.length>2){const pairs=el('div',null,'simple-arm-pair'),note=el('p'),pick=(label)=>{const l=el('label',label),n=el('select');n.setAttribute('aria-label',label);n.append(el('option','未選択'));n.options[0].value='';for(const id of groupIds){const a=raw.study.arms.find(a=>a.id===id),o=el('option',a?.label||id);o.value=id;n.append(o);}l.append(n);pairs.append(l);return n;};const a=pick('比較する群A'),b=pick('比較する群B');const change=()=>{if(!a.value||!b.value)return;const match=validPairs.find(c=>c.interventionArmId===a.value&&c.comparatorArmId===b.value)||validPairs.find(c=>c.interventionArmId===b.value&&c.comparatorArmId===a.value);if(!match){note.textContent='この2群の比較候補は抽出結果にありません。別の比較を選んでください。';return;}selects.comparison.value=match.id;note.textContent='原著の方向を保持: '+match.label;applyFilters();};a.onchange=change;b.onchange=change;pairs.append(note);comparisonStep.append(pairs);}

  finder.append(searchLabel,filters,reset,matches,list);finderFold.append(finder);root.append(finderFold);
  top.append(button('候補を探す',()=>{finderFold.open=true;finder.scrollIntoView({block:'start'});search.focus({preventScroll:true});},'focus-find-shortcut'));
  const position=el('span'),prev=button('前の候補',()=>move(-1)),next=button('次の候補',()=>move(1)),navigationBar=el('nav',null,'focus-navigation'),nextName=el('p',null,'focus-next-name');navigationBar.setAttribute('aria-label','確認候補');navigationBar.append(prev,position,next);root.append(navigationBar,nextName);
  function rebuildCatalog(){const state=review.focusSnapshot?review.focusSnapshot([...new Set(all.flatMap(c=>c.pointIds))]):review.snapshot();catalog=candidateIndex(all,effective,arms,state);catalogRevision=state?.revision;}
  function filtered(){const members=new Set(categories.filter(c=>!activeCategory||c.categories.includes(activeCategory)).map(c=>c.outcome.id));return filterCandidates(catalog.filter(item=>(!workflowScope||workflowScope.has(item.id))&&(!proposalOnly||proposed.has(item.id))),{query:search.value,...Object.fromEntries(Object.entries(selects).map(([key,s])=>[key,s.value]))}).filter(item=>members.has(item.outcomeId||item.card.outcomeId||item.card.outcome?.id));}
  function showCategories(){
   categoryButtons.replaceChildren();categoryOutcomes.replaceChildren();
   function chooseCategory(id){activeCategory=id;search.value='';Object.entries(selects).forEach(([k,s])=>{if(k!=='comparison')s.value='';});applyFilters();list.open=false;}
   for(const item of [{id:'',label:'すべて'},...window.DataExResultList.CATEGORIES]){
    const members=categories.filter(c=>(!item.id||c.categories.includes(item.id))&&(!proposalOnly||c.candidateIds.some(id=>proposed.has(id))));if(!members.length)continue;
    const b=button(item.label+'（'+members.length+'）',()=>chooseCategory(item.id));b.dataset.categoryId=item.id;b.setAttribute('aria-pressed',String(activeCategory===item.id));categoryButtons.append(b);
   }
   const members=categories.filter(c=>(!activeCategory||c.categories.includes(activeCategory))&&(!proposalOnly||c.candidateIds.some(id=>proposed.has(id))));
   categoryStatus.textContent=activeCategory?`${window.DataExResultList.CATEGORIES.find(c=>c.id===activeCategory).label}：${members.length}アウトカム。下から選ぶと、そのアウトカムの比較・時点を表示します。`:'大分類を選ぶと、含まれるアウトカムが表示されます。分類は表示用の目安で、複数の分類に表示される項目もあります。';
   if(activeCategory||selects.outcome.value)for(const item of members){
    const o=item.outcome,b=button('',()=>{search.value='';Object.entries(selects).forEach(([k,s])=>{if(k!=='comparison')s.value='';});selects.outcome.value=o.id;applyFilters();overview.scrollIntoView({block:'start'});},'outcome-category-option');
    b.dataset.outcomeId=o.id;b.setAttribute('aria-pressed',String(selects.outcome.value===o.id));
    b.append(el('strong',window.DataExOutcomeWorkflow?.outcomeInfo(o,raw).meaning||o.conceptCandidate||o.reportedName),el('span',o.reportedName),el('small',o.definition||o.description||o.notes||'定義は原著の記載を確認'),el('small',item.candidateIds.length?item.candidateIds.length+'候補 · 全比較・時点を表示':'数値候補は未記録'));
    categoryOutcomes.append(b);
   }
  }
  function showList(){
   const items=filtered();matches.textContent=proposalOnly?`AI提案の解析候補 ${items.length}件 / 抽出済み ${all.length}候補`:`該当 ${items.length}件 / 抽出済み ${all.length}候補`;listTitle.textContent=`候補一覧から直接移動（${items.length}件）`;results.replaceChildren();
   for(const item of items.slice(0,listLimit)){const b=button('',()=>{current=item.card;draw(true);list.open=false;card.scrollIntoView({block:'nearest'});card.querySelector('h4')?.focus({preventScroll:true});},'focus-candidate-option');b.dataset.candidateId=item.id;b.setAttribute('aria-current',String(current?.id===item.id));b.append(el('strong',item.title),el('span',item.detail),el('small',item.context+' · '+statusNames[item.status]));results.append(b);}
   if(items.length>listLimit)results.append(button(`さらに20件を表示（残り${items.length-listLimit}件）`,()=>{listLimit+=20;showList();}));
   if(!items.length)results.append(el('p','一致する候補はありません。検索語や絞り込みを解除してください。'));
  }
  function applyFilters(event){shown=filtered().map(item=>item.card);current=shown.find(c=>c.id===current?.id)||shown[0];listLimit=20;if(event)list.open=true;draw(true);}
  search.addEventListener('input',applyFilters);
  const restoreCandidate=event=>{if(!root.isConnected)return;const candidateId=event.detail?.candidateId,match=catalog.find(x=>x.id===candidateId);if(match){activeCategory='';search.value='';Object.values(selects).forEach(s=>s.value='');workflowScope=null;if(proposalOnly&&!proposed.has(candidateId))proposalOnly=false;shown=proposalOnly?all.filter(c=>proposed.has(c.id)):all;current=match.card;draw(false);}window.dispatchEvent(new CustomEvent('dataex-candidate-restored',{detail:{candidateId,found:!!match,recordId:review.snapshot()?.id,visible:!!match&&current?.id===candidateId}}));};
  window.addEventListener('dataex-restore-candidate',restoreCandidate);
  const card=el('article',null,'focus-card'),decisionState=el('p',null,'focus-decision-status'),sourceChoices=el('div',null,'focus-source-choices'),sourceState=el('p','原著位置：未特定 / 人間による確認：未確認','focus-source-status');sourceState.setAttribute('role','status');decisionState.setAttribute('role','status');
  const adoptionTarget=el('p',null,'focus-adoption-target');
  const declaration=el('p','原著と照合した結果を、この表へ保存します','focus-declaration');declaration.id='focus-adoption-declaration';
  const manual=el('input');manual.placeholder='例：PDF p.6 Table 2の脚注と両群の値を手動確認';manual.setAttribute('aria-label','手動で確認した原著の根拠');manual.maxLength=2000;
  const manualPage=el('input');manualPage.type='number';manualPage.min=1;manualPage.max=study.pdf.pageCount;manualPage.setAttribute('aria-label','手動確認のPDFページ');manualPage.placeholder='PDFページ';
  const manualDetails=fold('黄色位置が不明な場合：手動で原著を確認',d=>{d.append(el('p','ページを自分で表示し、図表・本文と入力項目の対応を記録できます。これは自動照合とは別の人間の確認です。'),manualPage,manual);});
  const error=el('p',null,'focus-error');error.setAttribute('role','status');
  const actions=el('div',null,'focus-actions'),adopt=button('このデータを承認',event=>{if(event.detail>1||event.isComposing)return;adopt.blur();act('adopt');},'focus-primary'),edit=button('修正',()=>editValue()),hold=button('保留',()=>act('HOLD')),reject=button('使わない',()=>act('EXCLUDED')),undo=button('取消',()=>act('undo'));
  const traceActor=el('input');traceActor.setAttribute('aria-label','今回の確認・採用者（氏名・ID）');traceActor.placeholder='今回の確認者';traceActor.value=review.reviewer?.()||'';traceActor.readOnly=true;
  const traceControls=fold('CSVに残す出典・採用者',d=>{d.classList.add('csv-trace-card-controls');d.append(traceActor,button('出典を確認・補記',()=>{if(current&&!working)review.editTrace?.(current,lastNumeric?.cardId===current.id?lastNumeric:null);}));});
  const cancelDeclaration=button('確認表明を取消',async()=>{if(working||!current)return;working=true;try{await review.declareCurrent(current,review.reviewer(),true);}catch(e){lastError=e.message;}finally{working=false;refresh();}});actions.append(cancelDeclaration);
  adopt.setAttribute('aria-describedby',declaration.id);adopt.addEventListener('keydown',event=>{if(event.repeat||event.isComposing)event.preventDefault();});
  const csvPreview=button('CSVプレビュー',()=>window.DataExSimpleFlowUI.preview(review,{recordId:review.snapshot()?.id,candidateId:current?.id}));
  actions.append(adoptionTarget,declaration,adopt,csvPreview,edit,hold,reject,undo);root.append(decisionState,card,sourceState,sourceChoices,manualDetails,traceControls,error,actions);
  const exportFooter=el('div',null,'focus-export-footer'),exportCount=el('span'),exportButton=button('採用データ＋出典をCSV保存',()=>review.traceCsvDialog?.(),'focus-export-csv');const analysisButton=button('解析用CSVを保存',()=>review.basketCsvDialog?.(),'focus-export-analysis');exportFooter.append(exportCount,analysisButton,exportButton);actions.append(exportFooter);
  root.append(fold('表示範囲・抽出時の条件',d=>{const unique=new Set(all.flatMap(c=>c.pointIds));d.append(el('p',`Raw ${raw.rawValues.length}件 / Outcome ${raw.outcomes.length}件 / Source Trace ${raw.sources.length}件。カードへの対応 ${unique.size} Raw ID。発見できなかったOutcomeを含む網羅率は不明です。`),el('p','並び順は既存のPaper-firstの主要Outcome・SR条件・報告種別に基づきます。p値や効果の大小で並べ替えません。'),el('pre',JSON.stringify({extractionContext:context,currentReviewContext:reviewContext},null,2)));}));
  function showOverview(){
   overview.replaceChildren(el('h4','3 時点の行を選んで原著を確認'));
   overview.append(el('p','数値の左クリック：原著／右クリック・F2：その値を修正。時点の行を選び、同じ枠の中で承認します。承認後も同じ結果に留まります。','focus-overview-note'));
   const groups=window.DataExResultList.project(shown,raw,effective,reviewContext);let selectedHost=null;
   function choose(c){if(!shown.includes(c)){activeCategory='';search.value='';Object.values(selects).forEach(s=>s.value='');shown=all;}current=c;list.open=false;draw(true);}
   function numeric(c,row,key){
    const value=effective(row),anchor=value.finalSourceAnchor||row.sourceAnchors.find(a=>a.sourceId===row.raw.sourceRefs?.[key])||row.sourceAnchor;
    const target={cardId:c.id,pointId:row.raw.id,field:key==='estimate'?'effect':key,armId:value.armId,timepoint:value.timepoint};
    const b=button(displayNumber(value,key,raw.sources),()=>{choose(c);lastNumeric=target;if(loaded&&anchor)source(row,anchor);else{lastError='対応する原著PDFを再接続してください。';refresh();}},'focus-overview-value');
    b.dataset.candidateId=c.id;b.dataset.rawId=row.raw.id;b.dataset.fieldId=target.field;b.dataset.sourceId=anchor?.sourceId||'';
    b.setAttribute('aria-label',(key==='estimate'?estimateLabel(value):STAT_LABELS[key]||key)+' '+displayNumber(value,key,raw.sources)+' — '+c.label+' '+value.timepoint+'の原著');
    b.title='左クリック：原著／右クリック：修正';
    const edit=e=>{e.preventDefault();e.stopPropagation();choose(c);lastNumeric=target;editValue(target);};b.addEventListener('contextmenu',edit);b.addEventListener('keydown',e=>{if(e.key==='F2'&&!e.repeat&&!e.isComposing)edit(e);});return b;
   }
   function build(group,host){
    const o=group.outcome,box=el('section',null,'result-list-group');
    box.append(el('h5',group.label),el('p',group.comparison?.label||'比較名は未記録','result-list-comparison'));
    const scale=typeof o.scale==='object'&&o.scale?[o.scale.min!=null&&o.scale.max!=null?`${o.scale.min}–${o.scale.max}`:'',o.scale.unit,o.scale.direction].filter(Boolean).join(' · '):o.scale;
    const meta=[o.instrument,scale,o.unit].filter(Boolean);
    box.append(el('p','尺度・単位: '+(meta.join(' · ')||'未記録'),'result-list-meta'));
    const dims=group.semantics[0],adjustment=String(dims.adjustment||'未記録');box.append(el('p',[dims.resultType,'解析集団: '+(dims.population||'未記録'),'調整: '+(adjustment.length>100?adjustment.slice(0,100)+'…':adjustment)].join(' · '),'result-list-meta'));if(adjustment.length>100)box.append(fold('調整モデル・原著の説明全文',d=>d.append(el('p',adjustment))));
    const table=el('table',null,'result-list-table'),head=el('tr');head.append(el('th','時点'));
    const columns=[...new Set(group.entries.flatMap(e=>e.cards[0].rows.map(r=>effective(r).armId)))];
    for(const id of columns)head.append(el('th',group.comparative?'比較全体の結果':arms.get(id)?.label||id||'群未記録'));
    head.append(el('th','確認対象'));const thead=el('thead');thead.append(head);table.append(thead);const tbody=el('tbody');
    for(const entry of group.entries){const c=entry.cards.find(x=>x.id===current?.id)||entry.cards[0],tr=el('tr');tr.dataset.candidateId=c.id;tr.setAttribute('aria-current',String(c.id===current?.id));const time=el('th',entry.timepoint||'時点未記録');time.scope='row';tr.append(time);
     for(const armId of columns){const row=c.rows.find(r=>effective(r).armId===armId),td=el('td');td.dataset.armLabel=group.comparative?'比較全体の結果':arms.get(armId)?.label||armId||'群未記録';if(!row){td.append(el('span','この候補には未記録'));tr.append(td);continue;}const v=effective(row);
      if(v.effectMeasure)td.append(el('span',v.effectMeasure,'result-stat-type'));
      if(v.unit&&v.unit!==o.unit)td.append(el('span','単位: '+v.unit));
      const keys=['n','mean','sd','se','events','total','estimate','ciLow','ciHigh','ciLevel','eventCount','personTime',...Object.keys(v.statistics||{})];
      for(const key of new Set(keys)){if(v.statistics?.[key]==null)continue;const line=el('span',null,'result-stat');line.append(el('small',key==='estimate'?estimateLabel(v):STAT_LABELS[key]||key),numeric(c,row,key));td.append(line);
       if(key==='se'){const info=window.DataExPaperModel.classify(v,c.outcome,raw),derived=info.derivedCandidates?.find(x=>x.kind==='SE_TO_SD');if(derived){const preview=el('div','換算SD ≈ '+Number(derived.statistics.sd.toPrecision(6))+'（派生候補・未採用）','result-sd-preview');preview.append(fold('SE→SDの根拠・適用条件',d=>{d.append(el('p','プレビューのみ。現在のCSV採用ゲートへは追加しません。'),el('pre',JSON.stringify(derived,null,2)));}));td.append(preview);}else if(v.statistics.sd==null){td.append(el('small','SD換算の条件が不足、または対象外。下の「統計量・解析上の注意」で解析n・SEの種類と原著脚注を確認してください。'));}}
      }
      if(!Object.values(v.statistics||{}).some(x=>x!=null))td.append(el('span','数値未記録'));
      if(Object.keys(v.statistics||{}).some(k=>visualEstimate(v,k,raw.sources)))td.append(el('small','≈ 図からの概算・未確認'));
      tr.append(td);
     }
     const action=el('td');action.append(button('この行を確認',()=>{choose(c);card.scrollIntoView({block:'nearest'});},'result-list-select'));
     if(entry.conflict)action.append(el('small','同じ条件の異なる値：両候補を保持'));
     if(entry.cards.length>1)action.append(fold('同じ値の'+entry.cards.length+'候補・全出典',d=>{for(const original of entry.cards){d.append(button('候補 '+original.id,()=>{choose(original);card.scrollIntoView({block:'nearest'});}));for(const row of original.rows)for(const anchor of row.sourceAnchors)d.append(button('p.'+anchor.pdfPage+' '+(anchor.label||anchor.sourceId),()=>{choose(original);source(row,anchor);}));}d.append(el('p','表示のみ集約。採用は選択した候補IDだけに適用します。'));}));
     tr.append(action);tbody.append(tr);if(c.id===current?.id){tr.classList.add('simple-selected-row');action.prepend(el('strong','承認対象'));const operationRow=el('tr'),td=el('td');td.colSpan=columns.length+2;td.className='simple-selected-actions';td.append(decisionState,actions,error,sourceState,card,sourceChoices,manualDetails,traceControls);operationRow.append(td);tbody.append(operationRow);selectedHost=td;}
    }table.append(tbody);box.append(table);host.append(box);
   }
   const selectedGroup=groups.find(g=>g.entries.some(e=>e.cards.some(c=>c.id===current?.id)));const main=selects.outcome.value?groups:[...new Set([...groups.filter(g=>!g.detailOnly).slice(0,3),...(selectedGroup?[selectedGroup]:[])])],other=groups.filter(g=>!main.includes(g));
   for(const g of main)build(g,overview);
   for(const outcome of raw.outcomes){const c=primaryDetailNotice(outcome,shown,effective);if(c)overview.append(button('主要アウトカムの詳細: '+outcome.reportedName,()=>{choose(c);card.scrollIntoView({block:'nearest'});}));}
   if(other.length)overview.append(fold('その他の比較・アウトカム・詳細（'+other.length+'組）',host=>{for(const g of other){const d=fold(g.label+' · '+(g.comparison?.label||'比較未記録')+' · '+g.semantics[0].resultType+' / '+g.entries.length+'時点・別結果',h=>build(g,h));host.append(d);}}));
   if(!selectedHost){const pending=el('div',null,'simple-selection-empty');pending.append(decisionState,card,error,actions);overview.append(pending);}
   if(!groups.length)overview.append(el('p',selects.outcome.value&&categories.find(c=>c.outcome.id===selects.outcome.value)?.candidateIds.length===0?'このアウトカムの数値候補は未記録です。元のアウトカム情報は保持しています。':'一致する結果はありません。検索・絞り込みを解除すると全候補に戻ります。'));
   overview.append(el('p',`${all.length}候補・全IDを保持。表示順は明示されたレビュー条件、原著の主要結果、原著順。表示優先は採用推奨ではありません。`,'focus-overview-note'));
  }
  function editValue(selection){
   if(!current||working)return;
   review.editResultSet(current,selection||(lastNumeric?.cardId===current.id?lastNumeric:{cardId:current.id}));
  }
  function move(delta){if(!shown.length)return;const i=shown.findIndex(s=>s.id===current?.id);current=shown[Math.max(0,Math.min(shown.length-1,i+delta))];draw(true);}
  function effective(row){return review.readFinalRow(row.raw.id)||row.raw;}
  async function source(row,anchor){const token=++sourceSequence,start=performance.now();sourceState.textContent='原著を表示中…（確認・採用はしていません）';try{const response=await navigation.navigateToSource(anchor);if(token!==sourceSequence)return;const page=document.querySelector(`#pdf-page-${anchor.pdfPage} .textLayer`),info=C.sourceCandidates(anchor,response,page?.textContent||'',window.DataExSource.matches);locations.set(row.raw.id,{response,info,anchor,ms:performance.now()-start});refreshSource();}catch(e){if(token===sourceSequence){sourceState.textContent='原著位置を特定できませんでした。ページを手動確認できます。';}}}
  function refreshSource(){if(!current)return;sourceChoices.replaceChildren();const found=current.rows.map(r=>locations.get(r.raw.id)),n=found.filter(r=>r?.info?.status==='LOCATED').length,multiple=found.some(r=>r?.info?.status==='MULTIPLE'),failure=found.some(r=>r?.info?.status==='UNRESOLVED');sourceState.textContent=`原著位置：${n}/${current.rows.length}件を特定${multiple?' / 複数候補あり':failure?' / 未特定あり':''} / 人間の確認とは別です。`;for(const row of current.rows){const item=locations.get(row.raw.id);if(item?.info?.candidates.length){sourceChoices.append(el('p','複数箇所に一致しています。根拠を選び、意味を原著で確認してください。'));for(const choice of item.info.candidates)sourceChoices.append(button(choice.label+'：'+short(choice.quote,100),()=>source(row,{...item.anchor,sourceText:choice.quote})));}}}
  function draw(reset=false){
   sourceSequence++;refreshCuration();showCategories();showOverview();if(drawnId!==current?.id){lastNumeric=null;drawnId=current?.id;}showList();if(reset){manual.value='';manualPage.value='';lastPaintKey='';}
   const index=shown.findIndex(c=>c.id===current?.id);position.textContent=shown.length?`${index+1} / ${shown.length}候補`:'該当候補なし';prev.disabled=index<=0;next.disabled=index>=shown.length-1;const nextItem=catalog.find(item=>item.id===shown[index+1]?.id);nextName.textContent=nextItem?'次: '+nextItem.title+' · '+nextItem.detail:'次の候補はありません';
   card.replaceChildren();delete card.dataset.resultSetId;delete card.dataset.rawIds;if(!current){card.append(el('p','この絞り込みに対応する候補はありません。全Rawは詳細に保持しています。'));refresh();return;}
   card.dataset.resultSetId=current.id;card.dataset.rawIds=current.pointIds.join(',');
   const heading=el('h4',short(current.label));heading.title=current.label;heading.tabIndex=-1;card.append(heading,el('p',[current.outcome.instrument,current.outcome.scale?.min!=null&&current.outcome.scale?.max!=null?current.outcome.scale.min+'–'+current.outcome.scale.max:current.outcome.scale?.unit].filter(Boolean).join(' / '),'focus-subtitle'),el('p',current.label,'focus-formal-name'));
   const values=current.rows.map(effective),first=values[0],name=id=>arms.get(id)?.label||id,comparisonText=first.comparatorArmId?name(first.armId)+' vs '+name(first.comparatorArmId):values.map(v=>name(v.armId)).filter(Boolean).join(' vs ')||D.comparisonLabel(current);
   const comparison=el('p',comparisonText,'focus-comparison');comparison.title=comparisonText;card.append(comparison,el('p',`${[...new Set(values.map(v=>v.timepoint))].join(' / ')} · ${[...new Set(values.map(v=>v.resultType))].join(' / ')}`,'focus-time'));
   const finalUnits=[...new Set(current.pointIds.map(id=>recordState()?.points[id]?.decision.finalValue?.unit).filter(v=>v!=null&&String(v).trim()))];if(finalUnits.length)card.append(el('p','Final unit: '+finalUnits.join(' / '),'focus-subtitle'));
   const populations=[...new Set(current.rows.map(r=>effective(r).population))];card.append(el('p',populations.join(' / ')||'解析集団：原著で要確認','focus-population'));
   if(current.rows.some(r=>Object.keys(r.raw.statistics||{}).some(key=>visualEstimate(effective(r),key,raw.sources))))card.append(el('p','図からの概算（≈）です。原著の印字値とは別の候補で、未確認のまま解析に使用しません。','focus-guidance'));
   const table=el('table',null,'focus-matrix'),head=el('tr');head.append(el('th','統計量'));
   for(const row of current.rows){const a=arms.get(effective(row).armId),th=el('th'),abbr=el('abbr',current.rows.length===1&&effective(row).comparatorArmId?'比較全体の結果':a?.label||'報告値');abbr.title=a?.label||effective(row).population;abbr.tabIndex=0;th.scope='col';th.append(abbr);head.append(th);}table.append(head);
   const keys=[...new Set(current.rows.flatMap(r=>Object.entries(effective(r).statistics||{}).filter(([key,value])=>value!=null||Object.hasOwn(r.raw.statistics,key)).map(([key])=>key)))],labels={mean:'Mean',sd:'SD',se:'SE',ciLow:'CI lower',ciHigh:'CI upper',ciLevel:'CI level',n:'n',events:'Events',total:'Total',estimate:'Effect',eventCount:'Event count',personTime:'Person-time'};
   const estimateLabels=[...new Set(values.map(estimateLabel))];if(estimateLabels.length===1)labels.estimate=estimateLabels[0];
   const registered=new Set();for(const key of keys){const tr=el('tr');tr.append(el('th',labels[key]||key));for(const row of current.rows){const value=effective(row).statistics[key],td=el('td'),ref=row.raw.sourceRefs?.[key],anchor=effective(row).finalSourceAnchor||row.sourceAnchors.find(a=>a.sourceId===ref)||row.sourceAnchor;
     if(value==null){const missing=recordState()?.points[row.raw.id]?.missing?.[key],label={NOT_EXTRACTED:'未抽出',NOT_REPORTED:'原著に未報告',ILLEGIBLE:'判読不能',NOT_APPLICABLE:'該当なし'}[missing?.kind]||'未抽出 / 原著確認待ち';td.append(button(label,()=>missingDialog(row.raw.id,key),'focus-missing'));}
     else {const target={cardId:current.id,pointId:row.raw.id,field:key==='estimate'?'effect':key,armId:effective(row).armId,timepoint:effective(row).timepoint};
      const b=button(displayNumber(effective(row),key,raw.sources),event=>{if(event.button&&event.button!==0)return;lastNumeric=target;if(loaded&&anchor)source(row,anchor);else {lastError='原著を表示するには対応するPDFを再接続してください。';refresh();}},'focus-value');
      const openEdit=event=>{event.preventDefault();event.stopPropagation();lastNumeric=target;editValue(target);};
      b.addEventListener('contextmenu',openEdit);b.addEventListener('keydown',event=>{if(event.key==='F2'&&!event.repeat&&!event.isComposing)openEdit(event);});
      b.dataset.candidateId=current.id;b.dataset.fieldId=target.field;b.dataset.armId=target.armId||'';b.dataset.timepoint=target.timepoint;b.dataset.rawId=row.raw.id;b.dataset.statistic=key;b.title=[anchor?.pdfFile,'PDF p.'+anchor?.pdfPage,anchor?.row,anchor?.column].filter(Boolean).join(' / ');b.setAttribute('aria-label',`${labels[key]||key} ${value} — ${arms.get(effective(row).armId)?.label||'効果量'}の原著`);if(!registered.has(row.raw.id)){review.registerSourceButton?.(row.raw.id,b);registered.add(row.raw.id);}td.append(b);}tr.append(td);}table.append(tr);}
   card.append(table,el('p','左クリック：原著／右クリック：修正（数値にフォーカスしてF2でも修正）','focus-value-help'));
   const refs=el('div',null,'focus-sources');for(const row of current.rows)for(const anchor of row.sourceAnchors){const fields=Object.entries(row.raw.sourceRefs||{}).filter(([,id])=>id===anchor.sourceId).map(([key])=>labels[key]||key).join('/');const b=button(`${fields||'根拠'} · p.${anchor.pdfPage} ${anchor.label||''}`,()=>source(row,anchor));b.disabled=!loaded;b.dataset.sourceId=anchor.sourceId;refs.append(b);}card.append(refs);
   const primaryInfo=window.DataExPaperModel.classify(effective(current.rows[0]),current.outcome,raw);card.append(el('p',primaryInfo.statisticType+' — '+primaryInfo.hint,'focus-guidance'));
   const notes=el('div',null,'focus-guidance');const seen=new Set();for(const row of current.rows){const classified=window.DataExPaperModel.classify(effective(row),current.outcome,raw);if(!seen.has(classified.hint)){notes.append(el('p',classified.statisticType+' — '+classified.hint));seen.add(classified.hint);}}
   if(paper.comparisons.warning)notes.append(el('p',paper.comparisons.warning));card.append(fold('統計量・解析上の注意',d=>d.append(notes)));
   const derived=review.eligibleDerived(current);if(derived.length){const box=el('div',null,'focus-derived');for(const candidate of derived){box.append(el('p',`${candidate.effectType||candidate.kind} · Derived SE = ${candidate.statistics.se.toFixed(3)} · Generic inverse variance候補`));}const details=fold('計算詳細',d=>d.append(el('pre',JSON.stringify(derived.map(x=>window.DataExPaperModel.derivedPreview(x)),null,2))));box.append(details);const choose=el('label',null,'focus-check'),input=el('input');input.type='checkbox';input.id='focus-use-derived';choose.append(input,el('span','Derivedを別レイヤーで採用する（Rawはそのまま）'));box.append(choose);card.append(box);}
   refreshSource();refresh();
  }
  function missingDialog(id,field){const d=el('dialog',null,'decision-dialog');d.append(el('h3','空欄の理由を記録'));const kind=el('select');kind.setAttribute('aria-label','空欄の状態');for(const [value,label] of [['NOT_EXTRACTED','未抽出'],['NOT_REPORTED','原著に未報告'],['ILLEGIBLE','判読不能'],['NOT_APPLICABLE','該当なし']]){const o=el('option',label);o.value=value;kind.append(o);}const scope=el('input'),reason=el('input');scope.setAttribute('aria-label','確認した原著の範囲');scope.placeholder='例：PDF p.6 Table 2と脚注';reason.setAttribute('aria-label','判断理由');reason.placeholder='確認した範囲と判断理由を記録';const msg=el('p');d.append(kind,scope,reason,msg,button('状態を保存',async()=>{try{await review.perform({type:'UX_MISSING',id,field,kind:kind.value,scope:scope.value,reason:reason.value,operationId:crypto.randomUUID(),expectedRevision:recordState().revision});d.close();draw(true);}catch(e){msg.textContent=e.message;}}),button('キャンセル',()=>d.close()));d.addEventListener('close',()=>d.remove());document.body.append(d);d.showModal();}
  async function act(kind){
   if(working||!current)return;working=true;lastError='';error.textContent='';const set=current;let record;const operationId=crypto.randomUUID();
   try{refresh();if(kind==='adopt'){const actor=await review.ensureReviewer();if(!actor)return;traceActor.value=actor;await flow?.update(true);if(current?.id!==set.id)throw Error('候補が変わりました。現在の行を確認してください。');}record=recordState();if(kind==='undo'){const last=[...record.history].reverse().find(h=>h.uxUndo&&!record.history.some(x=>x.undoOf===h.operationId));await review.perform({type:'UX_UNDO',operationId,expectedRevision:record.revision});if(last?.resultSetId&&shown.some(c=>c.id===last.resultSetId))current=byId.get(last.resultSetId);draw(true);return;}
    if(kind==='adopt'){
     await review.declareCurrent(set,traceActor.value);
     if(!loaded)throw Error('原著確認の表明は保存しました。CSV保留：出典の整合性を検査するためPDFを再接続してください。');
     if(review.saveStatus().drafts)throw Error('未保存の修正があります。「修正」で保存またはキャンセルしてから採用してください。');
     // Anchor localization is distinct from human confirmation; CSV trace gates still apply.
     const evidence=Object.fromEntries(set.rows.map(r=>{const anchor=effective(r).finalSourceAnchor||r.sourceAnchor,location=locations.get(r.raw.id),response=location?.response;return [r.raw.id,{pdfId:study.pdf.pdfId,page:manual.value.trim()?Number(manualPage.value):anchor?.pdfPage,sourceIds:r.sourceAnchors.map(a=>a.sourceId),sourceLocation:location?.info?.status==='MULTIPLE'?'multiple':response?.resolutionStatus||'manually-reviewed',locatedSourceId:location?.anchor?.sourceId||null,locatedPdfPage:location?.anchor?.pdfPage||null,locatedQuote:(response?.matchedText||'').slice(0,2000),manualNote:manual.value.trim()||anchor?.manualNote||'',fields:Object.keys(effective(r).statistics||{})}];}));
     const useDerived=!!card.querySelector('#focus-use-derived:checked'),derived=review.eligibleDerived(set);
     const accepted=await review.acceptResultSet(set,{type:'UX_CONFIRM_ADOPT',operationId,expectedRevision:record.revision,confirmed:true,confirmationMethod:C.BUTTON_METHOD,candidateRevision:record.revision,evidence,traceActor:traceActor.value,...(flow?.active()?{workflow:{...flow.prepare(set),actor:traceActor.value}}:{}),...(useDerived?{useDerived:true,derivedCandidateIds:derived.map(x=>x.id)}:{})});if(!accepted)return;
    }else if(flow?.active()){await flow.decide(set,kind==='HOLD'?'HOLD':'EXCLUDE');return;}else await review.perform({type:'RESULT_SET',resultSet:set,status:kind,operationId,expectedRevision:record.revision});
    await flow?.update(true);current=byId.get(set.id);draw(true);
   }catch(e){lastError=e.message+(review.saveStatus().error?' 変更は保存されていません。内容を確認して、このカードで再操作してください。':'');error.textContent=lastError;}
   finally{working=false;if(recordState()?.revision!==catalogRevision)rebuildCatalog();draw();card.querySelector('h4')?.focus({preventScroll:true});refresh();}
  }
  function refresh(){
   adopt.textContent='このデータを承認';hold.textContent='保留';reject.textContent=flow?.active()?'この表には使わない':'使わない';
   const record=recordState(),status=review.saveStatus(),busy=working||status.busy;root.dataset.saving=String(busy);
   const confirmed=record?.verifiedCount??(record?Object.values(record.resultSets||{}).filter(s=>D.setEligible(record,s)).length:0);
   saved.textContent=status.error?'未保存：直前の操作に失敗しました':busy?'保存中…':!status.ready?'保存データを読込中':`保存済み · 原著確認して採用 ${confirmed}件`;saved.dataset.state=status.error?'error':busy?'saving':'saved';
   [edit,hold,reject,undo].forEach(b=>b.disabled=busy||!status.ready||!current);adopt.disabled=busy||!status.ready||!current||!!flow?.stopped();
   for(const control of finder.querySelectorAll('button,input,select'))control.disabled=busy;prev.disabled=busy||shown.indexOf(current)<=0;next.disabled=busy||shown.indexOf(current)>=shown.length-1;
   for(const control of categoryNav.querySelectorAll('button'))control.disabled=busy;
   exportFooter.hidden=!!flow;exportCount.textContent='採用済みデータ '+(review.basketCount?.()??0)+'件';exportButton.disabled=analysisButton.disabled=busy;
   const fullError=lastError||status.error;error.replaceChildren();if(fullError){const short=fullError.includes('確認・採用者')?'確認者の設定が必要です。作業バーの「確認者を設定」で設定してください。':fullError.includes('原文と位置')?'必要な原著の引用・位置が不足しています。「出典を確認・補記」で対象を確認してください。':fullError.split(' / ')[0];error.append(el('span',short));if(fullError!==short)error.append(fold('詳細ログ',d=>d.append(el('pre',fullError))));}else error.textContent=(!loaded?'原著を確認するにはPDFを再接続してください。':status.drafts?'未保存の修正があります。修正画面で保存またはキャンセルしてください。':'');
   const key=current&&record?JSON.stringify(current.pointIds.map(id=>record.points[id]?.decision.finalValue)):'';
   if(lastPaintKey&&key!==lastPaintKey){lastPaintKey=key;draw(true);return;}lastPaintKey=key;
   if(current)review.rememberCandidate?.(current.id);
   adoptionTarget.textContent=current?'承認対象: '+current.label+' · '+(current.comparison?.label||'比較未記録')+' · '+current.timepoint+' · '+current.resultType:'採用対象なし';
   const selected=record?.resultSets?.[current?.id];card.dataset.decision=selected?.status==='ACCEPTED'&&!selected.verified?'NEEDS_REVIEW':selected?.status||'CANDIDATE';
   const needsReview=current?.pointIds.some(id=>record?.points[id]?.verification==='NEEDS_REVIEW'),state=selected?.status;decisionState.textContent=state==='ACCEPTED'?(selected.verified?'承認済み・保存済み':'採用履歴あり · 原著確認・保存が揃うまで標準CSVから除外'):state==='HOLD'?'保留 · 候補とRawは保持':state==='EXCLUDED'?'使わない · 候補とRawは保持':needsReview?'再確認が必要 · 修正後のFinalは未採用':'未確認 · 未採用';
   const attestation=review.declarationState?.(current);cancelDeclaration.hidden=attestation?.status!=='CONFIRMED';cancelDeclaration.disabled=busy;if(attestation?.status==='CONFIRMED'&&state!=='ACCEPTED')decisionState.textContent=attestation.current?'原著確認・承認の表明：保存済み／CSV保留（必要な出典・保存版を確認）':'値・出典が変更されています：再確認待ち';
   const last=[...(record?.history||[])].reverse().find(h=>h.uxUndo&&!record.history.some(x=>x.undoOf===h.operationId));undo.disabled=undo.disabled||last?.revision!==record?.revision;
  }
  review.watchFinal(()=>{if(working){refresh();return;}if(recordState()?.revision!==catalogRevision){rebuildCatalog();applyFilters();}else refresh();});rebuildCatalog();draw();
  window.addEventListener('dataex-proposal-ready',async()=>{if(!root.isConnected)return;const records=await review.all(),catalog=window.DataExOutcomeWorkflow.catalog(records,review.selectedProject()?.id),next=proposedIdsForRecord(catalog,review.snapshot()?.id,all,r=>review.readFinalRow(r.raw.id),window.DataExAIProposal);if(next===null)return;proposed=next;proposalOnly=true;activeCategory='';search.value='';Object.values(selects).forEach(s=>s.value='');rebuildCatalog();applyFilters();});
  root.dataset.firstRenderMs=(performance.now()-started).toFixed(3);
  const workspace=review.workspaceElement?.();if(workspace&&!workspace.closest('.focus-workspace')){drawer.append(workspace);}
  document.body.classList.add('focus-review-active');
  if(!document.getElementById('focus-intake')){const content=document.querySelector('#condition-content'),intake=el('details');intake.id='focus-intake';intake.append(el('summary','PDFと任意条件を準備する（入力例あり）'));content.before(intake);intake.append(content);}
  const imports=document.getElementById('json-import-controls');if(imports)document.getElementById('focus-intake').after(imports);
  const reconnect=button(loaded?'接続中: '+study.pdf.filename:'PDFを再接続',()=>document.getElementById('choose-pdf').click(),'focus-reconnect');reconnect.title=study.pdf.filename;top.after(reconnect);
  flow=window.DataExOutcomeWorkflowUI?.mount({root,review,all,getCurrent:()=>current,select:id=>{const c=byId.get(id);if(c){current=c;draw(true);}},scope:ids=>{workflowScope=ids?new Set(ids):null;search.value="";Object.values(selects).forEach(s=>s.value="");activeCategory="";applyFilters();},refreshCard:()=>draw(),loaded,actor:()=>traceActor.value,clearSelection:()=>{current=null;draw(true);}});refresh();
  return {all,draw};
 }
 return Object.freeze({render,candidateIndex,filterCandidates,analysisReady,proposedIdsForRecord,primaryTimeMatch,primaryTypeMatch,displayNumber,overviewCandidates,primaryDetailNotice});
})();
