/* Optional post-extraction provenance editing. Does not change Raw or run extraction. */
window.DataExCSVTraceUI=(()=>{
 'use strict';const T=window.DataExCSVTrace,el=(tag,text)=>{const e=document.createElement(tag);if(text!=null)e.textContent=String(text);return e;};
 function dialog(title){const d=el('dialog');d.className='decision-dialog csv-trace-dialog';const h=el('h2',title);h.id='trace-title-'+crypto.randomUUID();d.setAttribute('aria-labelledby',h.id);d.append(h);document.body.append(d);d.addEventListener('close',()=>d.remove());d.showModal();return d;}
 function input(parent,label,value='',type='text'){const l=el('label',label),n=el(type==='textarea'?'textarea':'input');if(type!=='textarea')n.type=type;n.value=value??'';if(type==='number')n.step='any';if(type==='textarea')n.rows=3;n.setAttribute('aria-label',label);l.append(n);parent.append(l);return n;}
 function select(parent,label,options,value){const l=el('label',label),n=el('select');n.setAttribute('aria-label',label);for(const [id,name] of options){const o=el('option',name);o.value=id;n.append(o);}n.value=value;l.append(n);parent.append(l);return n;}
 function check(parent,label,checked=false){const l=el('label'),n=el('input');l.className='trace-check';n.type='checkbox';n.checked=checked;l.append(n,el('span',label));parent.append(l);return n;}
 function button(parent,label,fn,error){const b=el('button',label);b.type='button';b.addEventListener('click',async()=>{b.disabled=true;try{await fn();}catch(e){if(error)error.textContent=e.message;else throw e;}finally{b.disabled=false;}});parent.append(b);return b;}
 const numeric=value=>value.trim()===''?null:Number(value);
 const safeFilename=name=>name.replace(/[<>:"/\\|?*]/g,'_');
 // Use the accepted result types only to choose a view. The export gate still
 // validates every row. Mixed types stay in Master so none are silently omitted.
 function preferredFormat(records,base,projectId){
  const types=new Set(base.basket(records,projectId).map(({set})=>{
   const values=Object.values(set.acceptedValues||{});
   if(set.acceptedDerived?.length||values.some(v=>v.comparatorArmId||v.resultType==='effect'))return 'giv';
   if(values.length&&values.every(v=>v.dataType==='binary'))return 'binary';
   if(values.length&&values.every(v=>v.dataType==='continuous'))return 'continuous';
   return 'master';
  }));return types.size===1?[...types][0]:'master';
 }
 async function prepareSave(name){
  name=safeFilename(name);
  if(typeof window.showSaveFilePicker==='function')try{return {name,handle:await window.showSaveFilePicker({suggestedName:name,types:[{description:'CSV',accept:{'text/csv':['.csv']}}]})};}
  catch(e){if(e.name==='AbortError')return null;if(!['SecurityError','NotAllowedError','NotSupportedError'].includes(e.name))throw e;}
  return {name};
 }
 async function download(csv,name,parent=document.body,destination={name:safeFilename(name)}){
  if(destination.handle){const stream=await destination.handle.createWritable();try{await stream.write(new Blob([csv],{type:'text/csv;charset=utf-8'}));await stream.close();}catch(e){try{await stream.abort();}catch(_){}throw e;}return '保存完了：'+destination.name;}
  const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'})),a=el('a');a.href=url;a.download=destination.name;
  // A download outside the active modal can be inert in embedded browsers.
  // Keep the URL alive while the browser consumes it; do not claim disk success.
  a.hidden=true;parent.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
  return 'ダウンロードを要求しました：'+destination.name+'。保存先の選択が出ない場合は、ブラウザのダウンロード先を確認してください。';
 }
 // Display-only projection. CSV columns, source notes and trace JSON are untouched.
 function renderExportTable(host,result){
  host.replaceChildren();if(!result?.rows?.length)return;
  const end=result.columns.indexOf('record_kind'),columns=end<0?result.columns:result.columns.slice(0,end),table=el('table'),head=el('tr');
  const labels={Study:'研究',Outcome:'アウトカム',Timepoint:'時点',Result_Type:'結果種別',Intervention:'介入群',Comparator:'対照群',Intervention_Events:'介入群のイベント数',Intervention_Total:'介入群の総人数',Comparator_Events:'対照群のイベント数',Comparator_Total:'対照群の総人数',Intervention_Mean:'介入群の平均値',Intervention_SD:'介入群のSD',Intervention_N:'介入群の人数',Comparator_Mean:'対照群の平均値',Comparator_SD:'対照群のSD',Comparator_N:'対照群の人数',Effect:'効果量',SE:'標準誤差（SE）'};
  for(const c of columns){const th=el('th',c.endsWith('_source_note')?'左の数値の出典':labels[c]||c);th.dataset.csvColumn=c;head.append(th);}table.append(head);
  for(const row of result.rows){const tr=el('tr');for(const c of columns){const td=el('td');td.dataset.csvColumn=c;const value=row[c]??'';
   if(c.endsWith('_source_note')){const detail=el('details');detail.append(el('summary','出典を読む'),el('pre',value));td.append(detail);}
   else{td.textContent=String(value);if(typeof value==='number')td.className='csv-numeric-cell';}tr.append(td);}table.append(tr);}
  host.className='csv-readable-preview';host.append(table);
 }
 async function copyCSV(value,area){try{if(!navigator.clipboard?.writeText)throw Error('clipboard unavailable');await navigator.clipboard.writeText(value);}catch(_){area.hidden=false;area.value=value;area.focus();area.select();area.setSelectionRange(0,value.length);if(!document.execCommand('copy'))throw Error('全文を選択しました。Ctrl+Cでコピーしてください。');}}
 async function identifyPdf(file){
  if(!file||!/\.pdf$/i.test(file.name))throw Error('保存された原著PDFを選択してください。');
  const bytes=await file.arrayBuffer();if(new TextDecoder().decode(new Uint8Array(bytes,0,Math.min(1024,bytes.byteLength))).indexOf('%PDF-')<0)throw Error('PDF形式を確認できません。');
  const digest=await crypto.subtle.digest('SHA-256',bytes),sha=[...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,'0')).join('');
  // Metadata only. No getTextContent, OCR, search or inference occurs here.
  const task=window.pdfjsLib.getDocument({data:new Uint8Array(bytes)});let pdf;try{pdf=await task.promise;return {filename:file.name,sha256:sha,byte_size:file.size,page_count:pdf.numPages,document_id:'sha256:'+sha,hash_method:'SHA-256/file-bytes',hashed_at:new Date().toISOString()};}finally{await task.destroy();}
 }
 const FIELD_LABELS={mean:'平均値',sd:'標準偏差（SD）',se:'標準誤差（SE）',n:'人数（n）',events:'イベント数',total:'総人数',ciLow:'信頼区間の下限',ciHigh:'信頼区間の上限',ciLevel:'信頼区間の水準',eventCount:'イベント回数',personTime:'人時間'};
 function fieldOptions(record,spec){return spec.pointIds.flatMap(id=>{
  const p=record.points[id];if(!p)return [];const v=p.decision.finalValue||p.raw,raw=record.snapshot.raw.rawValues.find(row=>row.id===id),fields=new Set(T.fieldsFor(record,p,v));
  const isEffect=v.resultType==='effect'||v.effect!=null||raw?.statistics?.estimate!=null;
  if(isEffect){fields.add('effect');if(v.sd==null)fields.delete('sd');}
  const type=String(v.effectType||raw?.effectMeasure||''),effectLabel=/^HR$/i.test(type)?'ハザード比（HR）':/^OR$/i.test(type)?'オッズ比（OR）':/^(RR|risk ratio)$/i.test(type)?'リスク比（RR）':/rate ratio/i.test(type)?'率比（Rate ratio）':type?'効果量（'+type+'）':'効果量';
  // CI bounds/level with an existing interval remain explicit even when a bound is missing.
  if(fields.has('ciLow')||fields.has('ciHigh'))for(const f of ['ciLow','ciHigh','ciLevel'])fields.add(f);
  const order=isEffect?['effect','ciLow','ciHigh','ciLevel',...T.FIELDS]:T.FIELDS;
  return [...new Set(order)].filter(f=>fields.has(f)).map(field=>{const value=field==='ciLevel'?(v[field]??raw?.statistics?.ciLevel):v[field],label=(field==='effect'?effectLabel:FIELD_LABELS[field]||field)+'：'+(value==null?'未記録':String(value)+(field==='ciLevel'?'%':''));return {key:T.key(id,field),pointId:id,field,value,label,context:[v.arm,v.timepoint].filter(Boolean).join(' / ')};});
 });}
 function initialField(options,spec,selection){const match=selection?.cardId===spec.id&&options.find(o=>o.pointId===selection.pointId&&o.field===selection.field);return (match||options.find(o=>o.field==='effect')||options.find(o=>o.field==='mean'||o.field==='events')||options[0])?.key;}
 function editDialog({record,spec,selection,perform,isCurrent}){
  const d=dialog('出典を確認・補記'),error=el('p');error.setAttribute('role','status');d.append(el('p','Raw・原Sourceは保持します。補記・訂正後は、数値が同じでも原著の再確認と再採用が必要です。過去の担当者・原文・行番号を推測で埋めないでください。'),error);
  const options=fieldOptions(record,spec),choice=select(d,'出典を確認する数値',options.map(o=>[o.key,o.label+(spec.pointIds.length>1?' — '+o.context:'')]),initialField(options,spec,selection)),content=el('div'),target=el('p');target.className='trace-selected-target';d.append(target,content);
  let collect,activeKey=choice.value,dirty=false,pending=0,saving=false;
  const markDirty=()=>{dirty=true;};content.addEventListener('input',markDirty);content.addEventListener('change',markDirty);
  function paint(){activeKey=choice.value;dirty=false;error.textContent='';content.replaceChildren();const [id,field]=JSON.parse(activeKey),p=record.points[id],v=p.decision.finalValue||p.raw,old=T.editDefaults(record,record.resultSets?.[spec.id]||spec,id,field),option=options.find(o=>o.key===activeKey);
   target.replaceChildren(el('strong',option.label),el('small','内部キー: '+field+' · '+id));
   content.append(el('p',`${v.outcome}／${v.arm}／${v.timepoint}（AI候補=${field==='ciLevel'?(record.snapshot.raw.rawValues.find(row=>row.id===id)?.statistics?.ciLevel??'未記録'):(p.raw[field]??'未記録')}）`));
   const reported=input(content,'原著に実際に書かれた値',old.reportedValue||''),reviewer=input(content,'出典補記者の氏名・ID（不明なら空欄）',old.updatedBy||''),reason=input(content,'出典補記・訂正の理由','','textarea'),selection=input(content,'この値の採用理由',old.selectionReason||'','textarea');
   const candidates=(record.derivedCandidates||[]).filter(c=>c.rawId===id&&c.readiness==='CONVERTIBLE'&&typeof c.statistics?.[field==='effect'?'estimate':field]==='number');
   const origin=select(content,'値の由来',[['direct','原著から直接／転記'],['graph_digitized','既存の図読み取り値'],...(old.derivation?[['saved-derived','保存済みの変換来歴を保持']]:[]),...candidates.map(c=>[c.id,'既存の変換候補: '+c.kind+'／'+c.formula])],old.derivation?'saved-derived':old.origin==='graph_digitized'?'graph_digitized':'direct');
   const condition=check(content,'既存の計算入力・仮定・適用条件を確認した',old.derivation?.applicability?.confirmed||false);
   if(old.derivation||candidates.length)content.append(el('p','変換候補の記録だけを追加します。新しい計算や数値の自動置換は行いません。入力値の出典は、その入力の項目で個別に補記してください。'));
   const sourceArea=el('div');content.append(sourceArea);const sourceReaders=[];
   function sourceEditor(source={}){
    const s=T.sourceInfo(source,record.studyId),box=el('fieldset');box.append(el('legend','根拠 '+(sourceReaders.length+1)));sourceArea.append(box);let doc=structuredClone(s.document),generation=0;
    const role=select(box,'根拠の役割',[['value','数値の直接出典'],['context','群・時点・単位等の文脈'],['definition','脚注・定義'] ],s.role),title=input(box,'資料名',doc.title),kind=select(box,'資料区分',[['','未記録'],['main','原著'],['supplement','補足'],['correction','訂正'],['other_report','別報告']],doc.role||''),bibliography=input(box,'書誌・著者年',doc.bibliography),doi=input(box,'DOI（取得済みの場合）',doc.doi),identity=el('p');
    const showIdentity=()=>identity.textContent=`ファイル: ${doc.filename||'未指定'}／PDF ${doc.page_count||'?'}ページ／SHA-256: ${doc.sha256||'未記録'}`;showIdentity();box.append(identity);
    const file=input(box,'出典PDFを照合（端末内でhash・ページ数を確認）','','file');file.accept='.pdf,application/pdf';
    const first=s.locations[0]||{},page=input(box,'PDFページ（先頭=1）',first.pdf_page_number,'number'),printedStatus=select(box,'誌面ページの状態',[['known','誌面番号あり'],['none','誌面番号なし'],['unknown','不明／未取得']],first.printed_page_status||'unknown'),printed=input(box,'誌面ページ',first.printed_page_label),section=input(box,'節・段落',first.section),region=input(box,'段・位置説明',first.region),table=input(box,'表番号・表見出し',first.table),figure=input(box,'図番号・図見出し',first.figure),row=input(box,'表の行見出し',first.row_label),column=input(box,'表の列見出し',first.column_label),footnote=input(box,'脚注ラベル',first.footnote);
    const quoteFields=[];for(const [q,label] of [['cell','セルの原文'],['row_header','行見出しの原文'],['column_header','列見出しの原文'],['footnote','脚注の原文'],['text','本文の原文']]){
     const segments=s.quote_segments.filter(x=>x.role===q||q==='text'&&x.role==='existing_evidence');
     (segments.length?segments:[{role:q,text:'',location_index:0}]).forEach((segment,index)=>quoteFields.push({segment,n:input(box,label+(segments.length>1?'（断片 '+(index+1)+'）':''),segment.text,'textarea')}));
    }
    const capture=select(box,'原文の取得方法',[['manual_transcription','手入力転記'],['native_pdf_text','PDFテキストを転記'],['existing_ocr','既存OCR'],['not_recorded','未記録']],s.quote_segments[0]?.capture_method||'manual_transcription'),confirmed=check(box,'この数値専用の原文・群・時点・位置を原著と照合した',false),ocr=check(box,'OCRの場合：原画像と照合した',false);
    file.addEventListener('change',async()=>{const n=++generation;pending++;try{const next=await identifyPdf(file.files[0]);if(n!==generation)return;const match=T.documentMatch(doc,next);doc={...doc,...next,study_id:record.studyId};confirmed.checked=false;showIdentity();if(match==='different_bytes'){error.textContent='同名でも内容の異なるPDFは別版です。旧位置・原文は自動確認しません。新しい原著を再照合してください。';}else error.textContent=match==='same_bytes'?'同じPDFバイト列です（ファイル名が異なっても同一）。':'PDFのSHA-256・サイズ・ページ数を端末内で確認しました。';}catch(e){error.textContent=e.message;}finally{pending--;}});
    sourceReaders.push(()=>({...s,role:role.value,document:{...doc,title:title.value,role:kind.value,bibliography:bibliography.value,doi:doi.value,study_id:record.studyId},locations:[{...first,pdf_page_number:numeric(page.value),printed_page_label:printedStatus.value==='known'?printed.value:null,printed_page_status:printedStatus.value,section:section.value,region:region.value,table:table.value,figure:figure.value,row_label:row.value,column_label:column.value,footnote:footnote.value},...s.locations.slice(1)],quote_segments:[...quoteFields.filter(({n})=>n.value.trim()).map(({segment,n})=>({...segment,text:n.value,capture_method:capture.value,image_verified:capture.value==='existing_ocr'?ocr.checked:null})),...s.quote_segments.filter(q=>!['cell','row_header','column_header','footnote','text','existing_evidence'].includes(q.role))],source_confirmation:{status:confirmed.checked?'confirmed':'not_recorded',actor:reviewer.value}}));
   }
   const sources=old.sources||T.legacySource(record,p,field);(sources.length?sources:[{}]).forEach(sourceEditor);
   button(content,'別ページ・別資料の根拠を追加',()=>{markDirty();sourceEditor({});},error);
   collect=()=>({type:'TRACE_EDIT',pointId:id,field,expectedRevision:record.revision,operationId:crypto.randomUUID(),actor:reviewer.value,reason:reason.value,draft:{...old,reportedValue:reported.value,origin:origin.value==='graph_digitized'?'graph_digitized':origin.value==='direct'?'direct':'derived',selectionReason:selection.value,sources:sourceReaders.map(read=>read())},candidateId:candidates.some(c=>c.id===origin.value)?origin.value:null,applicability:{confirmed:condition.checked,actor:reviewer.value||null,at:new Date().toISOString()}});
  }
  // An in-page prompt also works in embedded browsers without a native JS-dialog bridge.
  const warning=el('div');warning.className='trace-unsaved-warning';warning.setAttribute('role','alert');warning.hidden=true;content.before(warning);
  const clearWarning=()=>{warning.hidden=true;warning.replaceChildren();};
  function askDiscard(action,verb){warning.replaceChildren(el('p','未保存の出典入力があります。現在の対象と入力は保持しています。'));warning.hidden=false;const keep=button(warning,'入力を保持して戻る',clearWarning,error);button(warning,'入力を破棄して'+verb,()=>{clearWarning();action();},error);keep.focus();}
  const blocked=()=>{if(saving||pending){error.textContent=saving?'保存中です。完了するまで対象を切り替えられません。':'PDFの照合中です。完了するまで対象を切り替えられません。';return true;}return false;};
  choice.addEventListener('change',()=>{const requested=choice.value;choice.value=activeKey;if(blocked())return;const change=()=>{choice.value=requested;paint();};if(dirty)askDiscard(change,'切り替える');else{clearWarning();change();}});
  const close=()=>{if(blocked())return;if(dirty)askDiscard(()=>d.close(),'閉じる');else d.close();};d.addEventListener('cancel',e=>{e.preventDefault();close();});
  if(options.length)paint();else{choice.disabled=true;error.textContent='このカードに出典確認できる数値がありません。';}
  const save=button(d,'補記を保存して再確認に戻す',async()=>{if(blocked())return;if(!isCurrent(record.id))throw Error('研究が切り替わりました。');const action=collect();saving=true;choice.disabled=true;content.inert=true;try{await perform(action);dirty=false;d.close();}finally{saving=false;choice.disabled=false;content.inert=false;}},error);save.disabled=!options.length;
  button(d,'キャンセル',close,error);return d;
 }
 async function exportDialog({all,base,projectId,projectLabel,pending,editRecord,analysisDialog}){
  const d=dialog('採用データ＋出典をCSV保存'),error=el('p');error.setAttribute('role','status');d.append(el('p','引継ぎ用です。数値のすぐ右に専用の根拠を記録します。GIVのSource_Arm_A/Bは原著の対比順です（レビューI/Cではありません）。値と符号は保持します。出典completeは記録要件の充足であり、原著の正確性や実研究者の承認を保証しません。'),error);
  if(analysisDialog)button(d,'解析用CSV（数値列）を開く',()=>{d.close();return analysisDialog();},error);
  const initial=preferredFormat(await all(),base,projectId);
  const format=select(d,'出典付きCSVの形式',[['master','Master（採用済み全値の引継ぎ）'],['continuous','Continuous pairwise'],['binary','Binary pairwise'],['giv','Generic inverse variance']],initial);
  d.append(el('p',initial==='master'?'異なる型が混在する場合は、全採用値を保持するMasterを初期表示します。':'採用済みデータの型に合わせて形式を選択しています。必要な場合だけ変更できます。'));
  const filename=el('p'),saveHint=el('p');filename.className='csv-save-filename';saveHint.textContent=typeof window.showSaveFilePicker==='function'?'保存ボタンで保存先を選びます。画面が出ない環境では「ダイアログなしでダウンロード」を使えます。':'このブラウザでは保存先選択画面を使わずダウンロードします。通常は「ダウンロード」フォルダーに保存されます。';
  d.append(filename,saveHint);
  const allow=check(d,'不足を明示して採用済み全件を書き出す（引継ぎ記録は未完了）',false),count=el('p'),issues=el('div'),preview=el('pre'),table=el('div'),rawFold=el('details'),fallback=el('textarea');preview.className='accepted-csv-text';preview.setAttribute('aria-label','出典付きCSV全文プレビュー');preview.tabIndex=0;fallback.hidden=true;fallback.readOnly=true;fallback.setAttribute('aria-label','出典付きCSV手動コピー');rawFold.append(el('summary','CSV全文・監査情報を表示（保存時はすべて含みます）'),preview);d.append(count,issues,table,rawFold,fallback);
  let snapshot=null,records=null;const controls=[];
  const invalidate=message=>{snapshot=null;preview.textContent='';table.replaceChildren();fallback.value='';controls.forEach(b=>b.disabled=true);if(message)error.textContent=message;};
  async function build(){invalidate();const state=pending();if(state.busy||state.drafts||state.error)throw Error('未保存の修正・保存失敗があります。先に保存状態を確認してください。');records=await all();snapshot=T.buildApprovedWithSourcesRows(records,base,{projectId,format:format.value,allowIncomplete:allow.checked,pending:pending()});
   filename.textContent='ファイル名：'+exportName(snapshot);
   const n=snapshot.summary;count.textContent=`採用済み対象 ${n.acceptedRows}行／追跡情報完備 ${n.completeRows}行／出典不足 ${n.incompleteRows}行／版不一致・未保存 ${n.staleOrUnsavedRows}行／解析条件による保留 ${n.analysisGatedRows||0}行／数値 ${n.numericCells}セル`;
   issues.replaceChildren();for(const x of snapshot.issues){const p=el('p',`${x.resultId||''} ${x.field||''} ${x.path||''}: ${x.code} — ${x.message}`);issues.append(p);}
   if(snapshot.summary.incompleteRows&&editRecord)button(issues,'出典を確認・補記',()=>{d.close();return editRecord(records.find(r=>r.project.id===projectId));},error);
   preview.textContent=snapshot.csv;renderExportTable(table,snapshot);error.textContent=snapshot.error||(snapshot.blocked?'出力前検査を確認してください。出典不足は明示出力を選択できます。版不一致・未保存は再確認が必要です。':'');controls.forEach(b=>b.disabled=snapshot.blocked||!snapshot.rows.length);
  }
  function exportName(s){return safeFilename((projectLabel||'Review')+'_approved_with_sources_'+s.exportedAt.slice(0,10).replaceAll('-','')+'_'+s.format+'.csv');}
  async function output(kind){if(!snapshot||snapshot.blocked||!snapshot.rows.length)return;const state=pending();if(state.busy||state.drafts||state.error)throw Error('未保存の変更があるため出力できません。');const expected=snapshot,destination=kind==='save'?await prepareSave(exportName(expected)):null;if(kind==='save'&&!destination){error.textContent='保存をキャンセルしました。採用データは変更していません。';return;}const latest=await all();if(snapshot!==expected)return;const signature=JSON.stringify(latest.map(r=>[r.id,r.revision]).sort()),checked=T.buildApprovedWithSourcesRows(latest,base,{projectId,format:expected.format,allowIncomplete:allow.checked,exportId:expected.exportId,exportedAt:expected.exportedAt,pending:pending()});if(checked.blocked){invalidate(checked.error||checked.issues.find(x=>x.blocking)?.message||'出力前検査に失敗しました。');return;}if(signature!==expected.datasetSignature||checked.csv!==expected.csv){invalidate('別のタブ等で数値・出典・保存内容が変わりました。プレビューを更新してください。');return;}
   if(kind==='save'||kind==='download')error.textContent=await download(checked.csv,exportName(expected),d,destination||{name:exportName(expected)});else{await copyCSV(checked.csv,fallback);error.textContent='出典付きCSV全文をコピーしました。';}
  }
  controls.push(button(d,'出典付きCSVを保存',()=>output('save'),error),button(d,'出典付きCSVをコピー',()=>output('copy'),error),button(d,'ダイアログなしでダウンロード',()=>output('download'),error));
  button(d,'プレビューを更新',build,error);button(d,'閉じる',()=>d.close(),error);
  for(const n of [format,allow])n.addEventListener('change',()=>build().catch(e=>{invalidate(e.message);}));
  await build();return d;
 }
 return Object.freeze({editDialog,exportDialog,identifyPdf,fieldOptions,initialField,preferredFormat,prepareSave,download,renderExportTable});
})();
