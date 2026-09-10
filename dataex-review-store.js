/* IndexedDB stores complete study snapshots and human decisions; PDF bytes stay in memory. */
window.DataExReviewStore=(()=>{
 const DB='dataex-review-workspace', TABLE='studies';let opening;
 function open(){return opening||=(new Promise((resolve,reject)=>{const q=indexedDB.open(DB,1);q.onupgradeneeded=()=>q.result.createObjectStore(TABLE,{keyPath:'id'});q.onerror=()=>reject(q.error);q.onblocked=()=>reject(Error('別タブのデータベース接続を閉じてください。'));q.onsuccess=()=>{q.result.onversionchange=()=>{q.result.close();opening=null;};resolve(q.result);};})).catch(e=>{opening=null;throw e;});}
 async function get(id){const db=await open();return new Promise((resolve,reject)=>{const q=db.transaction(TABLE).objectStore(TABLE).get(id);q.onsuccess=()=>resolve(q.result||null);q.onerror=()=>reject(q.error);});}
 async function all(){const db=await open();return new Promise((resolve,reject)=>{const q=db.transaction(TABLE).objectStore(TABLE).getAll();q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);});}
 async function put(record,expectedRevision){
  const db=await open();return new Promise((resolve,reject)=>{const tx=db.transaction(TABLE,'readwrite'),store=tx.objectStore(TABLE),q=store.get(record.id);let conflict;
   q.onsuccess=()=>{const saved=q.result;if((saved?.revision??-1)!==expectedRevision){conflict=Error('別のタブで更新されています。Review Workspaceから結果を開き直してください。');tx.abort();return;}try{store.put(structuredClone(record));}catch(error){conflict=error;tx.abort();}};
   tx.oncomplete=()=>resolve(record);tx.onerror=()=>reject(tx.error||Error('保存に失敗しました。'));tx.onabort=()=>reject(conflict||tx.error||Error('保存を中断しました。'));
  });
 }
 return Object.freeze({get,all,put});
})();
