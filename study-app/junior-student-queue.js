// One IndexedDB record per answer. Transactional writes avoid cross-tab overwrites.
// Contains pseudonymous IDs + answers only; never passwords or session tokens.
(function(root) {
  'use strict';
  function create(indexedDB) {
    let connection;
    function open() {
      if (!connection) connection=new Promise((resolve,reject)=>{
        if (!indexedDB) {reject(new Error('端末の保存領域を利用できません。'));return;}
        const request=indexedDB.open('up-junior-learning-outbox',1);
        request.onupgradeneeded=()=>{const store=request.result.createObjectStore('attempts',{keyPath:['studentId','eventId']});store.createIndex('studentId','studentId');};
        request.onsuccess=()=>resolve(request.result);
        request.onerror=()=>reject(request.error);
        request.onblocked=()=>reject(new Error('保存領域が使用中です。他のタブを閉じてください。'));
      }).catch(error=>{connection=null;throw error;});
      return connection;
    }
    async function transaction(mode,act) {
      const db=await open();
      return new Promise((resolve,reject)=>{
        const tx=db.transaction('attempts',mode);let result;
        tx.oncomplete=()=>resolve(result);
        tx.onabort=tx.onerror=()=>reject(tx.error||new Error('端末への保存に失敗しました。'));
        act(tx.objectStore('attempts'),value=>{result=value;});
      });
    }
    return {
      put(studentId,attempt){return transaction('readwrite',store=>store.put({...attempt,studentId}));},
      list(studentId){return transaction('readonly',(store,set)=>{const r=store.index('studentId').getAll(studentId);r.onsuccess=()=>set(r.result.sort((a,b)=>a.occurredAtMs-b.occurredAtMs));});},
      acknowledge(studentId,ids){return transaction('readwrite',store=>{for(const id of ids)store.delete([studentId,id]);});},
      async close(){if(connection)(await connection).close();connection=null;},
    };
  }
  root.UpJuniorQueue={create};
})(typeof window==='undefined'?globalThis:window);
