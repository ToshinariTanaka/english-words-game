(() => {
  'use strict';
  const $=id=>document.getElementById(id);
  if (!$('juniorStudentPanel')) return;
  const queue=window.UpJuniorQueue.create(window.indexedDB);
  const state={studentId:null,mustChange:false,question:false,visibleSince:null,activeMs:0,sending:false,busy:false,persisting:0,memory:new Map(),timer:null,failures:0};
  const fields={id:$('juniorStudentId'),password:$('juniorStudentPassword'),submit:$('juniorStudentLogin'),logout:$('juniorStudentLogout'),change:$('juniorStudentChange'),current:$('juniorStudentCurrentPassword'),replacement:$('juniorStudentNewPassword'),status:$('juniorStudentStatus'),sync:$('juniorStudentSyncStatus'),secretSection:$('juniorStudentLoginFields'),changeSection:$('juniorStudentChangeFields')};
  const status=message=>{fields.status.textContent=message;};
  const syncStatus=message=>{fields.sync.textContent=message;};
  function showLoginUi() {
    fields.secretSection.hidden=Boolean(state.studentId);
    fields.changeSection.hidden=!(state.studentId&&state.mustChange);
    fields.logout.hidden=!state.studentId;
    fields.submit.disabled=state.busy;
    fields.logout.disabled=state.busy;
    fields.change.disabled=state.busy;
  }
  async function api(path,body) {
    let response;
    try {response=await fetch('/api/student/'+path,{method:body===undefined?'GET':'POST',headers:body===undefined?undefined:{'Content-Type':'application/json'},credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(15000),body:body===undefined?undefined:JSON.stringify(body)});}
    catch {throw new Error('通信できません。接続回復後に再送します。');}
    let data;try {data=await response.json();}catch {throw new Error('サーバーの応答を読み取れませんでした。');}
    if (!response.ok||!data.ok) {const e=new Error(data.error||'操作を完了できませんでした。');e.status=response.status;throw e;}
    return data;
  }
  function adopt(data) {
    state.studentId=data.studentId;state.mustChange=Boolean(data.mustChangePassword);
    status(state.mustChange?'初回パスワードを変更してください。':'ログイン中：'+state.studentId+'。学習記録は塾長と共有されます。');
    showLoginUi();window.dispatchEvent(new Event('up-junior-student-changed'));void flush();
  }
  async function initialize() {
    state.busy=true;showLoginUi();
    try {adopt(await api('me'));}catch {state.studentId=null;status('未ログイン：問題演習はできます。記録の共有・未送信分の再送にはログインしてください。');}
    finally {state.busy=false;showLoginUi();}
  }
  async function signIn() {
    if(state.busy)return;state.busy=true;showLoginUi();
    try {adopt(await api('login',{studentId:fields.id.value.trim(),password:fields.password.value}));}
    catch(e){status(e.message);}finally {fields.password.value='';state.busy=false;showLoginUi();}
  }
  async function changePassword() {
    if(state.busy||!state.studentId)return;state.busy=true;showLoginUi();
    try {await api('change-password',{currentPassword:fields.current.value,newPassword:fields.replacement.value});state.mustChange=false;status('パスワードを変更しました。学習履歴を記録できます。');void flush();}
    catch(e){status(e.message);}finally {fields.current.value='';fields.replacement.value='';state.busy=false;showLoginUi();}
  }
  async function signOut() {
    if(state.busy)return;state.busy=true;showLoginUi();
    try {
      await flush();await api('logout',{});
      state.studentId=null;state.mustChange=false;clearTimeout(state.timer);window.dispatchEvent(new Event('up-junior-student-changed'));
      status('ログアウトしました。未送信記録は端末に残り、元の生徒がログインしたときに再送します。');
      syncStatus('この端末を共用する場合は、次の生徒が自分のIDでログインしてください。');
    }catch(e){status('ログアウトできませんでした。'+e.message);}finally {state.busy=false;showLoginUi();}
  }
  function pauseClock() {
    if(state.question&&state.visibleSince!==null)state.activeMs+=Math.max(0,performance.now()-state.visibleSince);
    state.visibleSince=null;
  }
  function questionShown() {state.question=true;state.activeMs=0;state.visibleSince=document.visibilityState==='visible'?performance.now():null;}
  document.addEventListener('visibilitychange',()=>{pauseClock();if(document.visibilityState==='visible'){if(state.question)state.visibleSince=performance.now();void flush();}});
  function schedule() {
    clearTimeout(state.timer);
    state.timer=setTimeout(()=>void flush(),Math.min(60000,2000*2**Math.min(state.failures,5)));
  }
  async function flush() {
    if(state.sending||!state.studentId||state.mustChange)return;
    state.sending=true;clearTimeout(state.timer);const owner=state.studentId;
    let failed=false;
    try {
      // Persist any answers for which IndexedDB previously failed before retrying.
      for(const [key,item] of state.memory){await queue.put(item.studentId,item.attempt);state.memory.delete(key);}
      while(state.studentId===owner&&!state.mustChange) {
        const all=await queue.list(owner);
        if(!all.length){syncStatus('未送信 0件｜学習記録はクラウドに保存されています。');state.failures=0;break;}
        syncStatus('未送信 '+all.length+'件｜送信しています…');
        const batch=all.slice(0,40).map(({studentId,...a})=>a);
        const result=await api('attempts',{studentId:owner,attempts:batch});
        const expected=new Set(batch.map(a=>a.eventId));
        const ids=result.acknowledgedEventIds;
        if(!Array.isArray(ids)||ids.length!==batch.length||ids.some(id=>!expected.has(id))||new Set(ids).size!==ids.length)throw new Error('保存確認が不完全です。記録を残して再送します。');
        await queue.acknowledge(owner,ids);state.failures=0;
      }
    }catch(e){
      failed=true;state.failures++;
      if([401,403,409].includes(e.status)){state.studentId=null;state.mustChange=false;status('記録を残して停止しました。元の生徒IDで再ログインしてください。');showLoginUi();window.dispatchEvent(new Event('up-junior-student-changed'));}
      syncStatus('未送信の記録があります。'+e.message+(state.memory.size?' 端末保存にも失敗しています。このページを閉じないでください。':''));
    }finally {state.sending=false;if(failed&&state.studentId)schedule();}
  }
  async function recordAnswer({mode,questionKey,correct}) {
    pauseClock();const activeMs=Math.round(Math.min(120000,state.activeMs));state.question=false;
    if(!state.studentId||state.mustChange||!/^([wcps])\d{6}$/.test(String(questionKey))||!crypto.randomUUID)return;
    const owner=state.studentId;
    const attempt={eventId:crypto.randomUUID(),mode,questionKey,correct:Boolean(correct),activeMs,occurredAtMs:Date.now()};
    // Capture ownership before the first await; a logout must never transfer it.
    const key=owner+':'+attempt.eventId;state.memory.set(key,{studentId:owner,attempt});state.persisting++;
    try {await queue.put(owner,attempt);state.memory.delete(key);syncStatus('解答をこの端末に保存しました。');}
    catch {syncStatus('端末に保存できません。このページを閉じずに「再送信」を押してください。');}
    finally {state.persisting--;void flush();}
  }
  window.addEventListener('online',()=>void flush());
  window.addEventListener('beforeunload',e=>{if(state.memory.size||state.persisting){e.preventDefault();e.returnValue='';}});
  // Resume retries even if the network failed without an online event.
  setInterval(()=>void flush(),60000);
  fields.submit.addEventListener('click',()=>void signIn());
  fields.password.addEventListener('keydown',e=>{if(e.key==='Enter')void signIn();});
  fields.change.addEventListener('click',()=>void changePassword());
  fields.logout.addEventListener('click',()=>void signOut());
  $('juniorStudentRetry').addEventListener('click',()=>void flush());
  window.UpJuniorStudent={questionShown,recordAnswer,get studentId(){return state.studentId;},ready:null};
  showLoginUi();window.UpJuniorStudent.ready=initialize();
})();
