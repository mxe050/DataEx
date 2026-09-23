/* User-selected local file -> complete validation -> explicit confirmation -> one atomic commit. */
window.createDataExJSONImportUI=function({host,prepare,commit,openRecord,tell}){
  const IO=window.DataExJSONImport;
  const el=(tag,text)=>{const n=document.createElement(tag);if(text!=null)n.textContent=text;return n;};
  const button=(label,fn)=>{const n=el('button',label);n.type='button';n.addEventListener('click',fn);return n;};
  const input=el('input');input.type='file';input.accept='.json,application/json';input.hidden=true;input.id='saved-extraction-json-file';
  const choose=button('保存済み抽出JSONを読み込む',()=>{input.value='';input.click();});choose.id='load-extraction-json';
  const status=el('p');status.id='json-import-status';status.setAttribute('role','status');
  const hint=el('p','大きな結果はJSONファイルで登録できます。PDFと保存先レビューを選択してから読み込んでください。');hint.className='hint';
  const save=button('登録用JSONを保存',()=>download());save.hidden=true;save.id='save-extraction-json';
  host.classList.add('json-import-controls');host.append(choose,input,hint,status,save);
  let working=false,fileText=null,fileName='DataEx-extraction.json',dialog=null,epoch=0;
  function download(){if(fileText==null)return;const url=URL.createObjectURL(new Blob([fileText],{type:'application/json;charset=utf-8'})),a=el('a');a.href=url;a.download=fileName;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  const name=label=>(label||'DataEx').replace(/[<>:"/\\|?*\x00-\x1f]/g,'_').slice(0,120)+'-extraction.json';
  function offer(payload){fileText=JSON.stringify(payload,null,2);fileName=name(payload.study.label);save.hidden=false;status.textContent=IO.LARGE_MESSAGE;return {ok:false,status:'JSON_FILE_REQUIRED',message:IO.LARGE_MESSAGE,fileName,rawValueCount:payload.rawValues.length,outcomeCount:payload.outcomes.length,sourceCount:payload.sources.length};}
  function readFile(file){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(Error('JSONファイルを読み取れません。'));reader.onabort=()=>reject(Error('読込をキャンセルしました。'));reader.readAsText(file,'UTF-8');});}
  function close(){dialog?.close();dialog?.remove();dialog=null;}
  function resetContext(){epoch++;close();fileText=null;fileName='DataEx-extraction.json';input.value='';save.hidden=true;status.textContent='';tell('');}
  function preview(prepared){
    const d=el('dialog');d.className='json-import-dialog';d.id='json-import-dialog';dialog=d;
    const heading=el('h2',prepared.payload.study.label);heading.id='json-import-title';d.setAttribute('aria-labelledby',heading.id);d.append(heading);
    const counts=el('dl');for(const [key,label] of [['raw','Raw'],['outcomes','Outcomes'],['sources','Source Trace'],['sourceAnchors','SourceAnchor（数値行からの参照）']])counts.append(el('dt',label),el('dd',prepared.counts[key]+'件'));d.append(counts);
    d.append(el('p','登録先：'+prepared.project.label));
    const detail=el('details');detail.append(el('summary','形式・識別子を確認'));
    for(const [label,value] of Object.entries(prepared.identity))detail.append(el('p',label+': '+value));
    detail.append(el('p',prepared.legacy?'旧形式の完全なv1 schemaを検証しました。JSONにReview IDはないため、上記の現在選択中レビューを登録先として確認してください。':'JSONのschema version・Study ID・Review ID・Extraction ID・件数がすべて一致しています。'));
    d.append(detail);
    const error=el('p');error.id='json-import-error';error.className='json-import-error';error.setAttribute('role','alert');d.append(error);
    const actions=el('div');actions.className='json-import-actions';const controls=[];
    let target=null;
    if(prepared.matches.length){
      d.append(el('p','同じStudy ID / Extraction IDの結果が存在します。置換前のRaw・修正・採用・auditは履歴JSONに保持します。別バージョンは独立した未採用候補として保存します。'));
      const label=el('label','既存の結果'),select=el('select');select.setAttribute('aria-label','既存の結果');
      for(const r of prepared.matches){const o=el('option',r.snapshot.raw.study.label+' / '+r.updatedAt+' / '+r.extractionId);o.value=r.id;select.append(o);}target=()=>select.value;label.append(select);d.append(label);controls.push(select);
      const view=button('既存結果を見る',async()=>{try{prepared.guard();const record=prepared.matches.find(r=>r.id===target());close();await openRecord(record);}catch(e){status.textContent=e.message;}});actions.append(view);controls.push(view);
    }
    async function submit(mode){
      if(working)return;working=true;controls.forEach(b=>b.disabled=true);choose.disabled=true;error.textContent='';
      let committed=false;const token=epoch;
      try{prepared.guard();const result=await commit(prepared,{mode,targetId:target?.()||null});committed=true;if(token!==epoch)return;status.textContent=`登録完了　Raw ${prepared.counts.raw} / ${prepared.counts.raw}`+(result?.displayWarning?' — '+result.displayWarning:'');tell(status.textContent);close();}
      catch(e){if(token===epoch){error.textContent=e.message;status.textContent=committed?'登録後の表示を確認してください。':'登録していません。変更は保存されていません。';}}
      finally{working=false;controls.forEach(b=>b.disabled=false);choose.disabled=false;}
    }
    for(const [mode,label] of prepared.matches.length?[['replace','このJSONで置換'],['version','別バージョンとして保存']]:[['insert','この結果を登録']]){const b=button(label,()=>submit(mode));b.dataset.importMode=mode;actions.append(b);controls.push(b);}
    const cancel=button('キャンセル',()=>{if(!working){epoch++;close();status.textContent='登録をキャンセルしました。既存結果は変更していません。';}});actions.append(cancel);controls.push(cancel);d.append(actions);
    d.addEventListener('cancel',e=>{if(working)e.preventDefault();else{epoch++;status.textContent='登録をキャンセルしました。既存結果は変更していません。';}});
    d.addEventListener('close',()=>{d.remove();if(dialog===d)dialog=null;});document.body.append(d);d.showModal();
  }
  input.addEventListener('change',async()=>{
    const file=input.files?.[0];if(!file||working)return;
    const token=++epoch;working=true;choose.disabled=true;close();status.textContent='JSON全体を検証しています…';
    try{
      if(file.size>IO.MAX_FILE_BYTES)throw Error('JSONファイルが大きすぎます。');
      const text=await readFile(file),prepared=await prepare(IO.parse(text));
      if(token!==epoch)return;fileText=text;fileName=file.name;save.hidden=false;
      status.textContent='検証完了。確認画面で登録してください。';preview(prepared);
    }catch(e){if(token===epoch)status.textContent='登録していません：'+e.message;}
    finally{working=false;choose.disabled=false;}
  });
  return Object.freeze({busy:()=>working,offer,resetContext});
};
