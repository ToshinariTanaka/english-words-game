(() => {
  'use strict';
  const $=id=>document.getElementById(id);
  const modes={word:'英単語',chunk:'チャンク',phrase:'文節和訳',definition:'英文和訳'};
  let students=[],selected=null,nextBefore=null,busy=false,secretTimer=null,detailGeneration=0;
  const catalog=new Map();
  const n=v=>Number(v)||0;
  const rate=(correct,answers)=>answers?(100*n(correct)/n(answers)).toFixed(1)+'%':'—';
  const duration=ms=>{const sec=Math.round(n(ms)/1000);return Math.floor(sec/60)+'分'+sec%60+'秒';};
  const when=ms=>ms?new Intl.DateTimeFormat('ja-JP',{timeZone:'Asia/Tokyo',dateStyle:'short',timeStyle:'short'}).format(new Date(n(ms))):'未学習';
  function message(text,error=false){$('message').textContent=text;$('message').className=error?'error':'';}
  function el(tag,text,cls){const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e;}
  function params(extra={}) {const p=new URLSearchParams(extra);if($('from').value)p.set('from',$('from').value);if($('to').value)p.set('to',$('to').value);return p;}
  async function api(path,body) {
    const r=await fetch('/api/admin/students'+path,{method:body===undefined?'GET':'POST',headers:body===undefined?undefined:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),cache:'no-store',credentials:'same-origin',signal:AbortSignal.timeout(20000)});
    const raw=await r.text();let data;
    try{data=JSON.parse(raw);}catch{
      if(/Error\s*1102|error code:\s*1102|Worker exceeded resource limits/i.test(raw))throw new Error('サーバーの処理時間またはメモリの上限に達しました（Cloudflare 1102）。登録状況を一覧で確認し、管理者にお知らせください。');
      throw new Error('サーバーから正常な応答を受け取れませんでした（HTTP '+r.status+'）。ページを再読み込みして登録状況を確認してください。');
    }
    if(!r.ok||!data.ok){
      // Fixed diagnostic identifiers only; never log response bodies or passwords.
      if(['PASSWORD_KDF_LIMIT','PASSWORD_KDF_UNAVAILABLE'].includes(data.code))console.warn('Junior password processing: '+data.code);
      throw new Error(data.error||'操作できませんでした。');
    }return data;
  }
  function metrics(target,items) {const box=$(target);box.replaceChildren();for(const [label,value]of items){const card=el('div',undefined,'metric');card.append(el('span',label,'label'),el('strong',value));box.append(card);}}
  function empty(body,cols,text){const tr=el('tr');const td=el('td',text,'empty');td.colSpan=cols;tr.append(td);body.append(tr);}
  function button(text,action,id,cls=''){const b=el('button',text,cls);b.dataset.action=action;b.dataset.id=id;return b;}
  function renderList() {
    const search=$('search').value.toLowerCase().trim();const shown=students.filter(s=>(s.student_id+' '+s.display_name).toLowerCase().includes(search));
    const answers=shown.reduce((a,s)=>a+n(s.total_answers),0),correct=shown.reduce((a,s)=>a+n(s.total_correct),0);
    metrics('metrics',[['表示中の生徒',shown.length+'人'],['解答数',answers.toLocaleString()+'問'],['正答率',rate(correct,answers)],['推定学習時間',duration(shown.reduce((a,s)=>a+n(s.total_active_ms),0))]]);
    const body=$('students');body.replaceChildren();
    for(const s of shown){const tr=el('tr');const name=el('td');name.append(el('span',s.display_name||s.student_id,'student-name'),el('span',s.student_id,'student-id'));const state=el('td');state.append(el('span',s.status==='disabled'?'利用停止':s.must_change_password?'初回変更待ち':'利用中','badge '+(s.status==='disabled'?'off':s.must_change_password?'wait':'')));tr.append(name,state,el('td',n(s.total_answers).toLocaleString()),el('td',rate(s.total_correct,s.total_answers)),el('td',duration(s.total_active_ms)),el('td',when(s.last_study_ms)));const ops=el('td');const group=el('div',undefined,'actions');group.append(button('詳細','detail',s.student_id),button('パスワード再発行','reset',s.student_id),button(s.status==='disabled'?'利用再開':'利用停止','status',s.student_id,s.status==='disabled'?'':'danger'));ops.append(group);tr.append(ops);body.append(tr);}
    if(!shown.length)empty(body,7,'該当する生徒がいません。下のフォームから登録できます。');
  }
  async function refresh() {try{const d=await api('/summary?'+params());students=d.students;renderList();$('updated').textContent='更新 '+when(d.asOf)+'（日本時間）';message('最新の学習記録を表示しています。');}catch(e){message(e.message,true);}}
  function showSecret(id,password){$('issuedId').value=id;$('issuedPassword').value=password;$('credentials').showModal();clearTimeout(secretTimer);secretTimer=setTimeout(clearSecret,120000);}
  function clearSecret(){clearTimeout(secretTimer);$('issuedId').value='';$('issuedPassword').value='';$('credentials').close();}
  async function mutate(task){if(busy)return;busy=true;document.querySelectorAll('button').forEach(b=>b.disabled=true);try{await task();}catch(e){message(e.message,true);}finally{busy=false;document.querySelectorAll('button').forEach(b=>b.disabled=false);}}
  async function questionLabels(rows) {
    await Promise.all([...new Set(rows.map(r=>r.mode))].map(async mode=>{if(catalog.has(mode))return;try{const r=await fetch('/api/questions/current?mode='+mode,{cache:'no-store',credentials:'same-origin'});const d=await r.json();if(r.ok&&d.ok&&Array.isArray(d.rows))catalog.set(mode,new Map(d.rows.map(q=>[q.question_key,q])));}catch{/* IDs remain useful if R2 unavailable. */}}));
  }
  async function detail(id,append=false) {
    if(append&&!nextBefore)return;const generation=++detailGeneration;const p=params({studentId:id});if(append)p.set('before',nextBefore);
    try {
      const d=await api('/detail?'+p);if(generation!==detailGeneration)return;selected=id;nextBefore=d.nextBefore;$('detail').hidden=false;
      if(!append){$('detailTitle').textContent=(d.student.display_name||id)+' · '+id;metrics('detailMetrics',[['期間内の解答数',d.stats.answers+'問'],['正答率',rate(d.stats.correct,d.stats.answers)],['推定学習時間',duration(d.stats.active_ms)],['最終学習',when(d.stats.last_study_ms)]]);$('history').replaceChildren();$('daily').replaceChildren();for(const row of d.daily){const tr=el('tr');tr.append(el('td',row.day),el('td',row.answers),el('td',rate(row.correct,row.answers)),el('td',duration(row.active_ms)));$('daily').append(tr);}if(!d.daily.length)empty($('daily'),4,'この期間の学習記録はありません。');$('weak').replaceChildren();$('weakNote').textContent=d.weakTruncated?'100問を表示中です。すべての誤答は履歴CSVで確認できます。':'';}
      for(const row of d.history){const tr=el('tr');tr.append(el('td',when(row.occurred_at_ms)),el('td',row.question_key),el('td',modes[row.mode]),el('td',row.is_correct?'○ 正解':'× 不正解'),el('td',duration(row.active_ms)),el('td',when(row.received_at_ms)));$('history').append(tr);}
      if(!append&&!d.history.length)empty($('history'),6,'この期間の解答履歴はありません。');$('more').hidden=!nextBefore;
      if(!append){$('detail').scrollIntoView({behavior:'smooth',block:'start'});await questionLabels(d.weak);if(generation!==detailGeneration)return;for(const row of d.weak){const tr=el('tr'),cell=el('td'),q=catalog.get(row.mode)?.get(row.question_key);cell.append(el('span',q?.question||row.question_key,'student-name'),el('span',(q?'正解：'+q.correct+' ｜ ':'')+row.question_key,'student-id'));tr.append(cell,el('td',modes[row.mode]),el('td',row.mistakes),el('td',rate(row.correct,row.answers)));$('weak').append(tr);}if(!d.weak.length)empty($('weak'),4,'この期間に間違えた問題はありません。');}
    }catch(e){message(e.message,true);}
  }
  async function csv(type,studentId) {
    const p=params({type});if(studentId)p.set('studentId',studentId);message('CSVを作成しています…');
    try{
      const parts=[];let count=0,next=null;
      do {
        const r=await fetch('/api/admin/students/export?'+p,{credentials:'same-origin',cache:'no-store'});
        if(!r.ok||!r.headers.get('Content-Type')?.startsWith('text/csv'))throw new Error('CSVを取得できませんでした。管理者認証を確認し、もう一度出力してください。');
        parts.push(await r.blob());count+=Number(r.headers.get('X-Junior-Row-Count')||0);
        next=r.headers.get('X-Junior-Next-Cursor');
        if(next){p.set('cursor',next);p.set('snapshot',r.headers.get('X-Junior-Snapshot'));message('CSVを作成しています… '+count.toLocaleString()+'件');}
      }while(next);
      const url=URL.createObjectURL(new Blob(parts,{type:'text/csv;charset=utf-8'})),a=el('a');a.href=url;a.download='junior-'+type+(studentId?'-'+studentId:'')+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);message('CSVを出力しました。');
    }catch(e){message(e.message,true);}

  }
  $('students').addEventListener('click',e=>{const b=e.target.closest('button[data-action]');if(!b||busy)return;const id=b.dataset.id,s=students.find(s=>s.student_id===id);if(b.dataset.action==='detail'){void detail(id);return;}if(b.dataset.action==='reset'){if(!confirm(id+' のパスワードを再発行しますか？ すべての端末がログアウトします。'))return;void mutate(async()=>{const d=await api('/reset-password',{studentId:id});await refresh();showSecret(id,d.temporaryPassword);});}else{const value=s.status==='disabled'?'active':'disabled';if(!confirm(id+' を'+(value==='active'?'利用再開':'利用停止（全端末からログアウト）')+'にしますか？ 学習履歴は残ります。'))return;void mutate(async()=>{await api('/change-status',{studentId:id,status:value});await refresh();});}});
  $('createForm').addEventListener('submit',e=>{e.preventDefault();void mutate(async()=>{const d=await api('',{studentId:$('newId').value,displayName:$('newName').value});$('createForm').reset();await refresh();showSecret(d.studentId,d.temporaryPassword);});});
  $('refresh').addEventListener('click',()=>{void refresh();if(selected)void detail(selected);});$('apply').addEventListener('click',()=>{void refresh();if(selected)void detail(selected);});$('allDates').addEventListener('click',()=>{$('from').value='';$('to').value='';void refresh();if(selected)void detail(selected);});$('search').addEventListener('input',renderList);
  $('closeDetail').addEventListener('click',()=>{detailGeneration++;selected=null;$('detail').hidden=true;});$('more').addEventListener('click',()=>void detail(selected,true));
  $('summaryCsv').addEventListener('click',()=>void csv('summary'));$('attemptCsv').addEventListener('click',()=>void csv('attempts'));$('detailCsv').addEventListener('click',()=>void csv('attempts',selected));
  $('closeCredentials').addEventListener('click',clearSecret);$('credentials').addEventListener('close',()=>{$('issuedId').value='';$('issuedPassword').value='';});document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')clearSecret();});
  void refresh();
})();
