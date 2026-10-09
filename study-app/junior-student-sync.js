// Optional student sign-in on the junior *test* app. No private passwords in
// localStorage; sessions are HttpOnly same-site cookies issued by Pages Functions.
// Logging in is optional until D1 is provisioned and pilot testing is complete.
(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const state = {studentId:null,mustChange:false,questionSince:0,visibleSince:0,queued:[],sending:false};
  const fields = {
    panel: $('juniorStudentPanel'),
    id: $('juniorStudentId'),
    password: $('juniorStudentPassword'),
    submit: $('juniorStudentLogin'),
    logout: $('juniorStudentLogout'),
    change: $('juniorStudentChange'),
    current: $('juniorStudentCurrentPassword'),
    replacement: $('juniorStudentNewPassword'),
    status: $('juniorStudentStatus'),
    secretSection: $('juniorStudentLoginFields'),
    changeSection: $('juniorStudentChangeFields'),
  };
  if (!fields.panel) return;
  function status(message) {fields.status.textContent = message;}
  function showLoginUi() {
    fields.secretSection.hidden=Boolean(state.studentId);
    fields.changeSection.hidden=!(state.studentId&&state.mustChange);
    fields.logout.hidden=!state.studentId;
    fields.id.disabled=Boolean(state.studentId);
  }
  async function api(path, body) {
    let response;
    try {
      response=await fetch('/api/student/'+path,{
        method:body===undefined?'GET':'POST',
        headers:body===undefined?undefined:{'Content-Type':'application/json'},
        credentials:'same-origin',cache:'no-store',
        body:body===undefined?undefined:JSON.stringify(body),
      });
    } catch {
      throw new Error('通信できません。接続状況を確認してください。');
    }
    let data;
    try {data=await response.json();}
    catch {throw new Error('サーバーの応答を読み取れませんでした。');}
    if (!response.ok||!data.ok) throw new Error(data.error||'操作を完了できませんでした。');
    return data;
  }
  async function initialize() {
    try {
      const data=await api('me');
      state.studentId=data.studentId;
      state.mustChange=Boolean(data.mustChangePassword);
      status(state.mustChange?'初回パスワードを変更してください。':
        'ログイン中：'+data.studentId+'。学習記録は塾長と共有されます。');
    } catch {
      state.studentId=null;
      status('未ログイン：問題演習はできますが、塾長への学習履歴送信は行いません。');
    }
    showLoginUi();
  }
  async function signIn() {
    const id=fields.id.value.trim();
    const password=fields.password.value;
    fields.submit.disabled=true;
    try {
      const result=await api('login',{studentId:id,password});
      state.studentId=result.studentId;
      state.mustChange=Boolean(result.mustChangePassword);
      fields.password.value='';
      status(state.mustChange?'初回パスワードを変更してください。':
        'ログインしました。正誤・問題数・推定学習時間を記録します。');
      showLoginUi();
    } catch(error) {status(error.message);}
    finally {fields.submit.disabled=false;}
  }
  async function changePassword() {
    if (!state.studentId||!state.mustChange) return;
    fields.change.disabled=true;
    try {
      await api('change-password',{
        currentPassword:fields.current.value,newPassword:fields.replacement.value,
      });
      state.mustChange=false;
      fields.current.value='';
      fields.replacement.value='';
      status('パスワードを変更しました。学習履歴を記録できます。');
      showLoginUi();
    } catch(error) {status(error.message);}
    finally {fields.change.disabled=false;}
  }
  async function signOut() {
    try {await api('logout',{});}
    catch {status('サーバーに接続できません。ログアウトを確認してください。');return;}
    state.studentId=null;
    state.mustChange=false;
    state.queued=[];
    fields.password.value='';
    status('ログアウトしました。以降の解答は塾長に送信されません。');
    showLoginUi();
  }
  function questionShown() {
    state.questionSince=performance.now();
    state.visibleSince=document.visibilityState==='visible'?state.questionSince:0;
  }
  document.addEventListener('visibilitychange',()=>{
    if (document.visibilityState==='hidden') state.visibleSince=0;
    else state.visibleSince=performance.now();
  });
  async function flush() {
    if (state.sending||!state.queued.length||!state.studentId||state.mustChange) return;
    state.sending=true;
    const batch=state.queued.slice(0,40);
    try {
      await api('attempts',{attempts:batch});
      state.queued.splice(0,batch.length);
      status('ログイン中：'+state.studentId+'。解答記録をクラウドに保存しました。');
    } catch(error) {
      status('学習記録をまだ送信できません：'+error.message+'（このページを閉じる前に再試行してください）');
    } finally {state.sending=false;}
  }
  function recordAnswer({mode,questionKey,correct}) {
    const now=performance.now();
    const activeMs=state.visibleSince>0&&state.questionSince>0
      ?Math.round(Math.max(0,Math.min(120000,now-Math.max(state.questionSince,state.visibleSince)))):0;
    state.questionSince=0;
    if (!state.studentId||state.mustChange) return;
    if (!/^[wcps]\d{6}$/.test(String(questionKey))||!crypto.randomUUID) return;
    state.queued.push({
      eventId:crypto.randomUUID(),mode,questionKey,correct:Boolean(correct),activeMs,
    });
    // Pilot: keep a bounded in-memory retry queue; no PII/passwords stored in browser storage.
    if (state.queued.length>200) state.queued.splice(0,state.queued.length-200);
    void flush();
  }
  fields.submit.addEventListener('click',()=>void signIn());
  fields.change.addEventListener('click',()=>void changePassword());
  fields.logout.addEventListener('click',()=>void signOut());
  $('juniorStudentRetry').addEventListener('click',()=>void flush());
  window.UpJuniorStudent={questionShown,recordAnswer};
  showLoginUi();
  void initialize();
})();
