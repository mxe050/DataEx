/* PREVIEW-BATCH-1.0: display diagnostics separately from permission to export. */
window.DataExSimpleFlowUI=(()=>{
 const el=(tag,text)=>{const n=document.createElement(tag);if(text!=null)n.textContent=text;return n;};
 async function preview(review,{analysisId,recordId,candidateId}={}){
  const W=window.DataExOutcomeWorkflow,D=window.DataExDecision,T=window.DataExCSVTrace,S=window.DataExWorkSession,U=window.DataExCSVTraceUI,F=window.DataExSimpleFlow,pid=review.selectedProject()?.id;
  const d=el('dialog');d.className='decision-dialog simple-csv-dialog';d.setAttribute('aria-label','累積CSVプレビュー');
  const msg=el('p'),select=el('select'),table=el('div'),help=el('p'),fallback=el('textarea'),controls=el('div'),details=el('details'),log=el('pre');
  msg.setAttribute('role','status');select.setAttribute('aria-label','出力する解析表');fallback.hidden=true;fallback.readOnly=true;fallback.setAttribute('aria-label','コピーする数値');details.append(el('summary','処理段階・詳細ログ'),log);
  d.append(el('h2','累積CSVプレビュー'),el('p','作業：'+(review.selectedProject()?.label||'未選択')),select,help,msg,table,details,fallback,controls);document.body.append(d);d.showModal();
  let snap=null,busy=false,generation=0,closed=false,state='loading',stage='読込',initialized=false,diagnostics=[];
  const outputs=[],buttons=[];
  function enabled(){for(const b of outputs)b.disabled=busy||state!=='ready'||!snap?.rows?.length||(b.dataset.kind==='copy'&&!snap.numericColumns?.length);for(const b of buttons)b.disabled=busy;select.disabled=busy;}
  function button(label,fn,kind){const b=el('button',label);b.type='button';b.dataset.kind=kind||'';b.onclick=async e=>{if(busy||e.detail>1||e.isComposing)return;busy=true;enabled();try{await fn();}catch(error){state='error';snap=null;msg.textContent='予期しないエラー（'+stage+'）：'+error.message+'。保存せず停止しました。プレビューを更新するか、確認画面へ戻ってください。';log.textContent=error.stack||error.message;}finally{busy=false;enabled();}};b.onkeydown=e=>{if(e.repeat||e.isComposing)e.preventDefault();};controls.append(b);(kind?outputs:buttons).push(b);return b;}
  function contextGuard(){if(review.selectedProject()?.id!==pid)throw Error('作業が変わりました。この画面を閉じて対象作業で開き直してください。');}
  function drawRows(result){table.replaceChildren();const t=el('table'),head=el('tr');for(const k of result.columns)head.append(el('th',k));t.append(head);
   for(const row of result.rows){const tr=el('tr');if(row.Record_ID===recordId&&row.Candidate_ID===candidateId)tr.className='simple-new-row';for(const k of result.columns){const td=el('td');if(/_source_note$|_trace_json$|context_json|history/.test(k)){const fold=el('details');fold.append(el('summary',k.endsWith('_source_note')?'この数値の出典':'詳細'),el('pre',row[k]??''));td.append(fold);}else td.textContent=String(row[k]??'');td.dataset.csvColumn=k;tr.append(td);}t.append(tr);}table.className='simple-csv-table';table.append(t);
  }
  function drawDiagnostics(){table.replaceChildren();table.append(el('h3','確認用表示（正規のCSVではありません）'));
   if(!diagnostics.length){const t=el('table'),h=el('tr');for(const k of ['研究','結果','状態'])h.append(el('th',k));t.append(h);table.append(t,el('p',state==='error'?'読込・生成に失敗したため行数を確認できません。上の具体的な理由を確認してください。':'承認済みデータはまだありません。確認画面で原著を確認して承認してください。'));}
   for(const row of diagnostics){const box=el('article');box.append(el('strong',row.study+' / '+(row.label||'対象候補')+' / '+(row.timepoint||'')),el('p',row.status+'：'+(row.problem||'出力前検査の理由を確認してください。')));
    const values=el('details');values.append(el('summary','現在値／承認時の値'),el('p','現在値'),el('pre',JSON.stringify(row.current??null,null,2)),el('p','承認時の値'),el('pre',JSON.stringify(row.approved??null,null,2)));box.append(values);
    const back=el('button','この研究の確認画面へ戻る');back.type='button';back.onclick=async()=>{try{const records=await review.all(),r=records.find(r=>r.id===row.recordId);if(!r)throw Error('元研究がありません。保存済み作業を確認してください。');await review.openRecord(r);if(row.candidateId)review.rememberCandidate(row.candidateId);d.close();}catch(e){msg.textContent=e.message;}};box.append(back);table.append(box);
   }
  }
  async function build(){const ticket=++generation,requested=select.value;state='loading';snap=null;diagnostics=[];fallback.hidden=true;msg.textContent='読込中：保存済みの値・出典・承認・所属を照合しています。';table.replaceChildren();enabled();
   let localStage='読込';try{await review.whenIdle();const records=await review.all();if(closed||ticket!==generation)return;contextGuard();localStage='対象選択';const c=W.catalog(records,pid);
    if(!initialized){analysisId||=c.members.find(m=>m.recordId===recordId&&m.candidateId===candidateId&&m.status==='INCLUDED')?.analysisId||c.session.analysisId;initialized=true;}
    select.replaceChildren();const all=el('option','全アウトカム（長形式の引継ぎ）');all.value='';select.append(all);for(const a of c.analyses){const o=el('option',a.label+' / '+a.comparison+' / '+a.window);o.value=a.id;select.append(o);}select.value=c.analyses.some(a=>a.id===(requested||analysisId))?requested||analysisId:'';analysisId=null;
    diagnostics=F.inspectRows(records,c,select.value,D,T);localStage='投影・出力前検査・直列化';const next=F.output(records,c,select.value,W,D,T,S,{pending:review.saveStatus(),exportId:crypto.randomUUID(),exportedAt:new Date().toISOString()});if(ticket!==generation||closed)return;
    localStage='描画';snap=next;state=next.state||(next.blocked?'needs-review':'ready');help.textContent='解析表：'+select.options[select.selectedIndex].textContent+'。左に数値、右に数値別の出典。';
    if(next.blocked){msg.textContent=(state==='empty'?'承認済み0件':'確認が必要')+'：'+[...new Set(next.issues)].join('\n');drawDiagnostics();}else{msg.textContent=`表示・出力可能：${new Set(next.rows.map(r=>r.study_id)).size}承認研究・${next.rows.length}結果行`;drawRows(next);}log.textContent=JSON.stringify({stage:localStage,state,reviewId:pid,analysisId:select.value,issues:next.issues},null,2);
   }catch(error){if(ticket!==generation||closed)return;snap=null;state='error';msg.textContent='予期しないエラー（'+localStage+'）：'+error.message+'。データを変更せず停止しました。プレビュー更新または確認画面へ戻ってください。';drawDiagnostics();log.textContent=error.stack||error.message;}finally{if(ticket===generation){stage=localStage;enabled();}}
  }
  async function output(kind){if(state!=='ready'||!snap||snap.blocked) return;const captured=snap,id=select.value,ticket=generation,name='DataEx_'+(id||'ALL_OUTCOMES')+'_unified.csv';
   async function fresh(){contextGuard();if(closed||ticket!==generation||id!==select.value)throw Error('出力対象が変わりました。プレビューを更新してください。');const rs=await review.all();contextGuard();const result=F.output(rs,W.catalog(rs,pid),id,W,D,T,S,{pending:review.saveStatus(),exportId:captured.exportId,exportedAt:captured.exportedAt});if(result.blocked)throw Error(result.issues.join('\n'));if(result.signature!==captured.signature||result.csv!==captured.csv)throw Error('値・出典・版・所属・保存内容が変更されています。プレビューを更新してください。');return result;}
   stage='出力直前検査';await fresh();const dest=kind==='save'?await U.prepareSave(name):null;if(kind==='save'&&!dest){msg.textContent='保存をキャンセルしました。ダウンロードしていません。';return;}stage='保存先選択後検査';const result=await fresh();
   if(kind==='copy'){fallback.value=result.tsv;fallback.hidden=false;fallback.rows=Math.min(8,result.rows.length+1);try{await navigator.clipboard.writeText(result.tsv);msg.textContent='数値コピー完了。研究行をこの順に用意して貼り付けてください。';}catch(_){fallback.focus();fallback.select();let copied=false;try{copied=document.execCommand('copy');}catch(_){}msg.textContent=copied?'数値コピー完了':'コピーが拒否されました。選択した数値をCtrl+Cでコピーしてください。';}}
   else msg.textContent=await U.download(result.csv,name,d,dest||{name});
  }
  button('このCSVを保存',()=>output('save'),'save');button('解析用数値だけコピー',()=>output('copy'),'copy');button('プレビューを更新',build);button('確認画面へ戻る',()=>d.close());button('閉じる',()=>d.close());
  const alternative=el('details');alternative.append(el('summary','保存ダイアログが使えない場合'));alternative.append(button('同じCSVをダウンロード',()=>output('download'),'download'));d.append(alternative);
  d.oncancel=e=>{if(busy)e.preventDefault();};d.addEventListener('close',()=>{closed=true;++generation;d.remove();});select.onchange=()=>build();enabled();await build();return d;
 }
 return Object.freeze({preview});
})();
