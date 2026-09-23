/* Post-extraction review controls. No additional intake rules or AI calls. */
window.createDataExReview=function({openSaved,choosePdf,getContext,onProjectChange,onProjectRename,onProjectClear,onSwitchStart,getTraceEvidence,reconnectDocuments,hideWorkflowPdf,captureView,restoreView}){
 const D=window.DataExDecision,store=window.DataExReviewStore;
 const catalog=window.DataExReviewProjects;
 const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!=null)n.textContent=String(text);if(cls)n.className=cls;return n;};
 const button=(text,fn,cls)=>{const n=el('button',text,cls);n.type='button';n.dataexRun=fn;n.addEventListener('click',()=>Promise.resolve().then(fn).catch(e=>tell(e.message)));return n;};
 const labels={CANDIDATE:'AI候補',REVIEWED:'原著表示済',ACCEPTED:'採用',EDITED:'修正済',EXCLUDED:'除外',HOLD:'保留',DRAFT:'未確定',PARTIALLY_CONFIRMED:'一部確認',CONFIRMED:'確定済',LOCKED:'ロック'};
 const host=el('section',null,'review-workspace');host.id='review-workspace';document.querySelector('.fuzzy-intro').after(host);
 const notice=el('p',null,'decision-message');notice.id='decision-message';notice.setAttribute('role','status');host.after(notice);
 const basketHost=el('aside',null,'accepted-data-tray');basketHost.id='accepted-data-tray';host.before(basketHost);
 let current=null,activeId=null,opened=null,ready=false,busy=false,loaded=false,listeners=new Set(),records=[],projectId=null,token=0,chain=Promise.resolve();
 const drafts=new Map(),sourceButtons=new Map();
 let saveFailure='',lastDraftEditor=null,viewToken=0;
 let projects=[],bindWork=Promise.resolve(),transition=Promise.resolve(),switching=false;
 const projectName=p=>p.id==='default'?'':p.label;
 const selectedProject=()=>{const p=projects.find(p=>p.id===projectId)||records.find(r=>r.project.id===projectId)?.project;return p?structuredClone({id:p.id,label:p.label}):null;};
 const projectForContext=context=>{const p=selectedProject();return p&&projectName(p)===(context.reviewName||'').trim()?p:D.projectFor(context);};
 const projectOptions=()=>[...new Map([...projects.map(p=>[p.id,p.label]),...records.map(r=>[r.project.id,r.project.label])]).entries()];
 async function initialize(){
  records=await store.all();records.sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));
  for(const r of [...new Map([...records].reverse().map(r=>[r.project.id,r])).values()])await catalog.ensure(r.project,r.snapshot.extractionContext);
  projects=await catalog.all();const context=getContext(),savedId=await catalog.active(),saved=projects.find(p=>p.id===savedId);
  const project=saved&&projectName(saved)===(context.reviewName||'').trim()?saved:projects.find(p=>projectName(p)===(context.reviewName||'').trim())||D.projectFor(context);
  await catalog.ensure(project,context);projectId=project.id;await catalog.saveContext(projectId,context);await catalog.setActive(projectId);await refresh();
 }
 function saveContext(context){
  const value=structuredClone(context),target=projectForContext(value);
  if(target.id!==selectedProject()?.id)return Promise.resolve();
  const work=async()=>{await startup;await catalog.ensure(target,value);await catalog.saveContext(target.id,value);};
  const result=chain.then(work);chain=result.catch(e=>tell('レビュー条件を保存できません: '+e.message));return result;
 }
 async function activateProject(project,context){
  projects=await catalog.all();projectId=project.id;await catalog.setActive(projectId);await onProjectChange(project,context);tell('');await refresh();
 }
 async function switchProject(id){
  await startup;await chain;await bindWork;
  const project=await catalog.get(id);if(!project)throw Error('レビューが見つかりません。');
  if(await releaseCurrent()===false)return false;
  await activateProject(project,project.context);
  const flow=window.DataExOutcomeWorkflow.catalog(records,id),recent=records.find(r=>r.id===flow.session.recordId&&r.project.id===id)||records.find(r=>r.project.id===id);if(recent)await showRecord(recent);
  return true;
 }
 async function addProject(label){
  await startup;await chain;await bindWork;
  const name=label.trim();if(!name||name.length>500)throw Error('新しいReview名を入力してください（500文字以内）。');
  if((await catalog.all()).some(p=>p.label===name))throw Error('同じ名前のレビューがあります。保存先レビューから選択してください。');
  if(await releaseCurrent()===false)return null;
  const project=await catalog.create(name);await activateProject(project,project.context);return selectedProject();
 }
 function changeProject(task){
  if(switching)return Promise.reject(Error('レビューを切り替えています。完了後に操作してください。'));
  switching=true;onSwitchStart?.();
  transition=(async()=>{try{return await task();}finally{switching=false;renderWorkspace();}})();return transition;
 }
 const selectProject=id=>changeProject(()=>switchProject(id)),createProject=label=>changeProject(()=>addProject(label));
 function finalRow(record,row){const result=structuredClone(row),p=record.points[row.id];if(p?.decision.finalValue){for(const key of D.numeric)result.statistics[key==='effect'?'estimate':key]=p.decision.finalValue[key]??null;for(const key of ['timepoint','population','armId','comparatorArmId','resultType','adjustment'])if(p.decision.finalValue[key]!==undefined)result[key]=p.decision.finalValue[key];if(p.decision.finalValue.ciLevel!==undefined)result.statistics.ciLevel=p.decision.finalValue.ciLevel;result.effectMeasure=p.decision.finalValue.effectType;result.finalSourceAnchor=p.decision.editedFields.includes('sourceAnchor')?p.decision.finalValue.sourceAnchor:undefined;result.humanDecisionStatus=p.decision.status;}return result;}
 function cacheDerived(record){
  const paper=window.DataExPaperModel;if(!paper?.classify)return record;const outcomes=new Map(record.snapshot.raw.outcomes.map(o=>[o.id,o]));
  record.effectClassifications={};
  record.derivedCandidates=record.snapshot.raw.rawValues.flatMap(row=>{const input=finalRow(record,row),info=paper.classify(input,outcomes.get(row.outcomeId),record.snapshot.raw),derived=info.derivedCandidates||[];if(info.effectClassification)record.effectClassifications[row.id]=structuredClone(info.effectClassification);return (Array.isArray(derived)?derived:[derived]).map((candidate,i)=>({...structuredClone(candidate),id:'derived:'+row.id+':'+i,rawId:row.id,status:'PROPOSED',readiness:info.readiness,basis:record.points[row.id]?.decision.finalValue?'HUMAN_FINAL':'AI_RAW',basisRevision:record.revision,baseStatistics:structuredClone(input.statistics),rawInputs:structuredClone(row.statistics),sourceRefs:structuredClone(row.sourceRefs)}));});
  record.derivedCandidateVersion=paper.VERSION||'v5';return record;
 }
 function tell(text){notice.textContent=text;}
 function subscribe(fn){listeners.add(fn);fn();}function notify(){for(const fn of listeners)fn();window.dispatchEvent(new Event('dataex-review-state-changed'));}
 function modal(title){const d=el('dialog',null,'decision-dialog'),h=el('h2',title);h.id='decision-title-'+crypto.randomUUID();d.setAttribute('aria-labelledby',h.id);d.append(h);document.body.append(d);d.addEventListener('close',()=>d.remove());d.showModal();return d;}
 function actions(...nodes){const a=el('div',null,'decision-actions');a.append(...nodes);return a;}
 function field(parent,label,value,type='text'){const l=el('label',label),n=el('input');n.type=type;n.value=value??'';if(type==='number')n.step='any';l.append(n);parent.append(l);return n;}
 function select(parent,label,options,value){const l=el('label',label),n=el('select');for(const [v,text] of options){const opt=el('option',text);opt.value=v;n.append(opt);}n.value=value;n.setAttribute('aria-label',label);l.append(n);parent.append(l);return n;}
 const exportPending=()=>({busy,drafts:drafts.size,error:saveFailure});
 async function download(text,name){const host=document.querySelector('dialog[open]')||document.body;const message=await window.DataExCSVTraceUI.download(text,name,host);tell(message);}
 const disabled=()=>!ready||busy||current?.status==='LOCKED';
 async function refresh(){[records,projects]=await Promise.all([store.all(),catalog.all()]);records.sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));renderWorkspace();renderBasket();window.dispatchEvent(new Event('dataex-work-changed'));}
 async function run(action){
  if(!(action.type==="POINT"&&action.status==="REVIEWED"))action={operationId:crypto.randomUUID(),expectedRevision:current?.revision,...action};
  const id=activeId;
  const work=async()=>{
   if(!ready||current?.id!==id)throw Error('保存データの読込後に操作してください。');
   busy=true;saveFailure='';notify();
   try{const reuse=action.workflow&&window.DataExOutcomeWorkflow.reusable(current,current.resultSets?.[action.resultSet?.id],D,window.DataExCSVTrace);const next=reuse?structuredClone(current):D.apply(current,action);if(!action.workflow&&next.revision===current.revision)return true;if(!reuse)cacheDerived(next);let committed;
    if(action.workflow){if(next.verification)next.verification.savedRevision=next.revision;if(next.csvTrace)next.csvTrace.savedRevision=next.revision;const result=await store.commitWorkflow({...action.workflow,recordId:id,expectedRevision:current.revision,candidateId:action.resultSet.id,expectedContent:store.recordContent(current),binding:{...action.workflow.binding,...(action.traceEvidence?.document?.sha256?{documentHash:action.traceEvidence.document.sha256}:{})}},next,()=>{if(activeId!==id||drafts.size)throw Error('研究切替または未保存編集があるため保存を中断しました。');});committed=result.records.find(r=>r.id===id)||next;}
    else committed=await store.put(next,current.revision,store.recordContent(current));
    if(activeId===id){current=committed;opened=opened?.id===id?committed:opened;tell('判断をこのブラウザに保存しました。');notify();}await refresh();return true;}
   catch(e){saveFailure=e.message;throw e;}
   finally{busy=false;notify();}
  };
  const result=chain.then(work);chain=result.catch(()=>{});return result;
 }
 function workflow(command){
  const work=async()=>{await startup;if(busy||(drafts.size&&command.type!=='REVIEWER'))throw Error('未保存の編集を保存またはキャンセルしてください。');busy=true;saveFailure='';notify();try{const result=await store.commitWorkflow(command);const saved=result.records.find(r=>r.id===activeId);if(saved){current=saved;if(opened?.id===saved.id)opened=saved;}await refresh();return result.catalog;}catch(e){saveFailure=e.message;throw e;}finally{busy=false;notify();}};
  const result=chain.then(work);chain=result.catch(()=>{});return result;
 }
 function bind(study,context,isLoaded,studyProject){
  loaded=isLoaded;listeners.clear();
  if(loaded&&notice.textContent.includes('原著PDFを再選択してください。'))tell('保存した内容を表示しています。原著PDFは接続済みです。');
  const project=studyProject||(opened&&opened.extractionId===study.raw.requestId&&opened.studyId===study.raw.pdfId?opened.project:projectForContext(context));
  const version=opened?.project.id===project.id&&opened.extractionId===study.raw.requestId&&opened.studyId===study.raw.pdfId&&window.DataExJSONImport.stable(opened.snapshot.raw)===window.DataExJSONImport.stable(study.raw);
  const id=version?opened.id:D.keyFor(study,project);
  if(activeId===id){notify();return;}
  drafts.clear();sourceButtons.clear();document.querySelectorAll('.decision-dialog[data-derived-set],.decision-dialog[data-point-id],.decision-dialog[data-confirm-outcome],.decision-dialog[data-result-set-conflict]').forEach(d=>d.close());
  activeId=id;ready=false;const generation=++token;current=cacheDerived(D.make({...structuredClone(study),extractionContext:structuredClone(context)},project));projectId=project.id;
  current.id=id;const draft=current;
  bindWork=(async()=>{await startup;if(generation!==token)return;await catalog.ensure(project,context);if(generation!==token)return;await catalog.setActive(project.id);let saved=await store.get(id);if(!saved){await store.put(draft,-1);saved=draft;}else if((!saved.derivedCandidates||saved.derivedCandidateVersion!==window.DataExPaperModel?.VERSION)&&window.DataExPaperModel){const revision=saved.revision;cacheDerived(saved);saved.revision++;saved.updatedAt=new Date().toISOString();saved.history.push({at:saved.updatedAt,action:'DERIVED_CANDIDATE_CACHE',target:null,note:'変換候補のみを保存。自動採用なし。',changes:[]});saved=await store.put(saved,revision);}D.assertRecord(saved);if(generation!==token)return;current=saved;ready=true;notify();await refresh();})().catch(e=>{if(generation===token){ready=false;tell('Review Workspaceへ保存できません: '+e.message);notify();}});
 }
 async function commitImported(study,context,project,options){
  await startup;await chain;await transition;await bindWork;
  if(drafts.size||busy||switching)throw Error('未保存の修正または処理があります。保存・完了後にJSONを読み込み直してください。');
  options.guard();busy=true;notify();let saved;
  try{
   const record=cacheDerived(D.make({...structuredClone(study),extractionContext:structuredClone(context)},project));
   D.assertRecord(record);
   saved=await store.commitImport(record,options);
  }finally{busy=false;if(!saved)notify();}
  // No visible/current state is changed until the single IndexedDB transaction completes.
  ++token;opened=saved;current=saved;activeId=saved.id;projectId=project.id;ready=true;
  drafts.clear();sourceButtons.clear();listeners.clear();
  records=[saved,...records.filter(r=>r.id!==saved.id)];
  try{renderWorkspace();renderBasket();}catch(_){tell('登録済みです。Review Workspaceを開き直すと表示を復元できます。');}
  return saved;
 }
 async function showRecord(record){const viewGeneration=++viewToken;if(!await settleDrafts())return false;if(activeId&&current&&captureView)await store.saveView(projectId,activeId,{...captureView(),candidateId:window.DataExOutcomeWorkflow.catalog(await store.all(),projectId).session.candidateId});const generation=++token,previousId=activeId;activeId=null;ready=false;notify();try{record=await store.get(record.id)||record;if(generation!==token)return;if(projectId!==record.project.id){onSwitchStart?.();const project=await catalog.get(record.project.id)||await catalog.ensure(record.project,record.snapshot.extractionContext);await activateProject(project,project.context);if(generation!==token)return;}const allRecords=await store.all(),flow=window.DataExOutcomeWorkflow?.catalog(allRecords,record.project.id);if(flow&&flow.session.recordId!==record.id){const result=await store.commitWorkflow({type:'SESSION',reviewId:record.project.id,expectedCatalogRevision:flow.revision,operationId:crypto.randomUUID(),session:{recordId:record.id,candidateId:flow.recordViews?.[record.id]?.candidateId||null}},null,()=>{if(generation!==token)throw Error('別の研究に切り替わりました。');});record=result.records.find(r=>r.id===record.id)||record;}if(generation!==token)return;opened=record;projectId=record.project.id;tell('原著を切替中: '+record.snapshot.raw.study.label+'。完了まで前の候補は採用できません。');await openSaved(record);await bindWork;if(viewGeneration!==viewToken||activeId!==record.id||!ready)return;await restoreView?.(flow?.recordViews?.[record.id]);if(viewGeneration!==viewToken||activeId!==record.id)return;tell('保存した確定内容を表示しています。'+(loaded?'':'原著PDFを再選択してください。'));if(!flow?.recordViews?.[record.id])document.querySelector('#results-section').scrollIntoView({block:'start'});}catch(e){if(generation===token){activeId=previousId;ready=!!current;notify();}throw e;}}
 function renderWorkspace(){
  host.replaceChildren();const heading=el('div',null,'decision-heading');heading.append(el('h2','Review Workspace'),button('採用データ＋出典をCSV保存',()=>traceCsvDialog(),'review-trace-csv-open'),button('CSV出力',()=>csvDialog(),'review-csv-open'));host.append(heading);
  const choices=projectOptions();if(!choices.length){host.append(el('p','確認した研究をここへ蓄積できます。','hint'));return;}
  if(!choices.some(([id])=>id===projectId))projectId=choices[0][0];
  const p=select(host,'保存先レビュー',choices,projectId);p.disabled=switching;p.addEventListener('change',()=>{p.disabled=true;selectProject(p.value).catch(e=>tell('レビューを切り替えられません: '+e.message)).finally(()=>renderWorkspace());});
  const scroll=el('div',null,'review-study-list'),table=el('table');table.setAttribute('aria-label','Review Workspaceの研究');
  const head=el('tr');['Study','確定Outcome','保留値','状態'].forEach(s=>head.append(el('th',s)));table.append(head);
  for(const r of records.filter(r=>r.project.id===projectId)){
   const tr=el('tr');tr.dataset.recordId=r.id;const name=el('td'),b=button(r.snapshot.raw.study.label.split(/\s+[—–]\s+/)[0],()=>showRecord(r));b.title='結果を見る / '+r.snapshot.pdf.filename;name.append(b);
   if(r.registration)name.append(el('small',' JSON登録 · version '+r.registration.version));
   if(r.importHistory?.length)name.append(button('置換前の履歴JSONを保存',()=>{const url=URL.createObjectURL(new Blob([JSON.stringify(r.importHistory,null,2)],{type:'application/json;charset=utf-8'})),a=el('a');a.href=url;a.download='DataEx-replaced-history.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}));
   const c=D.counts(r);tr.append(name,el('td',c.confirmed),el('td',c.hold),el('td',labels[r.status]));table.append(tr);
  }scroll.append(table);host.append(scroll);
  const recent=records.find(r=>r.project.id===projectId);if(recent)host.append(actions(button('前回の結果を見る',()=>showRecord(recent)),button('PDFを再接続',async()=>{await showRecord(recent);choosePdf();})));else host.append(el('p','このレビューにはまだ研究がありません。PDFを選択して開始してください。','hint'));
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
  const capture=()=>{lastDraftEditor=d;if(activeId!==recordId)throw Error('研究が切り替わりました。');const patch={};for(const [k,n] of Object.entries(fields))patch[k]=k==='unit'?n.value:n.validity.badInput?NaN:n.value.trim()===''?null:Number(n.value);patch.reviewerNote=area.value;const dirty=Object.entries(patch).some(([k,v])=>v!==initial[k]);if(dirty)drafts.set(id,patch);else drafts.delete(id);return patch;};
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
  subscribe(()=>{const p=current?.points[row.raw.id];if(!p)return;wrap.dataset.decisionStatus=p.decision.status;const edited=!!p.decision.finalValue&&(D.numeric.some(key=>p.decision.finalValue[key]!==p.raw[key])||p.decision.finalValue.unit!==p.raw.unit);badge.textContent=edited?'修正済':'Raw';badge.hidden=false;
   b.textContent=p.decision.finalValue?displayed(p):originalDisplay;b.title=originalTitle+'\nAI値: '+originalDisplay+'\nFinal値: '+(p.decision.finalValue?displayed(p):'未設定')+'\nセルの状態: '+badge.textContent+'\nセルの判断履歴: '+labels[p.decision.status];badge.title=b.title;b.setAttribute('aria-label',b.textContent+' — '+p.raw.arm+', '+p.raw.timepoint+'の原著');
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

 function conflictWarnings(parent,conflicts){
  if(!conflicts.length)return;
  const box=el('div',null,'result-set-conflict-warning');box.setAttribute('role','status');
  const seen=new Set();for(const conflict of conflicts){const key=conflict.code+'|'+conflict.message;if(seen.has(key))continue;seen.add(key);const p=el('p',conflict.message);p.dataset.warningCode=conflict.code;box.append(p);}
  box.append(el('p','未解決の比較は通常のpairwise CSVへ同時出力できません。Raw・候補・判断履歴は保持しています。','hint'));parent.append(box);
 }
 function declarationVersion(record,set){return JSON.stringify({candidateId:set.id,points:set.pointIds.map(id=>({id,raw:record.points[id]?.raw,finalValue:record.points[id]?.decision.finalValue})),sources:record.snapshot.raw.sources,pdf:record.snapshot.pdf,trace:record.csvTrace});}
 function declarationState(set){if(!current||!set)return null;const c=window.DataExOutcomeWorkflow.catalog(records,projectId),entry=c.humanDeclarations?.[JSON.stringify([current.id,set.id])];return entry?{...entry,current:entry.version===declarationVersion(current,set)}:null;}
 async function declareCurrent(set,actor,cancel=false){await whenIdle();if(drafts.size||busy||switching||!current)throw Error('未保存編集を保存またはキャンセルしてください。');const original=structuredClone(current),pid=projectId,id=activeId,all=await store.all(),c=window.DataExOutcomeWorkflow.catalog(all,pid),revision=c.revision,key=JSON.stringify([id,set.id]);const entry={id:crypto.randomUUID(),recordId:id,candidateId:set.id,version:declarationVersion(original,set),actor,at:new Date().toISOString(),method:'確認・採用ボタンによる本人の表明（外部アプリ・紙の原著確認を含む）',status:cancel?'CANCELLED':'CONFIRMED',exportPermission:false};(c.humanDeclarations||={})[key]=entry;c.history.push({type:cancel?'CANCEL_HUMAN_DECLARATION':'HUMAN_DECLARATION',...entry});c.revision++;await store.commitBatch({reviewId:pid,expectedCatalogRevision:revision,expectedRecords:{[id]:original.revision},expectedContents:{[id]:store.recordContent(original)},records:[],catalog:c,guard:()=>{if(activeId!==id||projectId!==pid||drafts.size||current.revision!==original.revision)throw Error('確認中に研究・版が変わりました。');}});await refresh();notify();return entry;}
 async function acceptResultSet(set,options={}){
  if(options.type==='UX_CONFIRM_ADOPT'&&options.confirmationMethod===window.DataExConfirmation.BUTTON_METHOD)options={...options,humanReview:{policy:'HUMAN-APPROVAL-CSV-2.0',method:'DataExまたは他のアプリ・紙の原著で確認'}};
  if(options.type==='UX_CONFIRM_ADOPT'&&!options.traceActor?.trim()){const actor=await ensureReviewer();if(!actor)return false;options={...options,traceActor:actor};}
  await chain;if(disabled())return false;
  const recordId=activeId,conflicts=D.resultSetConflicts(current,set),action={type:'RESULT_SET',resultSet:set,status:'ACCEPTED',...options};
  if(action.workflow&&window.DataExOutcomeWorkflow.reusable(current,current.resultSets?.[set.id],D,window.DataExCSVTrace))return run(action);
  if(action.type==='UX_CONFIRM_ADOPT'&&getTraceEvidence){
       action.traceEvidence=await getTraceEvidence(current,action.resultSet);
   if(activeId!==recordId||current.revision!==action.expectedRevision)throw Error('研究または保存版が変わりました。現在の候補を確認して採用し直してください。');
   action.traceSelectionReason=action.traceSelectionReason||'表示中の候補を原著確認・採用ボタンで明示的に選択';
  }
  const commitAction=a=>a.type==='UX_CONFIRM_ADOPT'&&!a.workflow?confirmBatch([set],a.traceActor,{...a,resultSet:undefined}):run(a);
  if(!conflicts.length)return commitAction(action);
  return new Promise(resolve=>{
   const d=modal('採用するResult setを確認');d.dataset.resultSetConflict=set.id;const controls=[];
   conflictWarnings(d,conflicts);d.append(el('p','今回の候補: '+[set.label,D.comparisonLabel(set),set.timepoint,set.resultType].filter(Boolean).join(' / ')));
   const conflictingSetIds=[...new Set(conflicts.flatMap(c=>c.conflictingSetIds))],list=el('ul',null,'result-set-conflict-existing');
   for(const id of conflictingSetIds){const existing=current.resultSets[id];if(existing)list.append(el('li',[existing.label,D.comparisonLabel(existing),existing.timepoint,existing.resultType].filter(Boolean).join(' / ')));}d.append(el('p','すでに採用済みの候補'),list);
   const shared=conflicts.some(c=>c.code==='SHARED_CONTROL'),alternative=conflicts.some(c=>c.code==='ALTERNATIVE_RESULT_TYPE');
   const replacement=shared?(alternative?'既存の採用データをこちらへ置き換える':'既存比較を外してこちらを採用'):set.resultType==='change'?'既存EndpointをChangeへ置き換える':'既存ChangeをEndpointへ置き換える';
   const keep=alternative?'両方を候補として保持するが、同一pairwise解析へ同時出力しない':'両方保持して後で処理';
   d.append(el('p','置き換える場合、既存候補は保留として履歴に残します。対照群の自動分割・群統合は行いません。','hint'));
   const error=el('p',null,'decision-message');error.setAttribute('role','status');d.append(error);
   let submitting=false;
   const choose=async mode=>{if(submitting)return;submitting=true;controls.forEach(b=>b.disabled=true);try{if(activeId!==recordId)throw Error('研究が切り替わりました。');await commitAction({...action,conflictResolution:{mode,conflictingSetIds}});resolve(true);d.close();}catch(e){error.textContent=e.message;}finally{submitting=false;controls.forEach(b=>b.disabled=false);}};
   for(const [mode,label] of [['REPLACE',replacement],['KEEP_BOTH',keep]]){const b=button(label,()=>choose(mode));b.dataset.conflictResolution=mode;controls.push(b);}
   const cancel=button('キャンセル',()=>d.close());cancel.dataset.conflictResolution='CANCEL';controls.push(cancel);d.append(actions(...controls));d.addEventListener('close',()=>resolve(false),{once:true});
  });
 }
 function attachResultSet(parent,spec){
  const set=structuredClone(spec),section=el('section',null,'result-set-decisions'),status=el('p',null,'result-set-status');section.dataset.resultSetId=set.id;
  const accept=button('✓ このデータを採用',()=>acceptResultSet(set),'decision-primary');accept.dataset.resultSetAction='accept';
  const edit=button('✎ 修正',()=>editResultSet(set));edit.dataset.resultSetAction='edit';
  const hold=button('保留',()=>run({type:'RESULT_SET',resultSet:set,status:'HOLD'}));hold.dataset.resultSetAction='hold';
  const reject=button('使わない',()=>run({type:'RESULT_SET',resultSet:set,status:'EXCLUDED'}));reject.dataset.resultSetAction='exclude';
  const convert=button('換算候補を確認',()=>confirmDerivedSet(set));convert.dataset.resultSetAction='derive';
  const giv=el('section',null,'paper-giv-summary'),givValues=el('div',null,'paper-giv-values');
  const givAccept=button('このGIVデータを採用',()=>{const candidates=eligibleDerived(set).filter(c=>c.kind==='EFFECT_CI');if(!candidates.length)return;return acceptResultSet(set,{useDerived:true,derivedCandidateIds:candidates.map(c=>c.id)});},'decision-primary');givAccept.dataset.resultSetAction='giv-accept';
  const givActions=actions(givAccept);giv.append(givValues,givActions);section.append(giv);
  section.append(status,el('p',D.comparisonLabel(set),'result-set-comparison'),actions(accept,edit,hold,reject,convert),el('p',set.timepoint+' · Result type: '+set.resultType+' · この比較だけを採用','result-set-scope'));parent.append(section);
  const ordinaryActions=accept.parentElement;
  subscribe(()=>{const saved=current?.resultSets?.[set.id],candidates=eligibleDerived(set),candidate=candidates.find(c=>c.kind==='EFFECT_CI');status.textContent=saved?.status==='ACCEPTED'?'採用済み'+(saved.acceptedDerived?.length?'（換算値）':''):saved?.status==='EDITED_DRAFT'?'未採用 · 修正済み — 原著確認後に「採用」してください':saved?.status==='HOLD'?'保留':saved?.status==='EXCLUDED'?'使わない':'未採用';section.dataset.resultSetStatus=saved?.status||'CANDIDATE';[accept,edit,hold,reject,convert,givAccept].forEach(b=>b.disabled=disabled()||!set.pointIds?.length);accept.disabled=accept.disabled||saved?.status==='ACCEPTED';convert.hidden=!candidates.length;
   giv.hidden=!candidate;accept.hidden=!!candidate;givValues.replaceChildren();
   if(candidate){const v=candidate.statistics,input=candidate.baseStatistics||candidate.rawInputs||{},number=n=>n==null?'未報告':String(n).replace(/^-/, '−');giv.dataset.derivedRawId=candidate.rawId;
    givValues.append(el('p',candidate.effectType==='adjusted mean difference'?'調整済み群間差':'群間差','paper-giv-label'),el('p','Effect = '+number(v.estimate)),el('p',(candidate.inputs?.ciLevel===.95?95:candidate.inputs?.ciLevel||95)+'% CI = '+number(input.ciLow)+' ～ '+number(input.ciHigh)),el('strong','Derived SE = '+v.se.toFixed(3),'paper-giv-se'),el('strong','Generic inverse varianceで使用可能','paper-giv-usage'),el('p','Comparison direction = '+(candidate.comparisonDirection||'原著で要確認').replace(/\bminus\b/gi,'−')));
    givAccept.disabled=givAccept.disabled||saved?.status==='ACCEPTED'&&!!saved.acceptedDerived?.length;convert.textContent='計算詳細';givActions.append(convert);
   }else{convert.textContent='換算候補を確認';ordinaryActions.append(convert);}
  });return section;
 }
 function eligibleDerived(set){return set.pointIds.length===1?(current?.derivedCandidates||[]).filter(d=>d.readiness==='CONVERTIBLE'&&set.pointIds.includes(d.rawId)&&['LOG_RATIO_CI','LOG_RATIO','EFFECT_CI'].includes(d.kind)):[];}
 function confirmDerivedSet(set){const recordId=activeId,candidates=eligibleDerived(set);if(!candidates.length)return;const d=modal('換算値の前提を確認');d.dataset.derivedSet=set.id;d.append(el('p','原著の効果量・CIをRawに保持します。換算値はDerivedとして採用し、GIVで使用します。'));for(const candidate of candidates){d.append(el('h3',candidate.kind),el('pre',JSON.stringify({...window.DataExPaperModel.derivedPreview(candidate),derived:candidate.statistics},null,2)));for(const assumption of candidate.assumptions||[])d.append(el('p','・'+assumption));const source=button('原著を見る',()=>{d.close();sourceButtons.get(candidate.rawId)?.click();});source.disabled=!loaded||!sourceButtons.has(candidate.rawId);d.append(source);}d.append(actions(button('この換算値を採用',async()=>{if(activeId!==recordId)throw Error('研究が切り替わりました。');const accepted=await acceptResultSet(set,{useDerived:true,derivedCandidateIds:candidates.map(c=>c.id)});if(accepted)d.close();}),button('戻る',()=>d.close())));}

 async function editNumericValue(spec,selection){
  if(disabled())return;
  const T=window.DataExCSVTrace,UI=window.DataExCSVTraceUI,record=structuredClone(current),recordId=activeId,revision=record.revision;
  const editorEvidence=await getTraceEvidence(record,spec);if(activeId!==recordId||current.revision!==revision)throw Error('研究または保存版が変わりました。数値から開き直してください。');
  const options=UI.fieldOptions(record,spec),initialKey=UI.initialField(options,spec,selection);
  if(selection?.pointId&&!options.some(o=>o.key===initialKey&&o.pointId===selection.pointId&&o.field===selection.field))throw Error('編集対象が変わりました。数値から開き直してください。');
  const d=modal('数値を修正');d.classList.add('numeric-edit-dialog');d.dataset.resultSetEdit=spec.id;
  d.append(el('p','Rawは保持します。保存後は原著の再確認・再採用が必要です。'));
  const choice=select(d,'修正する数値',options.map(o=>[o.key,o.label+(spec.pointIds.length>1?' — '+o.context:'')]),initialKey),content=el('div'),error=el('p',null,'decision-message'),guard=el('div');error.setAttribute('role','status');guard.setAttribute('role','status');d.append(content,error,guard);
  let selected,initial,value,reason,reviewer,reported,quote,sourceDraft,dirty=false,saving=false,activeKey=initialKey;
  function capture(){lastDraftEditor=d;dirty=value.validity.badInput||(value.value.trim()===''?null:Number(value.value))!==initial||reason.value!==''||reported.value!==(sourceDraft.reportedValue||'')||quote.value!==selected.quote; if(dirty)drafts.set('numeric:'+spec.id,{pointId:selected.pointId,field:selected.field});else drafts.delete('numeric:'+spec.id);}
  function paint(){
   activeKey=choice.value;selected=options.find(o=>o.key===activeKey);if(!selected)throw Error('修正対象の値が見つかりません。');
   content.replaceChildren();error.textContent='';guard.replaceChildren();dirty=false;
   const p=record.points[selected.pointId],v=D.value(p);initial=selected.value??null;
   sourceDraft=window.DataExSimpleFlow.editSourceDraft(record,spec,p.id,selected.field,T,editorEvidence);
   const source=(sourceDraft.sources||[]).find(s=>s.role==='value'),segments=source?.quote_segments||[];
   selected={...selected,quote:segments.filter(q=>['cell','text','existing_evidence'].includes(q.role)).map(q=>q.text).join('\n')};
   const target=el('div',null,'numeric-edit-target');target.append(el('strong',selected.label),el('span',`${v.outcome}／${v.arm}／${v.timepoint}`),el('small',`候補ID: ${spec.id} · 値ID: ${p.id} · 群ID: ${v.armId||'未記録'} · 統計量: ${selected.field}`));content.append(target);
   const before=field(content,'現在値',initial);before.readOnly=true;
   value=field(content,'新しい値',initial,'number');value.dataset.pointId=p.id;value.dataset.fieldId=selected.field;
   reason=field(content,'修正理由','');reviewer=field(content,'今回の修正者（氏名・ID）',window.DataExOutcomeWorkflow.catalog(records,projectId).reviewer?.id||'');reviewer.autocomplete='name';
   content.append(el('pre',(sourceDraft.sources||[]).map(s=>[s.document?.title||s.document?.filename||'資料名：未記録',...(s.locations||[]).map(l=>[`PDF p.${l.pdf_page_number??'未記録'}`,l.table,l.row_label,l.column_label,l.section].filter(Boolean).join(' / '))].join('\n')).join('\n')||'この数値専用の出典は未記録です。保存後に「出典を確認・補記」で記録してください。','numeric-edit-source'));
   reported=field(content,'原著表記（この値）',sourceDraft.reportedValue||'');
   const label=el('label','最終値を支持する根拠原文（未取得なら空欄）');quote=el('textarea');quote.value=selected.quote;label.append(quote);content.append(label);
   value.focus();value.select();
  }
  content.addEventListener('input',()=>{if(value)capture();});
  function discardThen(task){
   guard.replaceChildren(el('p','未保存の修正があります。保存するか、明示的に破棄してください。'),actions(button('入力を保持',()=>guard.replaceChildren()),button('未保存の修正を破棄',()=>{drafts.delete('numeric:'+spec.id);dirty=false;task();})));
  }
  choice.addEventListener('change',()=>{const next=choice.value;choice.value=activeKey;if(saving)return;if(dirty)discardThen(()=>{choice.value=next;paint();});else {choice.value=next;paint();}});
  const cancel=()=>{if(saving)return;if(dirty)discardThen(close);else close();};
  function close(){drafts.delete('numeric:'+spec.id);d.close();notify();}
  d.addEventListener('cancel',e=>{e.preventDefault();cancel();});
  d.addEventListener('keydown',e=>{if(e.key==='Enter'){e.stopPropagation();if(!e.isComposing&&e.target.tagName!=='TEXTAREA')e.preventDefault();}});
  const save=button('修正を保存',async()=>{
   if(saving)return;saving=true;save.disabled=true;choice.disabled=true;content.inert=true;
   try{
    if(activeId!==recordId||current.revision!==revision)throw Error('対象の研究または保存内容が更新されました。キャンセルして数値から開き直してください。');
    const number=value.validity.badInput?NaN:value.value.trim()===''?null:Number(value.value);
    if(number===initial){close();return;}
    if(!reason.value.trim())throw Error('修正理由を入力してください。');
    const p=record.points[selected.pointId],v=D.value(p),draft=structuredClone(sourceDraft);draft.reportedValue=reported.value;
    const supporting=draft.sources?.find(s=>s.role==='value');
    if(supporting&&quote.value!==selected.quote){supporting.quote_segments=[...(supporting.quote_segments||[]).filter(q=>!['cell','text','existing_evidence'].includes(q.role)),{role:supporting.locations?.[0]?.table?'cell':'text',text:quote.value,location_index:0,capture_method:'manual_transcription'}];}
    for(const s of draft.sources||[])s.source_confirmation={status:'not_recorded',actor:null,at:null};
    const editActor=reviewer.value.trim()||await ensureReviewer();if(!editActor)return;
    await run({type:'UX_EDIT_VALUE',resultSet:spec,target:{candidateId:spec.id,pointId:p.id,field:selected.field,armId:v.armId,timepoint:v.timepoint,resultType:v.resultType,effectType:v.effectType},value:number,reason:reason.value,sourceDraft:draft,traceActor:editActor,expectedRevision:revision});
    close();tell('修正を保存しました。現在版を原著で確認し「このデータを承認」を押してください。');
   }catch(e){error.textContent=e.message;}
   finally{saving=false;save.disabled=false;choice.disabled=false;content.inert=false;}
  });
  d.append(actions(save,button('キャンセル',cancel)));paint();return d;
 }

 function editResultSet(spec,selection){
  if(selection)return editNumericValue(spec,selection);
  if(disabled())return;const recordId=activeId,d=modal('このデータを修正'),entries=[];d.dataset.resultSetEdit=spec.id;
  const traceEditor=field(d,'今回の修正者（氏名・ID）',reviewer());traceEditor.autocomplete='name';
  d.append(el('p',[spec.label,D.comparisonLabel(spec),spec.timepoint,spec.resultType].filter(Boolean).join(' / ')),el('p','Rawを保持してFinalの修正案を保存します。「採用」するまでCSVには出しません。','hint'));
  for(const id of spec.pointIds){const p=current.points[id];if(!p)continue;const fs=el('fieldset'),fields={},initial={...D.value(p),reviewerNote:p.decision.reviewerNote},editing=drafts.get(id)||initial;fs.append(el('legend',p.raw.arm||p.raw.outcome));
   const keys=p.raw.comparatorArmId||p.raw.resultType==='effect'||(p.raw.effect!=null&&p.raw.mean==null)?['effect','se','ciLow','ciHigh','n']:p.raw.dataType==='binary'?['events','total','n']:['mean','sd','n','se','ciLow','ciHigh'];
   const grid=el('div',null,'decision-edit-comparison');grid.append(el('strong','項目'),el('strong','AI候補（Raw）'),el('strong','Final'));
   for(const key of [...keys,'unit']){grid.append(el('span',key),el('span',p.raw[key]??'—','decision-ai-value'));fields[key]=field(grid,key,editing[key],key==='unit'?'text':'number');fields[key].dataset.pointField=id+':'+key;fields[key].parentElement.className='decision-final-input';}
   fs.append(grid);const meta=el('details');meta.append(el('summary','群・時点・解析集団・効果型・原著位置の修正'));const metadata={};for(const key of ['timepoint','population','effectType','adjustment'])metadata[key]=field(meta,key,editing[key]??p.raw[key]);for(const key of ['armId','comparatorArmId'])metadata[key]=select(meta,key,[['','指定なし'],...current.snapshot.raw.study.arms.map(a=>[a.id,a.label])],editing[key]||'');metadata.resultType=select(meta,'Result type',['endpoint','change','event','effect','other'].map(v=>[v,v]),editing.resultType);metadata.page=field(meta,'手動確認のPDFページ',editing.sourceAnchor?.pdfPage,'number');metadata.sourceNote=field(meta,'手動位置の注記',editing.sourceAnchor?.manualNote||'');fs.append(meta);const note=field(fs,'修正理由',editing.reviewerNote);const source=button('原著を見る',()=>{capture();d.close();sourceButtons.get(id)?.click();});source.disabled=!loaded||!sourceButtons.has(id);fs.append(source);d.append(fs);entries.push({id,fields,note,initial,metadata});
  }
  const error=el('p',null,'decision-message');error.setAttribute('role','status');d.append(error);
  const same=(a,b)=>a===b||(a==null&&b==null);
  function capture(){lastDraftEditor=d;if(activeId!==recordId)throw Error('研究が切り替わりました。');return entries.map(({id,fields,note,initial})=>{const patch={};for(const [key,input] of Object.entries(fields)){const value=key==='unit'?input.value:input.validity.badInput?NaN:input.value.trim()===''?null:Number(input.value);if(!same(value,initial[key]))patch[key]=value;}if(Object.keys(patch).length){patch.reviewerNote=note.value;drafts.set(id,patch);}else drafts.delete(id);return {id,patch};});}
  d.addEventListener('input',()=>{try{capture();}catch(e){error.textContent=e.message;}});
  const cancel=()=>{entries.forEach(e=>drafts.delete(e.id));d.close();};d.addEventListener('cancel',e=>{e.preventDefault();cancel();});
  d.append(actions(button('修正を保存',async()=>{try{const edits=capture(),metadataEdits=entries.map(({id,metadata,note,initial})=>{const patch={};for(const [key,input] of Object.entries(metadata)){if(['page','sourceNote'].includes(key))continue;const value=['armId','comparatorArmId'].includes(key)?input.value||null:input.value;if(!same(value,initial[key]))patch[key]=value;}const pageText=metadata.page.value.trim(),page=pageText===''?null:Number(pageText),anchor=initial.sourceAnchor||null,oldPage=anchor?.pdfPage??null,sourceNote=metadata.sourceNote.value,oldNote=anchor?.manualNote||'';if(!same(page,oldPage)||sourceNote!==oldNote)patch.sourceAnchor={...(anchor||{}),pdfId:current.studyId,pdfPage:page,row:'',column:'',sourceText:'',valueText:'',label:'手動確認位置',manualNote:sourceNote};const valueEdit=edits.find(e=>e.id===id);if((Object.keys(valueEdit?.patch||{}).length||Object.keys(patch).length)&&!note.value.trim())throw Error((current.points[id]?.raw.arm||current.points[id]?.raw.outcome||id)+'：変更した群・項目の修正理由を記録してください。');return {id,patch};});const changed=edits.some(e=>Object.keys(e.patch).length)||metadataEdits.some(e=>Object.keys(e.patch).length);if(!changed){error.textContent='変更はありません。値・群・時点・原著位置を変更した場合だけ保存します。';return;}await run({type:'RESULT_SET',resultSet:spec,status:'EDITED_DRAFT',edits,metadataEdits,traceActor:traceEditor.value});entries.forEach(e=>drafts.delete(e.id));d.close();tell('修正案を保存しました。自動採用はしていません。原著を確認し「このデータを採用」を押してください。');}catch(e){error.textContent=e.message;}}),button('キャンセル',cancel)));
 }
 function renderBasket(){
  const items=D.basket(records,projectId);basketHost.replaceChildren();const count=el('strong','採用済みデータ '+items.length+'件');count.id='accepted-data-count';
  const legacy=el('details');legacy.append(el('summary','詳細・互換用CSV'),button('採用一覧',basketDialog),button('従来の出典付きCSV',traceCsvDialog),button('従来の解析用CSV',basketCsvDialog));basketHost.append(count,button('CSVプレビュー',()=>window.DataExSimpleFlowUI.preview(api),'accepted-data-open'),legacy);
  if(projectId){const label=selectedProject()?.label;if(label){const note=el('span',label,'accepted-data-review');note.title=label;basketHost.append(note);}}
  conflictWarnings(basketHost,D.basketConflicts(records,projectId));
 }
 async function basketDialog(){
  await refresh();const d=modal('採用済みデータ'),items=D.basket(records,projectId),table=el('table'),head=el('tr');table.className='accepted-data-table';['Study','Comparison','Outcome','Time / Type','Data'].forEach(t=>head.append(el('th',t)));table.append(head);
  for(const {record:r,set} of items){const tr=el('tr');tr.dataset.acceptedSet=set.id;const name=el('td');name.append(button(r.snapshot.raw.study.label,async()=>{d.close();await showRecord(r);}));tr.append(name,el('td',D.comparisonLabel(set)),el('td',r.outcomes[set.outcomeId]?.canonicalLabel||set.label),el('td',set.timepoint+' / '+set.resultType),el('td',set.pointIds.map(id=>{const p=r.points[id],v=set.acceptedValues[id];const derived=set.acceptedDerived?.find(d=>d.rawId===id);return derived?'GIV · Effect='+derived.statistics.estimate+' · SE='+derived.statistics.se.toFixed(3)+' · '+(derived.comparisonDirection||'方向は原著参照'):(v.arm||'')+': '+displayed({...p,decision:{...p.decision,finalValue:v}});}).join(' vs ')));table.append(tr);}
  conflictWarnings(d,D.basketConflicts(records,projectId));
  const wrap=el('div',null,'decision-csv-preview');wrap.append(table);d.append(el('p',items.length+'件。修正案・保留・未採用候補は含みません。'),wrap,actions(button('CSVプレビュー',()=>{d.close();return basketCsvDialog();}),button('閉じる',()=>d.close())));
 }
 async function copyText(text,area){
  try{if(!navigator.clipboard?.writeText)throw Error('Clipboard API unavailable');await navigator.clipboard.writeText(text);return;}
  catch(_){const original=area.value;area.value=text;area.focus();area.select();area.setSelectionRange(0,text.length);let ok=false;try{ok=document.execCommand('copy');}finally{if(ok)area.value=original;}if(!ok){area.className='accepted-csv-text';area.style.cssText='';area.focus();area.select();throw Error('自動コピーできません。全文を選択してCtrl+Cでコピーしてください。');}}
 }
 async function basketCsvDialog(){
  await refresh();const d=modal('解析用CSV（数値列）'),filters=el('div',null,'decision-export-filters'),projects=projectOptions();d.dataset.basketCsv='true';d.append(el('p','解析用：イベント数・人数・平均値などはそれぞれ独立した数値列です。出典の長文・JSONは入りません。Excelへの貼り付けは「TSVをコピー」を使います。出典は別の「採用データ＋出典をCSV保存」で保存してください。','hint'));
  const project=select(filters,'Review',projects,projectId||projects[0]?.[0]||''),format=select(filters,'形式',[['master','Master long format'],['continuous','Continuous pairwise'],['binary','Binary pairwise'],['giv','Generic inverse variance']],window.DataExCSVTraceUI?.preferredFormat(records,D,projectId)||'master');
  const warning=el('div',null,'decision-csv-warnings'),count=el('p'),table=el('div'),rawFold=el('details'),previewText=el('pre',null,'accepted-csv-text'),area=el('textarea',null,'accepted-csv-fallback');previewText.setAttribute('aria-label','CSV全文プレビュー');previewText.tabIndex=0;area.readOnly=true;area.rows=12;area.tabIndex=-1;area.style.cssText='position:absolute;opacity:0;width:1px;height:1px;pointer-events:none';area.setAttribute('aria-label','CSV手動コピー用');warning.setAttribute('role','status');let preview=null,versions=null,previewOptions=null;
  const signature=rs=>JSON.stringify(rs.filter(r=>r.project.id===project.value).map(r=>[r.id,r.revision]).sort());
  const controls=[];const invalidate=message=>{preview=null;area.value='';previewText.textContent='';table.replaceChildren();controls.forEach(b=>b.disabled=true);warning.replaceChildren(el('p',message||'プレビューを更新してください。'));};
  async function build(){invalidate();const options={projectId:project.value,format:format.value};records=await store.all();if(options.projectId!==project.value||options.format!==format.value)return;preview=D.exportBasket(records,{...options,pending:exportPending()});previewOptions=options;versions=signature(records);area.value=preview.csv;previewText.textContent=preview.csv;window.DataExCSVTraceUI.renderExportTable(table,preview);count.textContent=preview.count+' Result set · '+preview.rows.length+'行（全文表示）';warning.replaceChildren();preview.warnings.forEach(w=>{const p=el('p',w.message);p.dataset.warningCode=w.code;warning.append(p);});controls.forEach(b=>b.disabled=preview.blocked||!preview.rows.length);}
  async function output(kind){
   if(!preview||preview.blocked||!preview.rows.length)return;
   const expected=preview,options=previewOptions,label=projects.find(([id])=>id===options.projectId)?.[1]||'Review',name=label+'_accepted_'+options.format+'.csv';
   const destination=kind==='save'?await window.DataExCSVTraceUI.prepareSave(name):null;
   if(kind==='save'&&!destination){warning.replaceChildren(el('p','保存をキャンセルしました。採用データは変更していません。'));return;}
   const latest=await store.all();if(preview!==expected)return;const checked=D.exportBasket(latest,{...options,pending:exportPending()});
   if(checked.blocked){invalidate(checked.warnings.find(w=>w.blocking)?.message||'出力前検査に失敗しました。保存状態を確認してください。');return;}
   if(signature(latest)!==versions||checked.csv!==expected.csv||checked.tsv!==expected.tsv){invalidate('採用内容・出典・版が更新されています。プレビューを更新してください。');return;}
   if(kind==='save'||kind==='download')warning.replaceChildren(el('p',await window.DataExCSVTraceUI.download(checked.csv,name,d,destination||undefined)));
   else{await copyText(kind==='tsv'?checked.tsv:checked.csv,area);warning.replaceChildren(el('p',(kind==='tsv'?'Excel貼り付け用（タブ区切り）':'CSV')+'全文をコピーしました。'));}
  }

  const performOutput=kind=>output(kind).catch(e=>warning.replaceChildren(el('p',e.message)));
  controls.push(button('CSVをコピー',()=>performOutput('csv')),button('CSVを保存',()=>performOutput('save')),button('TSVをコピー',()=>performOutput('tsv')),button('ダイアログなしでダウンロード',()=>performOutput('download')));
  const update=button('プレビューを更新',build);for(const n of [project,format])n.addEventListener('change',()=>{invalidate();build().catch(e=>warning.replaceChildren(el('p',e.message)));});
  rawFold.append(el('summary','CSVのテキストを表示'),previewText);d.append(filters,count,warning,table,rawFold,area,actions(...controls,update,button('出典付きCSVを開く',()=>{d.close();return traceCsvDialog();}),button('閉じる',()=>d.close())));await build();
 }
 async function settleDrafts(){
  await bindWork;await chain;if(!drafts.size)return true;
  return new Promise(resolve=>{const d=modal('未保存の修正があります'),msg=el('p');d.append(el('p','保存済みの作業は残ります。未保存の入力だけをどう扱うか選んでください。'),msg);
   const done=v=>{d.close();resolve(v);};d.oncancel=e=>{e.preventDefault();done(false);};
   d.append(actions(button('保存して切替',async()=>{const editor=lastDraftEditor;const save=editor&&[...editor.querySelectorAll('button')].find(b=>b.textContent==='修正を保存');if(!save){msg.textContent='元の編集画面で保存を完了してください。切り替えていません。';return;}await save.dataexRun();await chain;if(drafts.size||saveFailure){msg.textContent='保存できないため切り替えていません。'+(saveFailure||editor.querySelector('.decision-message')?.textContent||'修正理由と値を確認してください。');return;}done(true);}),button('未保存分を破棄して切替',()=>{drafts.clear();document.querySelectorAll('.decision-dialog[data-result-set-edit],.decision-dialog[data-point-id]').forEach(x=>x.close());done(true);}),button('キャンセル',()=>done(false))));
  });
 }
 async function releaseCurrent(){
  if(!await settleDrafts())return false;
  ++token;activeId=null;current=null;opened=null;ready=false;loaded=false;listeners.clear();drafts.clear();sourceButtons.clear();document.querySelectorAll('.decision-dialog[data-derived-set],.decision-dialog[data-point-id],.decision-dialog[data-confirm-outcome],.decision-dialog[data-result-set-edit],.decision-dialog[data-result-set-conflict]').forEach(d=>d.close());await refresh();return true;
 }
 function readFinalRow(id){const raw=current?.snapshot.raw.rawValues.find(r=>r.id===id);return raw?finalRow(current,raw):null;}
 function choicePanel(parent){
  const fold=el('details',null,'decision-choice-panel');fold.append(el('summary','群・時点の確認（抽出後）'));
  const arms=window.DataExPaperModel.armOntology(current.snapshot.raw).originalArms, proposals=current.snapshot.raw.proposals, armProposal=proposals.find(p=>p.kind==='ARM_COMBINATION'), timeProposal=proposals.find(p=>p.kind==='TIME_CLUSTER');
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
  const projects=projectOptions();const project=select(filters,'Review',projects,projectId||projects[0]?.[0]||'');
  const check=(label)=>{const l=el('label'),n=el('input');n.type='checkbox';n.checked=true;l.append(n,document.createTextNode(label));filters.append(l);return n;};
  const studies=check('確定済み研究のみ'),outcomes=check('確定済みOutcomeのみ');
  const format=select(filters,'形式',[['master','Master long format'],['continuous','Continuous pairwise'],['binary','Binary pairwise'],['giv','Generic inverse variance'],['audit','Audit CSV（全状態）']],'master');
  const resultType=select(filters,'連続値の種類',[['endpoint','Endpoint'],['change','Change']],'endpoint');
  const pairArea=el('div',null,'decision-pairs'),warnings=el('div',null,'decision-csv-warnings');warnings.setAttribute('role','status');let pairs={},preview=null,versions=null,previewOptions=null;
  const save=button('CSV保存',()=>saveCsv(false),'decision-save-csv');save.disabled=true;
  const heldSave=button('確定済みだけ出力',()=>saveCsv(true));heldSave.hidden=true;
  const checkHold=button('保留を確認',async()=>{const r=records.find(r=>r.project.id===project.value&&D.counts(r).hold);if(r){d.close();await showRecord(r);tell(D.counts(r).hold+'件の値を保留中です。Outcomeのセルメニューで確認できます。');}});checkHold.hidden=true;
  const invalidate=()=>{preview=null;save.disabled=true;heldSave.hidden=true;checkHold.hidden=true;content.replaceChildren();warnings.replaceChildren();};
  const pairControls=()=>{
   invalidate();pairArea.replaceChildren();pairs={};const pairwise=['continuous','binary','giv'].includes(format.value);resultType.parentElement.hidden=format.value!=='continuous';studies.disabled=outcomes.disabled=format.value==='audit';
   if(pairwise)for(const r of records.filter(r=>r.project.id===project.value)){if(studies.checked&&!['CONFIRMED','LOCKED'].includes(r.status))continue;const group=el('fieldset');group.append(el('legend',r.snapshot.raw.study.label.split(/\s+[—–]\s+/)[0]));const opts=[['','比較を選択'],...window.DataExPaperModel.armOntology(r.snapshot.raw).treatmentArms.map(a=>[a.id,a.label+(a.pooled?' — Derived / pooled analysis node':'')])];const a=select(group,'Intervention',opts,''),b=select(group,'Comparator',opts,'');a.dataset.pairIntervention=r.id;b.dataset.pairComparator=r.id;for(const n of [a,b])n.addEventListener('change',()=>{invalidate();pairs[r.id]={intervention:a.value,comparator:b.value};});pairArea.append(group);}
  };
  for(const n of [project,format,studies])n.addEventListener('change',pairControls);for(const n of [outcomes,resultType])n.addEventListener('change',invalidate);
  const build=button('プレビュー',async()=>{
   invalidate();records=await store.all();previewOptions={format:format.value,projectId:project.value,confirmedStudies:studies.checked,confirmedOutcomes:outcomes.checked,resultType:format.value==='continuous'?resultType.value:undefined,pairs:structuredClone(pairs)};preview=D.exportData(records,{...previewOptions,pending:exportPending()});
   versions=JSON.stringify(records.map(r=>[r.id,r.revision]).sort());warnings.replaceChildren();preview.warnings.forEach(w=>{const p=el('p',w.message);p.dataset.warningCode=w.code;warnings.append(p);});
   content.replaceChildren();content.append(el('p',preview.rows.length+'行。プレビューは先頭20行、CSVは全行を保存します。','decision-preview-count'));const scroll=el('div',null,'decision-csv-preview'),table=el('table'),head=el('tr');preview.columns.forEach(c=>head.append(el('th',c)));table.append(head);
   for(const row of preview.rows.slice(0,20)){const tr=el('tr');preview.columns.forEach(c=>tr.append(el('td',row[c]??'')));table.append(tr);}scroll.append(table);content.append(scroll);
   const canSave=preview.rows.length>0&&!preview.blocked;save.disabled=!canSave||(preview.held>0&&format.value!=='audit');heldSave.hidden=!canSave||!preview.held||format.value==='audit';checkHold.hidden=!preview.held||format.value==='audit';
  });
  async function saveCsv(ackHold){
   if(!preview||!preview.rows.length||preview.blocked)return;
   if(preview.held&&preview.format!=='audit'&&!ackHold){tell('保留の警告を確認してください。');return;}
   const expected=preview,options=previewOptions,latest=await store.all();if(preview!==expected)return;const checked=D.exportData(latest,{...options,pending:exportPending()});if(checked.blocked||JSON.stringify(latest.map(r=>[r.id,r.revision]).sort())!==versions||checked.csv!==expected.csv){invalidate();warnings.append(el('p',checked.warnings.find(w=>w.blocking)?.message||'保存内容・出典・版が更新されています。もう一度プレビューしてください。'));return;}
   const label=projects.find(([id])=>id===project.value)?.[1]||'Review';await download(checked.csv,label+'_'+checked.format+'.csv');
  }
  d.append(pairArea,actions(build,save,heldSave,checkHold,button('閉じる',()=>d.close())),warnings,content);pairControls();
 }
 function editTrace(spec,selection){if(disabled())return;return window.DataExCSVTraceUI.editDialog({record:structuredClone(current),spec,selection,perform:run,isCurrent:id=>activeId===id});}
 async function traceCsvDialog(){await startup;await chain;return window.DataExCSVTraceUI.exportDialog({all:()=>store.all(),base:D,projectId,projectLabel:selectedProject()?.label,analysisDialog:basketCsvDialog,pending:()=>({busy,drafts:drafts.size,error:saveFailure}),editRecord:async record=>{if(record)await showRecord(record);tell('該当カードの「出典を確認・補記」で不足項目を記録してください。');}});}

 async function prepareCollection(){await startup;await chain;const W=window.DataExOutcomeWorkflow,c=W.catalog(await store.all(),projectId);if(c.prepared)return c;return workflow({type:'PREPARE',label:selectedProject()?.label,reviewId:projectId,expectedCatalogRevision:c.revision,operationId:crypto.randomUUID()});}
 async function reloadSaved(){if(!await settleDrafts())return false;await refresh();const c=window.DataExOutcomeWorkflow.catalog(records,projectId),r=records.find(r=>r.id===activeId)||records.find(r=>r.id===c.session.recordId);if(r)await showRecord(r);else await activateProject(await catalog.get(projectId),(await catalog.get(projectId)).context);return true;}
 function clearSummary(){const target=selectedProject();if(!target)throw Error('クリアする作業を選択してください。');const own=records.filter(r=>r.project.id===target.id),c=window.DataExOutcomeWorkflow.catalog(records,target.id),approvals=own.reduce((n,r)=>n+Object.keys(r.csvTrace?.approvals||{}).length,0),history=own.reduce((n,r)=>n+(r.history?.length||0),0)+(c.history?.length||0);return {reviewId:target.id,label:target.label,records:own.length,raw:own.reduce((n,r)=>n+(r.snapshot?.raw?.rawValues?.length||0),0),approvals,history,analyses:c.analyses?.length||0,members:c.members?.length||0,batches:c.batches?.length||0,proposals:c.aiProposals?.length||0,expectedRecords:own.map(r=>[r.id,r.revision]),expectedCatalogRevision:c.revision,signature:window.DataExOutcomeWorkflow.stable({reviewId:target.id,records:own.map(r=>[r.id,r.revision]).sort(),catalogRevision:c.revision})};}
 async function clearProject(expectedSignature){await whenIdle();if(drafts.size||busy||switching)throw Error('未保存の編集または処理中の操作があります。保存またはキャンセルしてからクリアしてください。');const summary=clearSummary();if(summary.signature!==expectedSignature)throw Error('確認後に作業内容が更新されました。クリア画面を開き直してください。');const target=selectedProject();if(!await releaseCurrent())return false;busy=true;saveFailure='';notify();try{await store.removeReview(target.id,{expectedRecords:summary.expectedRecords,expectedCatalogRevision:summary.expectedCatalogRevision,guard:()=>{if(projectId!==target.id||drafts.size||switching)throw Error('作業状態が変わったためクリアを中断しました。');}});await onProjectClear?.(target.id);await catalog.remove(target.id);const replacement=await catalog.create('作業 '+new Date().toISOString().replace('T',' ').replace('Z',''));await activateProject(replacement,replacement.context);tell('選択していた作業のブラウザ保存内容をクリアし、新しい空の作業を開きました。');return true;}catch(e){saveFailure=e.message;throw e;}finally{busy=false;notify();}}
 async function importCSV(preview){await whenIdle();if(drafts.size||busy||switching)throw Error('未保存編集を保存またはキャンセルしてください。');const target=selectedProject(),W=window.DataExOutcomeWorkflow,S=window.DataExWorkSession,all=await store.all(),c=W.catalog(all,target.id),revision=c.revision;
  const fresh=S.inspect(preview.originalCSV,{D,filename:preview.filename,hash:preview.hash,imports:c.imports||[],mapping:preview.mapping||{}});if(fresh.errors.length)throw Error(fresh.errors.map(e=>e.line+'行 '+e.column+': '+e.reason).join('\n'));
  if(fresh.demo&&!/架空|デモ|demo/i.test(target.label))throw Error('架空データは専用デモ作業に取り込んでください。');
  for(const row of fresh.rows)if(row.value.Record_ID&&all.some(r=>r.id===row.value.Record_ID))throw Error('CSVのRecord_IDが既存研究と一致します。上書きせず差分確認が必要です。');
  const at=new Date().toISOString(),id='csv-import:'+crypto.randomUUID(),added=S.materialize(fresh,target,{F:window.DataExFuzzyCore,D,id,at});for(const r of added)cacheDerived(r);
  // Unconfirmed CSV memberships have no fixed approval reference and are never exportable.
  for(const r of added){const v=window.DataExResultsModel.build(r.snapshot,{}),paper=window.DataExPaperModel.build(v,{}),cards=window.DataExConfirmation.cards(paper,v);for(const set of cards){const g=S.grouping(r,set,W),key=W.stable(g);let a=c.analyses.find(a=>a.autoKey===key);if(!a){const aid=crypto.randomUUID(),oid=aid+':outcome';c.outcomes.push({id:oid,name:g.name,definition:g.definition,category:'other',kind:'other',revision:1});a={id:aid,outcomeId:oid,label:g.name,comparison:g.comparison,window:g.window,population:g.population,resultType:g.resultType,format:g.format,revision:1,autoKey:key};c.analyses.push(a);}c.members.push({id:crypto.randomUUID(),analysisId:a.id,analysisRevision:1,outcomeRevision:1,recordId:r.id,studyId:r.studyId,candidateId:set.id,status:'PENDING',ref:null,at,actor:null,reason:'外部CSV由来・未確認。原著・数値別出典と対応付けの確認待ち',original:W.dimensions(r,set),importId:id});}}
  c.imports||=[];c.imports.push({...fresh,id,at,status:'EXTERNAL_UNCONFIRMED'});c.prepared=true;c.revision++;c.updatedAt=at;c.history.push({type:'IMPORT_CSV',operationId:id,at,rows:fresh.rows.length,actor:null});
  busy=true;saveFailure='';notify();try{await store.commitBatch({reviewId:target.id,expectedCatalogRevision:revision,expectedRecords:Object.fromEntries(added.map(r=>[r.id,-1])),records:added,catalog:c,guard:()=>{if(projectId!==target.id||switching||drafts.size)throw Error('作業が切り替わりました。取り込んでいません。');}});await refresh();return {records:added,rows:fresh.rows.length};}catch(e){saveFailure=e.message;throw e;}finally{busy=false;notify();}
 }
 async function confirmBatch(sets,actor='',options={}){
  if(!actor.trim()){actor=await ensureReviewer();if(!actor)return false;}
  if(options.resumeDeclaration&&!options.proposalTarget)throw Error('保存済み承認の再開には提案表が必要です。');
  await whenIdle();if(drafts.size||busy||switching||!current)throw Error('未保存編集・処理中の操作を完了してください。');if(!sets.length)throw Error('今回確認した結果を明示的に選んでください。');if(new Set(sets.map(s=>s.id)).size!==sets.length)throw Error('候補が重複しています。');
  const W=window.DataExOutcomeWorkflow,S=window.DataExWorkSession,T=window.DataExCSVTrace,original=structuredClone(current),id=activeId,expected=original.revision,all=await store.all();let c=W.catalog(all,projectId),catRev=c.revision,next=structuredClone(original),persistAttempted=false;const initialMode=c.session.mode;if(c.session.stopped)throw Error('確認を停止中です。「再開」を押してください。');busy=true;saveFailure='';notify();
  try{for(const set of sets){let humanReview={policy:'HUMAN-APPROVAL-CSV-2.0',method:options.humanReviewMethod||'DataExまたは他のアプリ・紙の原著で確認'};const proposalTarget=options.proposalTarget;let proposalTable=null,proposalMatch=null,proposalRow=null;if(proposalTarget){if(sets.length!==1)throw Error('AI提案の承認対象は表示中の一候補だけです。');const run=c.aiProposals?.find(r=>r.id===proposalTarget.runId);proposalTable=run&&window.DataExAIProposal.tables(run,c).find(t=>t.id===proposalTarget.tableId);proposalMatch=proposalTable?.rows.flatMap(r=>r.matches).find(m=>m.recordId===id&&m.candidateId===set.id);proposalRow=proposalTable?.rows.find(r=>r.matches.includes(proposalMatch));if(proposalRow?.humanStatus)throw Error('この研究は'+proposalRow.humanStatus+'です。候補の対応付けを明示的に修正してから承認してください。');if(run?.phase!=='ready'||!proposalMatch)throw Error('保存済み提案と元候補が一致しません。');if(options.proposalMatchSnapshot&&window.DataExAIProposal.stable(proposalMatch)!==options.proposalMatchSnapshot)throw Error('別の操作で提案の対応・条件が変わりました。AI提案の行を開き直して確認してください。');if(proposalMatch.transformation?.kind==='COMPLEMENT_COUNT_V1'){const traceEvidence=await getTraceEvidence(next,{...set,conditionSourceIds:proposalMatch.transformation.proof?.sourceIds||[]});next=window.DataExAIProposal.prepareComplement(next,set,proposalMatch,{D,actor,at:new Date().toISOString(),evidence:traceEvidence});}if(options.resumeDeclaration){const P=window.DataExAIProposal,d=c.proposalDeclarations?.[options.resumeDeclaration.key],version=P.declarationVersion(next,proposalMatch,set.pointIds);if(!d||d.id!==options.resumeDeclaration.id||d.status!=='CONFIRMED'||d.recordId!==id||d.candidateId!==set.id||d.runId!==proposalTarget.runId||d.tableId!==proposalTarget.tableId||d.actor!==actor||d.version!==version||(d.tableVersion?d.tableVersion!==P.stable(proposalTable):P.stable(proposalTable)!==P.stable(run.response?.tables?.find(t=>t.id===proposalTable.id))))throw Error('保存済み承認と現在の対象が一致しません。承認は変更していません。');humanReview={...humanReview,method:d.method,declarationId:d.id,declaredAt:d.at};c.history.push({type:'RESUME_SAVED_PROPOSAL_DECLARATION',declarationId:d.id,declaredAt:d.at,actor:d.actor,recordId:id,candidateId:set.id,at:new Date().toISOString()});}if(proposalMatch.arm1Id!==set.comparison?.intervention||proposalMatch.arm2Id!==set.comparison?.comparator)throw Error('原著比較方向と提案群の対応を確認してください。表示だけで方向を変更しません。');}if(!set.pointIds.every(p=>next.points[p]))throw Error('候補IDと数値IDが一致しません。');const reuse=W.reusable(next,next.resultSets?.[set.id],D,T);
    if(!reuse){if(!options.conflictResolution&&D.resultSetConflicts(next,set).length)throw Error(set.label+'：代替結果または共有対照があります。個別に解決してから選択してください。');const traceEvidence=loaded?await getTraceEvidence(next,set):null;
     const evidence=Object.fromEntries(set.pointIds.map(p=>{const v=next.points[p].decision.finalValue||next.points[p].raw;return [p,{pdfId:next.studyId,page:v.sourceAnchor?.pdfPage,sourceIds:Object.values(v.sourceRefs||{}),sourceLocation:'unresolved',manualNote:''}];}));
     next=D.apply(next,{type:'UX_CONFIRM_ADOPT',resultSet:set,operationId:crypto.randomUUID(),expectedRevision:next.revision,candidateRevision:next.revision,confirmed:true,confirmationMethod:window.DataExConfirmation.BUTTON_METHOD,traceEvidence,evidence,traceActor:actor,traceSelectionReason:'論文ごとに確認した結果を明示的に選択',...options,resultSet:set,humanReview});cacheDerived(next);if(next.verification)next.verification.savedRevision=next.revision;if(next.csvTrace)next.csvTrace.savedRevision=next.revision;
    }
    const originalGrouping=S.grouping(next,set,W),g=proposalTable?{...originalGrouping,name:proposalTable.name,definition:proposalTable.definition,comparison:proposalTable.comparison,window:proposalTable.window,format:proposalTable.format}:originalGrouping,key=W.stable(g);let a=proposalTarget?c.analyses.find(a=>a.proposal?.runId===proposalTarget.runId&&a.proposal?.tableId===proposalTarget.tableId):c.analyses.find(a=>a.autoKey===key)||c.analyses.find(a=>c.members.some(m=>m.analysisId===a.id&&m.recordId===id&&m.candidateId===set.id));
    if(!['binary','continuous','giv'].includes(g.format))throw Error('確認の表明は保存済みです。この候補は解析CSVの型を確定できません。割合だけの候補ではイベント人数と対応分母、群別結果では比較する両群を確認してください。数値は推測しません。');const rs=all.map(r=>r.id===id?next:r);rs.catalogs=[c];
    if(!a){const result=W.transition(rs,{type:'CREATE',reviewId:projectId,expectedCatalogRevision:c.revision,recordId:id,operationId:crypto.randomUUID(),id:crypto.randomUUID(),...g},{D,T});c=result.catalog;a=c.analyses.at(-1);a.autoKey=key;if(proposalTarget)a.proposal=structuredClone(proposalTarget);}
    if(proposalTarget){(next.aiProposalBindings||={})[set.id]={...structuredClone(proposalTarget),analysisId:a.id,match:structuredClone(proposalMatch),humanMapping:{policy:'HUMAN-MAPPING-1.0',actor,at:new Date().toISOString(),basis:window.DataExAIProposal.mappingBasis(proposalTable,proposalRow,proposalMatch),warning:window.DataExAIProposal.mappingReviewReason(proposalRow,proposalMatch)}};}c.session={...c.session,mode:initialMode,analysisId:a.id,recordId:id,stopped:false};rs.catalogs=[c];const saved=W.transition(rs,{type:'ADD',reviewId:projectId,expectedCatalogRevision:c.revision,recordId:id,analysisId:a.id,candidateId:set.id,operationId:crypto.randomUUID(),actor,reason:proposalMatch?[proposalMatch.reason,proposalMatch.timeReason,proposalMatch.armReason,'表示された対応理由を本人が確認して追加'].join(' / '):'原著のアウトカム定義・比較・実時点・型・集団が一致する表へ明示選択して追加'},{D,T});c=saved.catalog;if(proposalTarget){c.history.push({type:'AI_PROPOSAL_HUMAN_ADOPT',recordId:id,candidateId:set.id,analysisId:a.id,actor,at:new Date().toISOString(),proposal:structuredClone(proposalTarget)});}
   }
   c.session.mode=initialMode;persistAttempted=true;await store.commitBatch({reviewId:projectId,expectedCatalogRevision:catRev,expectedRecords:{[id]:expected},expectedContents:{[id]:store.recordContent(original)},records:[next],catalog:c,guard:()=>{if(activeId!==id||current.revision!==expected||drafts.size||switching)throw Error('保存前に研究・版・作業が変わりました。全件を保存せず停止しました。');}});current=next;opened=next;await refresh();notify();return true;
  }catch(e){saveFailure=persistAttempted?e.message:'';throw e;}finally{busy=false;notify();}
 }

 function reviewer(){return window.DataExOutcomeWorkflow.catalog(records,projectId).reviewer?.id||'';}
 let reviewerSetup=null;
 async function ensureReviewer(change=false){
  await whenIdle();if(reviewer()&&!change)return reviewer();if(reviewerSetup)return reviewerSetup;
  const pid=projectId;
  reviewerSetup=new Promise(resolve=>{const d=modal('今回の確認者を設定'),m=el('p'),input=field(d,'氏名または任意の担当者ID',reviewer());input.setAttribute('aria-label','氏名または任意の担当者ID');input.maxLength=200;
   d.append(el('p','同じ作業内で保持します。入力した担当者IDを今回の承認に記録します。実名確認や過去の承認の補記は行いません。'),m);
   let saving=false,done=false;const save=button('この担当者で続ける',async()=>{if(saving)return;saving=true;save.disabled=true;try{if(projectId!==pid)throw Error('作業が変わりました。現在の作業で設定し直してください。');const c=window.DataExOutcomeWorkflow.catalog(await store.all(),pid);await workflow({type:'REVIEWER',reviewId:pid,expectedCatalogRevision:c.revision,reviewer:{id:input.value},operationId:crypto.randomUUID()});done=true;resolve(reviewer());d.close();}catch(e){m.textContent=e.message;}finally{saving=false;save.disabled=false;}});
   d.append(actions(save,button('キャンセル',()=>{if(!saving)d.close();})));d.addEventListener('cancel',e=>{if(saving)e.preventDefault();});d.addEventListener('close',()=>{if(!done)resolve(null);});input.focus();
  });try{return await reviewerSetup;}finally{reviewerSetup=null;}
 }

 let requestedPosition='';
 function rememberCandidate(candidateId){if(!ready||busy||!activeId||!candidateId)return;const id=activeId,pid=projectId,key=id+'|'+candidateId;if(key===requestedPosition)return;requestedPosition=key;const work=async()=>{if(activeId!==id||projectId!==pid)return;const all=await store.all(),c=window.DataExOutcomeWorkflow.catalog(all,pid);if(c.session.recordId===id&&c.session.candidateId===candidateId)return;await store.savePosition(pid,id,candidateId,()=>{if(activeId!==id||projectId!==pid)throw Error('作業が変わったため表示位置は保存しません。');});records=await store.all();};const result=chain.then(work);chain=result.catch(e=>{requestedPosition='';tell('表示位置を保存できません: '+e.message);});}
 async function whenIdle(){await startup;await chain;await transition.catch(()=>{});await bindWork;}

 const startup=initialize();startup.catch(e=>tell('Review Workspaceを読み込めません: '+e.message));
  const api=Object.freeze({declareCurrent,declarationState,reviewer,ensureReviewer,rememberCandidate,clearSummary,clearProject,renameProject:async label=>{const p=await catalog.rename(projectId,label);projects=await catalog.all();await onProjectRename?.(p);await refresh();},prepareCollection,reloadSaved,settleDrafts,importCSV,confirmBatch,projectList:()=>catalog.all(),hideWorkflowPdf,reconnectDocuments,workflow,workflowCatalog:()=>window.DataExOutcomeWorkflow.catalog(records,projectId),nextPending:(cards,id)=>window.DataExConfirmation.nextPending(current,cards,id),registerSourceButton:(id,button)=>sourceButtons.set(id,button),focusSnapshot:ids=>window.DataExConfirmation.focusState(current,ids),workspaceElement:()=>host,perform:run,editResultSet,acceptResultSet,eligibleDerived,saveStatus:()=>({ready,busy,drafts:drafts.size,error:saveFailure}),bind,commitImported,wrapValue,attachOutcome,attachStudy,attachResultSet,releaseCurrent,readFinalRow,watchFinal:subscribe,viewed,preferredSnapshot:(pdfId,reviewId=projectId)=>{const r=opened?.studyId===pdfId&&opened.project.id===reviewId?opened:records.find(r=>r.studyId===pdfId&&r.project.id===reviewId);if(r)opened=r;return r?{...structuredClone(r.snapshot),project:structuredClone(r.project)}:null;},openRecord:showRecord,
  editTrace,traceCsvDialog,basketCsvDialog,basketCount:()=>D.basket(records,projectId).length,snapshot:()=>current?structuredClone(current):null,selectedProject,projectForContext,saveContext,createProject,selectProject,ready:()=>ready&&!busy,all:()=>store.all(),whenIdle:async()=>{await startup;await chain;await transition.catch(()=>{});await bindWork;},mappingDecisions:context=>window.DataExICO.learned(records,{...context,reviewName:projectForContext(context).id})});return api;
};
