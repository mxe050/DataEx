/* Post-extraction review controls. No additional intake rules or AI calls. */
window.createDataExReview=function({openSaved,choosePdf}){
 const D=window.DataExDecision,store=window.DataExReviewStore;
 const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!=null)n.textContent=String(text);if(cls)n.className=cls;return n;};
 const button=(text,fn,cls)=>{const n=el('button',text,cls);n.type='button';n.addEventListener('click',()=>Promise.resolve().then(fn).catch(e=>tell(e.message)));return n;};
 const labels={CANDIDATE:'AI候補',REVIEWED:'原著表示済',ACCEPTED:'採用',EDITED:'修正済',EXCLUDED:'除外',HOLD:'保留',DRAFT:'未確定',PARTIALLY_CONFIRMED:'一部確認',CONFIRMED:'確定済',LOCKED:'ロック'};
 const host=el('section',null,'review-workspace');host.id='review-workspace';document.querySelector('.fuzzy-intro').after(host);
 const notice=el('p',null,'decision-message');notice.id='decision-message';notice.setAttribute('role','status');host.after(notice);
 const basketHost=el('aside',null,'accepted-data-tray');basketHost.id='accepted-data-tray';host.before(basketHost);
 let current=null,activeId=null,opened=null,ready=false,busy=false,loaded=false,listeners=new Set(),records=[],projectId=null,token=0,chain=Promise.resolve();
 const drafts=new Map(),sourceButtons=new Map();
 function finalRow(record,row){const result=structuredClone(row),p=record.points[row.id];if(p?.decision.finalValue){for(const key of D.numeric)result.statistics[key==='effect'?'estimate':key]=p.decision.finalValue[key]??null;result.humanDecisionStatus=p.decision.status;}return result;}
 function cacheDerived(record){
  const paper=window.DataExPaperModel;if(!paper?.classify)return record;const outcomes=new Map(record.snapshot.raw.outcomes.map(o=>[o.id,o]));
  record.derivedCandidates=record.snapshot.raw.rawValues.flatMap(row=>{const input=finalRow(record,row),info=paper.classify(input,outcomes.get(row.outcomeId),record.snapshot.raw),derived=info.derivedCandidates||[];return (Array.isArray(derived)?derived:[derived]).map((candidate,i)=>({...structuredClone(candidate),id:'derived:'+row.id+':'+i,rawId:row.id,status:'PROPOSED',readiness:info.readiness,basis:record.points[row.id]?.decision.finalValue?'HUMAN_FINAL':'AI_RAW',basisRevision:record.revision,baseStatistics:structuredClone(input.statistics),sourceRefs:structuredClone(row.sourceRefs)}));});
  record.derivedCandidateVersion=paper.VERSION||'v5';return record;
 }
 function tell(text){notice.textContent=text;}
 function subscribe(fn){listeners.add(fn);fn();}function notify(){for(const fn of listeners)fn();}
 function modal(title){const d=el('dialog',null,'decision-dialog'),h=el('h2',title);h.id='decision-title-'+crypto.randomUUID();d.setAttribute('aria-labelledby',h.id);d.append(h);document.body.append(d);d.addEventListener('close',()=>d.remove());d.showModal();return d;}
 function actions(...nodes){const a=el('div',null,'decision-actions');a.append(...nodes);return a;}
 function field(parent,label,value,type='text'){const l=el('label',label),n=el('input');n.type=type;n.value=value??'';if(type==='number')n.step='any';l.append(n);parent.append(l);return n;}
 function select(parent,label,options,value){const l=el('label',label),n=el('select');for(const [v,text] of options){const opt=el('option',text);opt.value=v;n.append(opt);}n.value=value;n.setAttribute('aria-label',label);l.append(n);parent.append(l);return n;}
 function download(text,name){const u=URL.createObjectURL(new Blob([text],{type:'text/csv;charset=utf-8'})),a=el('a');a.href=u;a.download=name.replace(/[<>:"/\\|?*]/g,'_');a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);}
 const disabled=()=>!ready||busy||current?.status==='LOCKED';
 async function refresh(){records=await store.all();records.sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));renderWorkspace();renderBasket();}
 async function run(action){
  const id=activeId;
  const work=async()=>{
   if(!ready||current?.id!==id)throw Error('保存データの読込後に操作してください。');
   busy=true;notify();
   try{const next=D.apply(current,action);if(next.revision===current.revision)return true;cacheDerived(next);await store.put(next,current.revision);if(activeId===id){current=next;opened=opened?.id===id?next:opened;tell('判断をこのブラウザに保存しました。');notify();}await refresh();return true;}
   finally{busy=false;notify();}
  };
  const result=chain.then(work);chain=result.catch(()=>{});return result;
 }
 function bind(study,context,isLoaded){
  loaded=isLoaded;listeners.clear();
  const project=opened&&opened.extractionId===study.raw.requestId&&opened.studyId===study.raw.pdfId?opened.project:D.projectFor(context),id=D.keyFor(study,project);
  if(activeId===id){notify();return;}
  drafts.clear();sourceButtons.clear();document.querySelectorAll('.decision-dialog[data-derived-set],.decision-dialog[data-point-id],.decision-dialog[data-confirm-outcome]').forEach(d=>d.close());
  activeId=id;ready=false;const generation=++token;current=cacheDerived(D.make({...structuredClone(study),extractionContext:structuredClone(context)},project));projectId=project.id;
  const draft=current;
  (async()=>{let saved=await store.get(id);if(!saved){await store.put(draft,-1);saved=draft;}else if(!saved.derivedCandidates&&window.DataExPaperModel){const revision=saved.revision;cacheDerived(saved);saved.revision++;saved.updatedAt=new Date().toISOString();saved.history.push({at:saved.updatedAt,action:'DERIVED_CANDIDATE_CACHE',target:null,note:'変換候補のみを保存。自動採用なし。',changes:[]});await store.put(saved,revision);}D.assertRecord(saved);if(generation!==token)return;current=saved;ready=true;notify();await refresh();})().catch(e=>{if(generation===token){ready=false;tell('Review Workspaceへ保存できません: '+e.message);notify();}});
 }
 async function showRecord(record){const generation=++token,previousId=activeId;activeId=null;ready=false;notify();try{record=await store.get(record.id)||record;if(generation!==token)return;opened=record;projectId=record.project.id;await openSaved(record);tell('保存した確定内容を表示しています。'+(loaded?'':'原著PDFを再選択してください。'));document.querySelector('#results-section').scrollIntoView({block:'start'});}catch(e){if(generation===token){activeId=previousId;ready=!!current;notify();}throw e;}}
 function renderWorkspace(){
  host.replaceChildren();const heading=el('div',null,'decision-heading');heading.append(el('h2','Review Workspace'),button('CSV出力',()=>csvDialog(),'review-csv-open'));host.append(heading);
  if(!records.length){host.append(el('p','確認した研究をここへ蓄積できます。','hint'));return;}
  const projects=[...new Map(records.map(r=>[r.project.id,r.project.label])).entries()];if(!projects.some(([id])=>id===projectId))projectId=projects[0][0];
  if(projects.length>1){const p=select(host,'保存先レビュー',projects,projectId);p.addEventListener('change',()=>{projectId=p.value;renderWorkspace();renderBasket();});}
  const scroll=el('div',null,'review-study-list'),table=el('table');table.setAttribute('aria-label','Review Workspaceの研究');
  const head=el('tr');['Study','確定Outcome','保留値','状態'].forEach(s=>head.append(el('th',s)));table.append(head);
  for(const r of records.filter(r=>r.project.id===projectId)){
   const tr=el('tr');tr.dataset.recordId=r.id;const name=el('td'),b=button(r.snapshot.raw.study.label.split(/\s+[—–]\s+/)[0],()=>showRecord(r));b.title='結果を見る / '+r.snapshot.pdf.filename;name.append(b);
   const c=D.counts(r);tr.append(name,el('td',c.confirmed),el('td',c.hold),el('td',labels[r.status]));table.append(tr);
  }scroll.append(table);host.append(scroll);
  const recent=records.find(r=>r.project.id===projectId);host.append(actions(button('前回の結果を見る',()=>showRecord(recent)),button('PDFを再接続',async()=>{await showRecord(recent);choosePdf();})));
 }
 function displayed(p){
  const v=D.value(p),s={n:v.n,mean:v.mean,sd:v.sd,se:v.se,estimate:v.effect,events:v.events,total:v.total,ciLow:v.ciLow,ciHigh:v.ciHigh,eventCount:v.eventCount,personTime:v.personTime};
  if(Number.isFinite(v.mean)&&v.sd==null&&v.se==null&&Number.isFinite(v.ciLow)&&Number.isFinite(v.ciHigh))return v.mean+' ['+v.ciLow+', '+v.ciHigh+']';
  return window.DataExResultsModel.formatValue({statistics:s,effectMeasure:v.effectType,resultType:v.resultType});
 }
 function editPoint(id){
  const p=current.points[id];if(disabled()||current.outcomes[p.outcomeId].status==='CONFIRMED')return;
  const recordId=activeId,d=modal('値を修正'),form=el('form'),fields={},initial={...D.value(p),reviewerNote:p.decision.reviewerNote},editing=drafts.get(id)||initial;d.dataset.pointId=id;
  d.append(el('p',p.raw.outcome+' / '+p.raw.arm+' / '+p.raw.timepoint,'hint'),el('p','AI候補（Raw）は履歴に保持し、Final値だけを変更します。','hint'));
  const keys=p.raw.comparatorArmId||p.raw.resultType==='effect'?['effect','se','ciLow','ciHigh']:p.raw.dataType==='binary'?['events','total','n']:['mean','sd','n','se','ciLow','ciHigh'];
  const grid=el('div',null,'decision-edit-comparison');grid.append(el('strong','項目'),el('strong','AI候補（変更不可）'),el('strong','Final'));
  for(const k of [...keys,'unit']){const label={mean:'Mean',sd:'SD',n:'n',events:'Events',total:'Total',effect:'Effect',se:'SE',ciLow:'CI lower',ciHigh:'CI upper',unit:'Unit'}[k];grid.append(el('span',label));const ai=el('span',p.raw[k]??'—','decision-ai-value');ai.dataset.aiField=k;grid.append(ai);fields[k]=field(grid,label,editing[k],k==='unit'?'text':'number');fields[k].dataset.field=k;fields[k].parentElement.className='decision-final-input';}
  form.append(grid);const note=el('label','修正理由・原著注記（任意）'),area=el('textarea');area.value=editing.reviewerNote||'';area.rows=2;area.dataset.field='reviewerNote';note.append(area);form.append(note);
  const error=el('p',null,'decision-message');error.setAttribute('role','status');form.append(error);
  const capture=()=>{if(activeId!==recordId)throw Error('研究が切り替わりました。');const patch={};for(const [k,n] of Object.entries(fields))patch[k]=k==='unit'?n.value:n.validity.badInput?NaN:n.value.trim()===''?null:Number(n.value);patch.reviewerNote=area.value;const dirty=Object.entries(patch).some(([k,v])=>v!==initial[k]);if(dirty)drafts.set(id,patch);else drafts.delete(id);return patch;};
  const act=fn=>async()=>{try{await fn();}catch(e){error.textContent=e.message;}};
  form.addEventListener('input',()=>{try{capture();}catch(e){error.textContent=e.message;}});
  const save=button('修正を保存',act(async()=>{const patch=capture();await run({type:'POINT',id,status:'EDITED',patch});drafts.delete(id);d.close();}));
  const source=button('原著を見る',act(()=>{capture();d.close();sourceButtons.get(id)?.click();}));source.disabled=!loaded||!sourceButtons.has(id);
  const finalize=button('このOutcomeを確定',act(()=>{capture();D.apply(current,{type:'POINT',id,status:'EDITED',patch:drafts.get(id)||capture()});d.close();confirmOutcome(p.outcomeId,id);}));
  const cancel=()=>{drafts.delete(id);d.close();};d.addEventListener('cancel',e=>{e.preventDefault();cancel();});
  form.addEventListener('submit',e=>e.preventDefault());form.append(actions(source,save,finalize,button('キャンセル',cancel)));d.append(form);
 }
 function confirmOutcome(id,returnTo){
  const o=current.outcomes[id],edits=[...drafts].filter(([pid])=>current.points[pid]?.outcomeId===id).map(([id,patch])=>({id,patch}));
  const original=current.snapshot.raw.outcomes.find(x=>x.id===id),suggested=window.DataExICO.outcome(original,current.snapshot.extractionContext);
  const reviewConcept=o.canonicalLabel===o.label?(suggested?.reviewConcept||o.canonicalLabel):o.canonicalLabel;
  const action={type:'FINALIZE_OUTCOME',id,edits,reviewConcept,allowIncomplete:true};
  const preview=D.apply(current,action),points=D.forOutcome(preview,id).filter(p=>D.FINAL.includes(p.decision.status));
  const d=modal('Outcomeの確定内容を確認');d.dataset.confirmOutcome=id;
  d.append(el('h3',reviewConcept),el('p','原著: '+o.label),el('p','時点: '+[...new Set(points.map(p=>p.raw.timepoint))].join(' / ')),el('p','群: '+[...new Set(points.map(p=>p.raw.arm))].join(' / ')),el('p',`採用 ${points.length}件 · 修正 ${points.filter(p=>p.decision.status==='EDITED').length}件 · n未確定 ${points.filter(p=>p.raw.dataType==='continuous'&&!p.raw.comparatorArmId&&D.value(p).n==null).length}件`));
  const warning=el('div',null,'decision-confirm-warning');D.warnings(preview,id).forEach(text=>warning.append(el('p',text)));d.append(warning);
  if(edits.length)d.append(el('p',`未保存の修正 ${edits.length}件を含みます。Final値を保存して確定します。`));
  d.append(el('p','候補・原著表示済の追跡値を採用します。個別の除外・保留、Raw / AI候補は保持します。','hint'));
  const error=el('p',null,'decision-message');error.setAttribute('role','status');d.append(error);
  const back=()=>{d.close();if(returnTo)editPoint(returnTo);};d.addEventListener('cancel',e=>{e.preventDefault();back();});
  d.append(actions(button(edits.length?'修正を保存して確定':'そのまま確定',async()=>{try{await run(action);edits.forEach(e=>drafts.delete(e.id));d.close();}catch(e){error.textContent=e.message;}}),button('戻る',back)));
 }
 function wrapValue(row,b){
  sourceButtons.set(row.raw.id,b);
  const wrap=el('div',null,'decision-cell'),menu=el('details',null,'decision-cell-menu'),summary=el('summary','⋯'),badge=el('span',null,'decision-badge'),panel=el('div',null,'decision-menu-items');
  summary.setAttribute('aria-label','値の操作: '+row.raw.id);menu.dataset.pointId=row.raw.id;menu.append(summary,panel);
  const menus=[['原著を見る',()=>b.click()],['採用',()=>run({type:'POINT',id:row.raw.id,status:'ACCEPTED'})],['修正',()=>editPoint(row.raw.id)],['除外',()=>run({type:'POINT',id:row.raw.id,status:'EXCLUDED'})],['保留',()=>run({type:'POINT',id:row.raw.id,status:'HOLD'})]];
  const controls=menus.map(([label,fn])=>{const n=button(label==='修正'?'値を修正':label,async()=>{menu.open=false;await fn();});n.dataset.decisionAction=label;panel.append(n);return n;});
  const pencil=button('✎',()=>editPoint(row.raw.id),'decision-edit-pencil');pencil.setAttribute('aria-label','値を修正: '+row.raw.id);pencil.title='値を修正';
  wrap.append(b,pencil,menu,badge);const originalTitle=b.title,originalDisplay=row.display;
  subscribe(()=>{const p=current?.points[row.raw.id];if(!p)return;wrap.dataset.decisionStatus=p.decision.status;badge.textContent=['CANDIDATE','REVIEWED'].includes(p.decision.status)?'':labels[p.decision.status];badge.hidden=!badge.textContent;
   b.textContent=p.decision.finalValue?displayed(p):originalDisplay;b.title=originalTitle+'\nAI値: '+originalDisplay+'\nFinal値: '+(p.decision.finalValue?displayed(p):'未設定')+'\n状態: '+labels[p.decision.status];badge.title=b.title;b.setAttribute('aria-label',b.textContent+' — '+p.raw.arm+', '+p.raw.timepoint+'の原著');
   pencil.disabled=disabled()||current.outcomes[p.outcomeId]?.status==='CONFIRMED';controls.forEach((n,i)=>n.disabled=i===0?b.disabled:pencil.disabled);summary.setAttribute('aria-label','値の操作: '+row.raw.id+' / '+labels[p.decision.status]);
  });return wrap;
 }
 async function viewed(id,response){if(response?.ok&&response.resolutionStatus!=='page'&&current?.points[id]?.decision.status==='CANDIDATE'&&ready&&!busy&&current.status!=='LOCKED')try{await run({type:'POINT',id,status:'REVIEWED'});}catch(e){tell(e.message);}}
 function attachOutcome(body,o){
  const section=el('section',null,'outcome-decisions');section.dataset.decisionOutcome=o.id;const status=el('p',null,'decision-outcome-status'),warning=el('div',null,'decision-confirm-warning');
  const adopt=button('レビューに採用',()=>run({type:'ADOPT_OUTCOME',id:o.id})),exclude=button('今回は使わない',()=>run({type:'EXCLUDE_OUTCOME',id:o.id})),confirm=button('このOutcomeを確定',()=>confirmOutcome(o.id),'decision-primary'),reopen=button('確定を解除して編集',()=>run({type:'REOPEN_OUTCOME',id:o.id}));
  section.append(status,actions(adopt,exclude,confirm,reopen),el('p','一括採用は全群・全追跡時点。個別の修正・除外・保留は保持します。Baseline・関連効果はセルごとに判断できます。','decision-scope'),warning);
  const name=el('details'),s=el('summary','レビューでの名称');name.append(s);const input=field(name,'確定Outcome名（任意）',current?.outcomes[o.id]?.canonicalLabel||o.reportedName);const saveName=button('名称を保存',()=>run({type:'LABEL',id:o.id,label:input.value}));name.append(saveName);section.append(name);body.append(section);
  subscribe(()=>{const state=current?.outcomes[o.id];if(!state)return;const points=D.forOutcome(current,o.id),confirmed=state.status==='CONFIRMED';status.textContent=(confirmed?'✓ 確定済み':labels[state.status]||state.status)+' · 採用 '+points.filter(p=>D.FINAL.includes(p.decision.status)).length+' / 修正 '+points.filter(p=>p.decision.status==='EDITED').length+' / 保留 '+points.filter(p=>p.decision.status==='HOLD').length;section.dataset.outcomeStatus=state.status;if(document.activeElement!==input)input.value=state.canonicalLabel;[adopt,exclude,confirm,saveName,input].forEach(n=>n.disabled=disabled()||confirmed);reopen.hidden=!confirmed;reopen.disabled=disabled();});
 }
 function attachResultSet(parent,spec){
  const set=structuredClone(spec),section=el('section',null,'result-set-decisions'),status=el('p',null,'result-set-status');section.dataset.resultSetId=set.id;
  const accept=button('✓ このデータを採用',()=>run({type:'RESULT_SET',resultSet:set,status:'ACCEPTED'}),'decision-primary');accept.dataset.resultSetAction='accept';
  const edit=button('✎ 修正',()=>editResultSet(set));edit.dataset.resultSetAction='edit';
  const hold=button('保留',()=>run({type:'RESULT_SET',resultSet:set,status:'HOLD'}));hold.dataset.resultSetAction='hold';
  const reject=button('使わない',()=>run({type:'RESULT_SET',resultSet:set,status:'EXCLUDED'}));reject.dataset.resultSetAction='exclude';
  const convert=button('換算候補を確認',()=>confirmDerivedSet(set));convert.dataset.resultSetAction='derive';
  section.append(status,el('p',D.comparisonLabel(set),'result-set-comparison'),actions(accept,edit,hold,reject,convert),el('p',set.timepoint+' · Result type: '+set.resultType+' · この比較だけを採用','result-set-scope'));parent.append(section);
  subscribe(()=>{const saved=current?.resultSets?.[set.id];status.textContent=saved?.status==='ACCEPTED'?'✓ 採用済み'+(saved.acceptedDerived?.length?'（換算値）':'')+' — CSV候補へ反映':saved?.status==='EDITED_DRAFT'?'修正済み — 原著確認後に「採用」してください':saved?labels[saved.status]:'AI候補 — 人間の確認後に採用';section.dataset.resultSetStatus=saved?.status||'CANDIDATE';[accept,edit,hold,reject,convert].forEach(b=>b.disabled=disabled()||!set.pointIds?.length);accept.disabled=accept.disabled||saved?.status==='ACCEPTED';convert.hidden=!eligibleDerived(set).length;});return section;
 }
 function eligibleDerived(set){return set.pointIds.length===1?(current?.derivedCandidates||[]).filter(d=>d.readiness==='CONVERTIBLE'&&set.pointIds.includes(d.rawId)&&['LOG_RATIO_CI','LOG_RATIO','EFFECT_CI'].includes(d.kind)):[];}
 function confirmDerivedSet(set){const recordId=activeId,candidates=eligibleDerived(set);if(!candidates.length)return;const d=modal('換算値の前提を確認');d.dataset.derivedSet=set.id;d.append(el('p','原著の効果量・CIをRawに保持します。換算値はDerivedとして採用し、GIVで使用します。'));for(const candidate of candidates){d.append(el('h3',candidate.kind),el('pre',JSON.stringify({original:candidate.inputs,derived:candidate.statistics,formula:candidate.formula},null,2)));for(const assumption of candidate.assumptions||[])d.append(el('p','・'+assumption));const source=button('原著を見る',()=>{d.close();sourceButtons.get(candidate.rawId)?.click();});source.disabled=!loaded||!sourceButtons.has(candidate.rawId);d.append(source);}d.append(actions(button('この換算値を採用',async()=>{if(activeId!==recordId)throw Error('研究が切り替わりました。');await run({type:'RESULT_SET',resultSet:set,status:'ACCEPTED',useDerived:true,derivedCandidateIds:candidates.map(c=>c.id)});d.close();}),button('戻る',()=>d.close())));}
 function editResultSet(spec){
  if(disabled())return;const recordId=activeId,d=modal('このデータを修正'),entries=[];d.dataset.resultSetEdit=spec.id;
  d.append(el('p',[spec.label,D.comparisonLabel(spec),spec.timepoint,spec.resultType].filter(Boolean).join(' / ')),el('p','Rawを保持してFinalの修正案を保存します。「採用」するまでCSVには出しません。','hint'));
  for(const id of spec.pointIds){const p=current.points[id];if(!p)continue;const fs=el('fieldset'),fields={},initial={...D.value(p),reviewerNote:p.decision.reviewerNote},editing=drafts.get(id)||initial;fs.append(el('legend',p.raw.arm||p.raw.outcome));
   const keys=p.raw.comparatorArmId||p.raw.resultType==='effect'||(p.raw.effect!=null&&p.raw.mean==null)?['effect','se','ciLow','ciHigh','n']:p.raw.dataType==='binary'?['events','total','n']:['mean','sd','n','se','ciLow','ciHigh'];
   const grid=el('div',null,'decision-edit-comparison');grid.append(el('strong','項目'),el('strong','AI候補（Raw）'),el('strong','Final'));
   for(const key of [...keys,'unit']){grid.append(el('span',key),el('span',p.raw[key]??'—','decision-ai-value'));fields[key]=field(grid,key,editing[key],key==='unit'?'text':'number');fields[key].dataset.pointField=id+':'+key;fields[key].parentElement.className='decision-final-input';}
   fs.append(grid);const note=field(fs,'修正理由（任意）',editing.reviewerNote);const source=button('原著を見る',()=>{capture();d.close();sourceButtons.get(id)?.click();});source.disabled=!loaded||!sourceButtons.has(id);fs.append(source);d.append(fs);entries.push({id,fields,note,initial});
  }
  const error=el('p',null,'decision-message');error.setAttribute('role','status');d.append(error);
  function capture(){if(activeId!==recordId)throw Error('研究が切り替わりました。');return entries.map(({id,fields,note,initial})=>{const patch={reviewerNote:note.value};for(const [key,input] of Object.entries(fields))patch[key]=key==='unit'?input.value:input.validity.badInput?NaN:input.value.trim()===''?null:Number(input.value);if(Object.entries(patch).some(([k,v])=>v!==initial[k]))drafts.set(id,patch);else drafts.delete(id);return {id,patch};});}
  d.addEventListener('input',()=>{try{capture();}catch(e){error.textContent=e.message;}});
  const cancel=()=>{entries.forEach(e=>drafts.delete(e.id));d.close();};d.addEventListener('cancel',e=>{e.preventDefault();cancel();});
  d.append(actions(button('修正を保存',async()=>{try{const edits=capture();await run({type:'RESULT_SET',resultSet:spec,status:'EDITED_DRAFT',edits});entries.forEach(e=>drafts.delete(e.id));d.close();tell('修正案を保存しました。原著を確認し「このデータを採用」を押してください。');}catch(e){error.textContent=e.message;}}),button('キャンセル',cancel)));
 }
 function renderBasket(){
  const items=D.basket(records,projectId);basketHost.replaceChildren();const count=el('strong','採用済みデータ '+items.length+'件');count.id='accepted-data-count';
  basketHost.append(count,button('表示',basketDialog,'accepted-data-open'),button('CSV',basketCsvDialog,'accepted-data-csv'));
  if(projectId){const label=records.find(r=>r.project.id===projectId)?.project.label;if(label){const note=el('span',label,'accepted-data-review');note.title=label;basketHost.append(note);}}
 }
 async function basketDialog(){
  await refresh();const d=modal('採用済みデータ'),items=D.basket(records,projectId),table=el('table'),head=el('tr');table.className='accepted-data-table';['Study','Comparison','Outcome','Time / Type','Data'].forEach(t=>head.append(el('th',t)));table.append(head);
  for(const {record:r,set} of items){const tr=el('tr');tr.dataset.acceptedSet=set.id;const name=el('td');name.append(button(r.snapshot.raw.study.label,async()=>{d.close();await showRecord(r);}));tr.append(name,el('td',D.comparisonLabel(set)),el('td',r.outcomes[set.outcomeId]?.canonicalLabel||set.label),el('td',set.timepoint+' / '+set.resultType),el('td',set.pointIds.map(id=>{const p=r.points[id],v=set.acceptedValues[id];return (v.arm||'')+': '+displayed({...p,decision:{...p.decision,finalValue:v}});}).join(' vs ')));table.append(tr);}
  const wrap=el('div',null,'decision-csv-preview');wrap.append(table);d.append(el('p',items.length+'件。修正案・保留・未採用候補は含みません。'),wrap,actions(button('CSVプレビュー',()=>{d.close();return basketCsvDialog();}),button('閉じる',()=>d.close())));
 }
 async function copyText(text,area){
  try{if(!navigator.clipboard?.writeText)throw Error('Clipboard API unavailable');await navigator.clipboard.writeText(text);return;}
  catch(_){const original=area.value;area.value=text;area.focus();area.select();area.setSelectionRange(0,text.length);let ok=false;try{ok=document.execCommand('copy');}finally{if(ok)area.value=original;}if(!ok){area.className='accepted-csv-text';area.style.cssText='';area.focus();area.select();throw Error('自動コピーできません。全文を選択してCtrl+Cでコピーしてください。');}}
 }
 async function basketCsvDialog(){
  await refresh();const d=modal('採用済みデータのCSV'),filters=el('div',null,'decision-export-filters'),projects=[...new Map(records.map(r=>[r.project.id,r.project.label])).entries()];d.dataset.basketCsv='true';
  const project=select(filters,'Review',projects,projectId||projects[0]?.[0]||''),format=select(filters,'形式',[['master','Master long format'],['continuous','Continuous pairwise'],['binary','Binary pairwise'],['giv','Generic inverse variance']],'master');
  const warning=el('div',null,'decision-csv-warnings'),count=el('p'),previewText=el('pre',null,'accepted-csv-text'),area=el('textarea',null,'accepted-csv-fallback');previewText.setAttribute('aria-label','CSV全文プレビュー');previewText.tabIndex=0;area.readOnly=true;area.rows=12;area.tabIndex=-1;area.style.cssText='position:absolute;opacity:0;width:1px;height:1px;pointer-events:none';area.setAttribute('aria-label','CSV手動コピー用');warning.setAttribute('role','status');let preview=null,versions=null;
  const signature=rs=>JSON.stringify(rs.filter(r=>r.project.id===project.value).map(r=>[r.id,r.revision]).sort());
  const controls=[];const invalidate=message=>{preview=null;area.value='';previewText.textContent='';controls.forEach(b=>b.disabled=true);warning.replaceChildren(el('p',message||'プレビューを更新してください。'));};
  async function build(){records=await store.all();preview=D.exportBasket(records,{projectId:project.value,format:format.value});versions=signature(records);area.value=preview.csv;previewText.textContent=preview.csv;count.textContent=preview.count+' Result set · '+preview.rows.length+'行（全文表示）';warning.replaceChildren();preview.warnings.forEach(w=>{const p=el('p',w.message);p.dataset.warningCode=w.code;warning.append(p);});controls.forEach(b=>b.disabled=preview.blocked||!preview.rows.length);}
  async function output(kind){if(!preview||preview.blocked||!preview.rows.length)return;const latest=await store.all();if(signature(latest)!==versions){invalidate('採用内容が更新されています。プレビューを更新してください。');return;}if(kind==='save'){const label=projects.find(([id])=>id===project.value)?.[1]||'Review';download(preview.csv,label+'_accepted_'+format.value+'.csv');}else{await copyText(kind==='tsv'?preview.tsv:preview.csv,area);tell((kind==='tsv'?'TSV':'CSV')+'全文をコピーしました。');}}
  controls.push(button('CSVをコピー',()=>output('csv')),button('CSVを保存',()=>output('save')),button('TSVをコピー',()=>output('tsv')));
  const update=button('プレビューを更新',build);for(const n of [project,format])n.addEventListener('change',()=>{invalidate();build().catch(e=>warning.replaceChildren(el('p',e.message)));});
  d.append(filters,count,warning,previewText,area,actions(...controls,update,button('閉じる',()=>d.close())));await build();
 }
 async function releaseCurrent(){
  await chain;if(drafts.size){const discard=await new Promise(resolve=>{const d=modal('未保存の修正があります');d.append(el('p','未保存の入力だけを破棄して次の論文へ進みますか。保存済みのRaw・Final・採用データは保持します。'));const done=value=>{d.close();resolve(value);};d.addEventListener('cancel',e=>{e.preventDefault();done(false);});d.append(actions(button('未保存の入力を破棄して進む',()=>done(true)),button('戻る',()=>done(false))));});if(!discard)return false;}
  ++token;activeId=null;current=null;opened=null;ready=false;loaded=false;listeners.clear();drafts.clear();sourceButtons.clear();document.querySelectorAll('.decision-dialog[data-derived-set],.decision-dialog[data-point-id],.decision-dialog[data-confirm-outcome],.decision-dialog[data-result-set-edit]').forEach(d=>d.close());await refresh();return true;
 }
 function readFinalRow(id){const raw=current?.snapshot.raw.rawValues.find(r=>r.id===id);return raw?finalRow(current,raw):null;}
 function choicePanel(parent){
  const fold=el('details',null,'decision-choice-panel');fold.append(el('summary','群・時点の確認（抽出後）'));
  const arms=current.snapshot.raw.study.arms, proposals=current.snapshot.raw.proposals, armProposal=proposals.find(p=>p.kind==='ARM_COMBINATION'), timeProposal=proposals.find(p=>p.kind==='TIME_CLUSTER');
  if(arms.length>2){
   fold.append(el('h4','複数群の扱い'));if(armProposal)fold.append(el('p','AI提案: '+armProposal.label),el('p',armProposal.reason,'hint'));
   fold.append(el('p','群の判断を保存します。統合値・共有対照の分割は自動計算しません。','hint'));
   const status=el('p');fold.append(status);
   const btns=[];if(armProposal)btns.push(button('AI推奨を採用',()=>run({type:'CHOICES',arms:{mode:'RECOMMENDED',proposalId:armProposal.id,groups:[],note:armProposal.label}})));
   btns.push(button(arms.length+'群を別々',()=>run({type:'CHOICES',arms:{mode:'SEPARATE',proposalId:null,groups:arms.map(a=>({label:a.label,armIds:[a.id]}))}})),button('編集',()=>{
    const d=modal('群のまとめ方を編集'),inputs=arms.map(a=>({arm:a,input:field(d,a.label,current.choices.arms.groups.find(g=>g.armIds.includes(a.id))?.label||a.label)}));
    d.append(el('p','同じまとめ先名を入力すると、そのグループとして保存します。原値の合算はしません。','hint'),actions(button('群の判断を保存',async()=>{const groups=[];for(const {arm,input} of inputs){const label=input.value.trim()||arm.label;let g=groups.find(g=>g.label===label);if(!g){g={label,armIds:[]};groups.push(g);}g.armIds.push(arm.id);}await run({type:'CHOICES',arms:{mode:'EDITED',proposalId:null,groups}});d.close();}),button('戻る',()=>d.close())));
   }),button('後で決める',()=>run({type:'CHOICES',arms:{mode:'UNDECIDED',proposalId:null,groups:[]}})));
   fold.append(actions(...btns));subscribe(()=>{status.textContent='保存した判断: '+({UNDECIDED:'未決定',RECOMMENDED:'AI推奨を採用',SEPARATE:'原著の群を別々',EDITED:'グループを編集'}[current.choices.arms.mode]);btns.forEach(b=>b.disabled=disabled());});
  }
  const times=[...new Set(Object.values(current.points).map(p=>p.raw.timepoint).filter(t=>!window.DataExResultsModel.baseline(t)))];
  if(times.length>1){fold.append(el('h4','CSVへ保存する時点'));if(timeProposal)fold.append(el('p','AI提案: '+timeProposal.label,'hint'));const state=el('p');fold.append(state);const options=actions();
   for(const t of times.slice(0,8))options.append(button(t.replace(/weeks?/i,'週'),()=>run({type:'CHOICES',time:{mode:'SELECTED',selected:[t]}})));
   options.append(button('複数時点を保存',()=>run({type:'CHOICES',time:{mode:'ALL',selected:[]}})),button('後で決める',()=>run({type:'CHOICES',time:{mode:'HOLD',selected:[]}})));fold.append(options);
   subscribe(()=>{state.textContent=current.choices.time.mode==='ALL'?'全時点を保持・出力':current.choices.time.mode==='HOLD'?'時点選択は保留（通常CSVから一時除外）':current.choices.time.selected.join(' / ')+'を通常CSVへ出力';options.querySelectorAll('button').forEach(n=>n.disabled=disabled());});
  }parent.append(fold);
 }
 function studySummary(d){
  const clinical=Object.values(current.outcomes).filter(o=>o.clinical),adopted=o=>D.forOutcome(current,o.id).some(p=>[...D.FINAL,'HOLD'].includes(p.decision.status));
  const groups=[['採用・確定',o=>o.status==='CONFIRMED'],['採用・保留',o=>!['CONFIRMED','EXCLUDED'].includes(o.status)&&adopted(o)],['今回は使わない',o=>o.status==='EXCLUDED']];
  d.append(el('h3',current.snapshot.raw.study.label.split(/\s+[—–]\s+/)[0]));
  d.append(el('p','修正済み値: '+Object.values(current.points).filter(p=>p.decision.status==='EDITED').length+'件'));
  for(const [title,predicate] of groups){const list=clinical.filter(predicate);d.append(el('h4',title+' · '+list.length+'件'));if(list.length){const ul=el('ul');list.forEach(o=>{const li=el('li',o.canonicalLabel);li.title=o.label;ul.append(li);});d.append(ul);}}
  const pending=clinical.filter(o=>!['CONFIRMED','EXCLUDED'].includes(o.status)&&!adopted(o));if(pending.length){const fold=el('details');fold.append(el('summary','未確認の候補 '+pending.length+'件'));const ul=el('ul');pending.forEach(o=>ul.append(el('li',o.label)));fold.append(ul);d.append(fold);}
  d.append(el('p','保留・未確認の値は通常CSVに含めません。Outcome未確定の採用値も、既定のCSVには含めません。','hint'));
 }
 function attachStudy(parent){
  const section=el('section',null,'study-finalization'),status=el('p'),confirm=button('この研究を確定してReview Workspaceへ追加',()=>{
   if(drafts.size){tell('未保存の修正があります。該当Outcomeで修正を保存して確定してください。');return;}const d=modal('研究の確定内容を確認');studySummary(d);d.append(actions(button('確定して保存',async()=>{await run({type:'CONFIRM_STUDY'});d.close();}),button('戻る',()=>d.close())));
  },'decision-primary'),reopen=button('研究を再編集',()=>run({type:'REOPEN'})),lock=button('研究をロック',()=>run({type:'LOCK'}));
  section.append(el('h3','研究の確定'),status,confirm,actions(reopen,lock,button('変更履歴',()=>{const d=modal('判断・変更履歴');const list=el('div',null,'decision-history');for(const h of [...current.history].reverse()){const item=el('details');item.append(el('summary',h.at+' / '+h.action+(h.target?' / '+h.target:'')),el('pre',JSON.stringify(h,null,2)));list.append(item);}if(!current.history.length)list.append(el('p','まだ判断履歴はありません。'));d.append(list,button('閉じる',()=>d.close()));})));
  parent.append(section);subscribe(()=>{status.textContent=ready?labels[current.status]+' · 確定Outcome '+D.counts(current).confirmed:'保存データを読み込んでいます…';confirm.disabled=disabled();reopen.disabled=!ready||busy||!['CONFIRMED','LOCKED'].includes(current.status);lock.disabled=!ready||busy||current.status!=='CONFIRMED';});
  choicePanel(section);
 }
 async function csvDialog(){
  await refresh();const d=modal('CSV出力'),content=el('div'),filters=el('div',null,'decision-export-filters');d.append(filters);
  const projects=[...new Map(records.map(r=>[r.project.id,r.project.label])).entries()];const project=select(filters,'Review',projects,projectId||projects[0]?.[0]||'');
  const check=(label)=>{const l=el('label'),n=el('input');n.type='checkbox';n.checked=true;l.append(n,document.createTextNode(label));filters.append(l);return n;};
  const studies=check('確定済み研究のみ'),outcomes=check('確定済みOutcomeのみ');
  const format=select(filters,'形式',[['master','Master long format'],['continuous','Continuous pairwise'],['binary','Binary pairwise'],['giv','Generic inverse variance'],['audit','Audit CSV（全状態）']],'master');
  const resultType=select(filters,'連続値の種類',[['endpoint','Endpoint'],['change','Change']],'endpoint');
  const pairArea=el('div',null,'decision-pairs'),warnings=el('div',null,'decision-csv-warnings');warnings.setAttribute('role','status');let pairs={},preview=null,versions=null;
  const save=button('CSV保存',()=>saveCsv(false),'decision-save-csv');save.disabled=true;
  const heldSave=button('確定済みだけ出力',()=>saveCsv(true));heldSave.hidden=true;
  const checkHold=button('保留を確認',async()=>{const r=records.find(r=>r.project.id===project.value&&D.counts(r).hold);if(r){d.close();await showRecord(r);tell(D.counts(r).hold+'件の値を保留中です。Outcomeのセルメニューで確認できます。');}});checkHold.hidden=true;
  const invalidate=()=>{preview=null;save.disabled=true;heldSave.hidden=true;checkHold.hidden=true;content.replaceChildren();warnings.replaceChildren();};
  const pairControls=()=>{
   invalidate();pairArea.replaceChildren();pairs={};const pairwise=['continuous','binary','giv'].includes(format.value);resultType.parentElement.hidden=format.value!=='continuous';studies.disabled=outcomes.disabled=format.value==='audit';
   if(pairwise)for(const r of records.filter(r=>r.project.id===project.value)){if(studies.checked&&!['CONFIRMED','LOCKED'].includes(r.status))continue;const group=el('fieldset');group.append(el('legend',r.snapshot.raw.study.label.split(/\s+[—–]\s+/)[0]));const opts=[['','比較を選択'],...r.snapshot.raw.study.arms.map(a=>[a.id,a.label])];const a=select(group,'Intervention',opts,''),b=select(group,'Comparator',opts,'');a.dataset.pairIntervention=r.id;b.dataset.pairComparator=r.id;for(const n of [a,b])n.addEventListener('change',()=>{invalidate();pairs[r.id]={intervention:a.value,comparator:b.value};});pairArea.append(group);}
  };
  for(const n of [project,format,studies])n.addEventListener('change',pairControls);for(const n of [outcomes,resultType])n.addEventListener('change',invalidate);
  const build=button('プレビュー',async()=>{
   records=await store.all();preview=D.exportData(records,{format:format.value,projectId:project.value,confirmedStudies:studies.checked,confirmedOutcomes:outcomes.checked,resultType:format.value==='continuous'?resultType.value:undefined,pairs});
   versions=JSON.stringify(records.map(r=>[r.id,r.revision]).sort());warnings.replaceChildren();preview.warnings.forEach(w=>{const p=el('p',w.message);p.dataset.warningCode=w.code;warnings.append(p);});
   content.replaceChildren();content.append(el('p',preview.rows.length+'行。プレビューは先頭20行、CSVは全行を保存します。','decision-preview-count'));const scroll=el('div',null,'decision-csv-preview'),table=el('table'),head=el('tr');preview.columns.forEach(c=>head.append(el('th',c)));table.append(head);
   for(const row of preview.rows.slice(0,20)){const tr=el('tr');preview.columns.forEach(c=>tr.append(el('td',row[c]??'')));table.append(tr);}scroll.append(table);content.append(scroll);
   const canSave=preview.rows.length>0&&!preview.blocked;save.disabled=!canSave||(preview.held>0&&format.value!=='audit');heldSave.hidden=!canSave||!preview.held||format.value==='audit';checkHold.hidden=!preview.held||format.value==='audit';
  });
  async function saveCsv(ackHold){
   if(!preview||!preview.rows.length||preview.blocked)return;
   if(preview.held&&preview.format!=='audit'&&!ackHold){tell('保留の警告を確認してください。');return;}
   const latest=await store.all();if(JSON.stringify(latest.map(r=>[r.id,r.revision]).sort())!==versions){invalidate();warnings.append(el('p','保存内容が更新されています。もう一度プレビューしてください。'));return;}
   const label=projects.find(([id])=>id===project.value)?.[1]||'Review';download(preview.csv,label+'_'+preview.format+'.csv');
  }
  d.append(pairArea,actions(build,save,heldSave,checkHold,button('閉じる',()=>d.close())),warnings,content);pairControls();
 }
 refresh().catch(e=>tell('Review Workspaceを読み込めません: '+e.message));
 return Object.freeze({bind,wrapValue,attachOutcome,attachStudy,attachResultSet,releaseCurrent,readFinalRow,watchFinal:subscribe,viewed,preferredSnapshot:pdfId=>opened?.studyId===pdfId?opened.snapshot:null,openRecord:showRecord,
  snapshot:()=>current?structuredClone(current):null,selectedProject:()=>{const project=records.find(r=>r.project.id===projectId)?.project;return project?structuredClone(project):null;},ready:()=>ready&&!busy,all:()=>store.all(),whenIdle:()=>chain,mappingDecisions:context=>window.DataExICO.learned(records,context)});
};
