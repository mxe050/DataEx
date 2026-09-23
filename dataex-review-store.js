/* IndexedDB stores complete study snapshots and human decisions; PDF bytes stay in memory. */
window.DataExReviewStore=(()=>{
 const DB='dataex-review-workspace', TABLE='studies';let opening;
 function open(){return opening||=(new Promise((resolve,reject)=>{const q=indexedDB.open(DB,2);q.onupgradeneeded=()=>{if(!q.result.objectStoreNames.contains(TABLE))q.result.createObjectStore(TABLE,{keyPath:'id'});if(!q.result.objectStoreNames.contains('workflowCatalogs'))q.result.createObjectStore('workflowCatalogs',{keyPath:'reviewId'});};q.onerror=()=>reject(q.error);q.onblocked=()=>reject(Error('別タブのデータベース接続を閉じてください。'));q.onsuccess=()=>{q.result.onversionchange=()=>{q.result.close();opening=null;};resolve(q.result);};})).catch(e=>{opening=null;throw e;});}
 function recordContent(record){if(!record)return window.DataExOutcomeWorkflow.stable(record);const {workflowCatalog,...data}=record;return window.DataExOutcomeWorkflow.stable(data);}
 async function get(id){const db=await open();return new Promise((resolve,reject)=>{const q=db.transaction(TABLE).objectStore(TABLE).get(id);q.onsuccess=()=>resolve(q.result||null);q.onerror=()=>reject(q.error);});}
 async function all(){const db=await open();return new Promise((resolve,reject)=>{const tx=db.transaction([TABLE,'workflowCatalogs']),q=tx.objectStore(TABLE).getAll(),c=tx.objectStore('workflowCatalogs').getAll();tx.oncomplete=()=>{q.result.catalogs=c.result;resolve(q.result);};tx.onabort=()=>reject(tx.error);});}
 async function commitBatch({reviewId,expectedCatalogRevision,expectedRecords,expectedContents={},records,catalog,guard=()=>{}}){
  const db=await open();guard();return new Promise((resolve,reject)=>{const tx=db.transaction([TABLE,'workflowCatalogs'],'readwrite'),st=tx.objectStore(TABLE),ct=tx.objectStore('workflowCatalogs');let failure,old,cat;
   const abort=e=>{failure=e;tx.abort();};tx.oncomplete=()=>resolve({records,catalog});tx.onabort=()=>reject(failure||tx.error||Error('保存失敗：取り込み・採用表は一件も変更していません。'));
   const a=st.getAll(),b=ct.getAll();function commit(){if(!old||!cat)return;try{guard();old.catalogs=cat;const W=window.DataExOutcomeWorkflow,current=W.catalog(old,reviewId);if(current.revision!==expectedCatalogRevision)throw Error('作業の保存版が変わりました。再度プレビューしてください。');
    for(const [id,rev] of Object.entries(expectedRecords))if((old.find(r=>r.id===id)?.revision??-1)!==rev)throw Error('研究の保存版が変わりました。');
    for(const [id,content] of Object.entries(expectedContents))if(recordContent(old.find(r=>r.id===id))!==content)throw Error('同じ保存版の内容が変わりました。保存済み結果を読み直してください。');
    if(catalog.reviewId!==reviewId)throw Error('作業IDが一致しません。');for(const record of records){if(record.project.id!==reviewId)throw Error('別の作業へは登録できません。');st.put(structuredClone(record));}ct.put(structuredClone(catalog));guard();
   }catch(e){abort(e);}}a.onsuccess=()=>{old=a.result;commit();};b.onsuccess=()=>{cat=b.result;commit();};
  });
 }
 async function savePosition(reviewId,recordId,candidateId,guard=()=>{}){const db=await open();return new Promise((resolve,reject)=>{const tx=db.transaction([TABLE,'workflowCatalogs'],'readwrite'),q=tx.objectStore(TABLE).getAll(),k=tx.objectStore('workflowCatalogs').getAll();let error;tx.oncomplete=resolve;tx.onabort=()=>reject(error||tx.error);k.onsuccess=()=>{try{guard();q.result.catalogs=k.result;const c=window.DataExOutcomeWorkflow.catalog(q.result,reviewId);if(c.session.recordId!==recordId)throw Error('表示研究が変わりました。');c.session.candidateId=candidateId;tx.objectStore('workflowCatalogs').put(c);}catch(e){error=e;tx.abort();}};});}
 async function saveView(reviewId,recordId,view){
  const db=await open();return new Promise((resolve,reject)=>{const tx=db.transaction([TABLE,'workflowCatalogs'],'readwrite'),q=tx.objectStore(TABLE).getAll(),k=tx.objectStore('workflowCatalogs').getAll();let failure;tx.oncomplete=resolve;tx.onabort=()=>reject(failure||tx.error);k.onsuccess=()=>{try{q.result.catalogs=k.result;const c=window.DataExOutcomeWorkflow.catalog(q.result,reviewId);if(!q.result.some(r=>r.id===recordId&&r.project.id===reviewId))throw Error('閲覧状態の保存先がありません。');(c.recordViews||={})[recordId]=structuredClone(view);c.revision++;tx.objectStore('workflowCatalogs').put(c);}catch(e){failure=e;tx.abort();}};});
 }
 async function put(record,expectedRevision,expectedContent){
  record=structuredClone(record);if(record.verification)record.verification.savedRevision=record.revision;if(record.csvTrace)record.csvTrace.savedRevision=record.revision;
  const db=await open();return new Promise((resolve,reject)=>{const tx=db.transaction(TABLE,'readwrite'),store=tx.objectStore(TABLE),q=store.get(record.id);let conflict;
   q.onsuccess=()=>{const saved=q.result;if((saved?.revision??-1)!==expectedRevision||(expectedContent&&recordContent(saved)!==expectedContent)){conflict=Error('別のタブで更新されています。Review Workspaceから結果を開き直してください。');tx.abort();return;}try{if(saved?.workflowCatalog)record.workflowCatalog=structuredClone(saved.workflowCatalog);store.put(structuredClone(record));}catch(error){conflict=error;tx.abort();}};
   tx.oncomplete=()=>resolve(record);tx.onerror=()=>reject(tx.error||Error('保存に失敗しました。'));tx.onabort=()=>reject(conflict||tx.error||Error('保存を中断しました。'));
  });
 }
 async function commitImport(record,{expectedMatches,mode,targetId,guard=()=>{}}){
  const captured=structuredClone(record),IO=window.DataExJSONImport;
  if(!['insert','replace','version'].includes(mode))throw Error('登録方法が不正です。');
  const identity={reviewId:captured.project.id,studyId:captured.studyId,extractionId:captured.extractionId};
  const db=await open();guard();
  return new Promise((resolve,reject)=>{
   const tx=db.transaction([TABLE,'workflowCatalogs'],'readwrite'),table=tx.objectStore(TABLE);let failure,result;
   const abort=e=>{failure=e;try{tx.abort();}catch(_){reject(e);}};
   tx.oncomplete=()=>resolve(result);
   tx.onabort=()=>reject(failure||tx.error||Error('登録を取り消しました。変更は保存されていません。'));
   tx.onerror=()=>{failure ||= tx.error;};
   const q=table.getAll();
   q.onsuccess=()=>{try{
    guard();const matches=IO.matching(q.result,identity);
    if(IO.stable(IO.revisions(matches))!==IO.stable(expectedMatches))throw Error('確認後に保存内容が更新されました。JSONを読み込み直して確認してください。');
    if(mode==='insert'&&matches.length)throw Error('既存結果があります。上書きしていません。');
    result=structuredClone(captured);
    if(mode==='replace'){
     const previous=matches.find(r=>r.id===targetId);if(!previous)throw Error('置換対象が見つかりません。');
     const archived=structuredClone(previous);delete archived.importHistory;
     result.id=previous.id;result.revision=previous.revision+1;result.createdAt=previous.createdAt;
     result.importHistory=[...(previous.importHistory||[]),archived];
     result.history=[...previous.history,...result.history];
     if(previous.workflowCatalog)result.workflowCatalog=structuredClone(previous.workflowCatalog);
    }else if(mode==='version')result.id=captured.id+':version:'+crypto.randomUUID();
    if(mode!=='replace'&&q.result.some(r=>r.id===result.id))throw Error('同じ登録IDが存在します。');
    result.registration={method:'LOCAL_JSON',schemaVersion:1,mode,version:mode==='version'?matches.length+1:1,registeredAt:new Date().toISOString()};
    result.history.push({at:result.registration.registeredAt,action:'IMPORT_'+mode.toUpperCase(),target:null,note:'完全な保存済みJSONを登録。AI再実行・Raw変更・自動採用なし。',changes:[]});
    const write=table.put(result);write.onsuccess=()=>{try{guard();}catch(e){abort(e);}};
   }catch(e){abort(e);}};
  });
 }
 async function commitWorkflow(command,updatedRecord=null,guard=()=>{}){
  const db=await open();guard();return new Promise((resolve,reject)=>{
   const tx=db.transaction([TABLE,'workflowCatalogs'],'readwrite'),table=tx.objectStore(TABLE);let failure,result;
   tx.oncomplete=()=>resolve(result);tx.onabort=()=>reject(failure||tx.error||Error('採用と表への追加は保存されませんでした。'));tx.onerror=()=>{failure||=tx.error;};
   const q=table.getAll(),catalogRequest=tx.objectStore('workflowCatalogs').getAll();catalogRequest.onsuccess=()=>{try{guard();q.result.catalogs=catalogRequest.result;if(command.expectedContent&&recordContent(q.result.find(r=>r.id===command.recordId))!==command.expectedContent)throw Error('保存版の内容が変わりました。保存済み結果を読み直してください。');result=window.DataExOutcomeWorkflow.transition(q.result,command,{D:window.DataExDecision,T:window.DataExCSVTrace,updatedRecord});tx.objectStore('workflowCatalogs').put(result.catalog);for(const r of result.records.filter(r=>updatedRecord?.id===r.id)){if(updatedRecord?.id===r.id){if(r.verification)r.verification.savedRevision=r.revision;if(r.csvTrace)r.csvTrace.savedRevision=r.revision;}const put=table.put(r);put.onsuccess=()=>{try{guard();}catch(e){failure=e;tx.abort();}};}}catch(e){failure=e;tx.abort();}};
  });
 }
 async function removeReview(reviewId,{expectedRecords=[],expectedCatalogRevision=null,guard=()=>{}}={}){
  if(typeof reviewId!=='string'||!reviewId)throw Error('削除する作業IDが正しくありません。');
  const db=await open();guard();return new Promise((resolve,reject)=>{
   const tx=db.transaction([TABLE,'workflowCatalogs'],'readwrite'),table=tx.objectStore(TABLE),catalogs=tx.objectStore('workflowCatalogs');let failure,rows,flow;
   const abort=e=>{failure=e;try{tx.abort();}catch(_){reject(e);}};
   tx.oncomplete=()=>resolve({records:rows.filter(r=>r.project?.id===reviewId).length,catalog:!!flow});
   tx.onabort=()=>reject(failure||tx.error||Error('作業を削除できませんでした。保存内容は変更していません。'));
   const a=table.getAll(),b=catalogs.get(reviewId);function commit(){if(!rows||flow===undefined)return;try{guard();const actual=rows.filter(r=>r.project?.id===reviewId).map(r=>[r.id,r.revision]).sort((x,y)=>x[0].localeCompare(y[0]));const expected=structuredClone(expectedRecords).sort((x,y)=>x[0].localeCompare(y[0]));if(JSON.stringify(actual)!==JSON.stringify(expected))throw Error('確認後に作業の保存内容が更新されました。クリア画面を開き直してください。');if(expectedCatalogRevision!==null&&(flow?.revision??0)!==expectedCatalogRevision)throw Error('確認後に解析表・履歴が更新されました。クリア画面を開き直してください。');for(const r of rows)if(r.project?.id===reviewId)table.delete(r.id);catalogs.delete(reviewId);guard();}catch(e){abort(e);}}
   a.onsuccess=()=>{rows=a.result;commit();};a.onerror=()=>abort(a.error);b.onsuccess=()=>{flow=b.result===undefined?null:b.result;commit();};b.onerror=()=>abort(b.error);
  });
 }
 return Object.freeze({saveView,recordContent,get,all,put,savePosition,commitImport,commitWorkflow,commitBatch,removeReview});
})();
