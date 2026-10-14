(function (root) {
  'use strict';
  const CHOICES = { nova: 'Nova', ash: 'Ash', random: 'ランダム（Nova／Ash）' };
  const STORAGE = 'englishWordsGame.junior.savedVoice.v1';
  const MODES = ['word', 'chunk', 'phrase', 'definition'];
  const HASH = /^[a-f0-9]{64}$/;

  function createController(host, random = Math.random) {
    const doc = host.document;
    let preference = 'nova', current = null, generation = 0, playback = 0;
    let activeAudio = null, cancelPending = null, retryFallback = false;
    const manifests = new Map();
    const status = text => { const el = doc.getElementById('voiceStatus'); if (el) el.textContent = text; };
    const storageKey = () => STORAGE + ':' + (host.UpJuniorStudent?.studentId || 'anonymous');
    function readPreference() {
      try { const value = host.localStorage.getItem(storageKey()); preference = Object.hasOwn(CHOICES, value) ? value : 'nova'; }
      catch { preference = 'nova'; }
    }
    function choose() { return preference === 'random' ? (random() < 0.5 ? 'nova' : 'ash') : preference; }
    function stop() {
      playback += 1;
      if (cancelPending) { const cancel = cancelPending; cancelPending = null; cancel(); }
      if (activeAudio) {
        activeAudio.pause(); activeAudio.removeAttribute('src'); activeAudio.load(); activeAudio = null;
      }
    }
    function populate() {
      const select = doc.getElementById('voiceSelect');
      if (!select) return;
      select.replaceChildren();
      for (const [value, label] of Object.entries(CHOICES)) {
        const option = doc.createElement('option'); option.value = value; option.textContent = label; select.appendChild(option);
      }
      select.value = preference;
      const count = doc.getElementById('voiceCandidateCount');
      if (count) count.textContent = '保存音声：2種類／ランダムは問題ごとに選択';
    }
    async function manifest(mode) {
      if (!manifests.has(mode)) {
        manifests.set(mode, host.fetch('/api/audio/manifest?mode=' + mode, { cache: 'no-store' })
          .then(async response => {
            if (response.status === 404) return { entries: {} };
            if (!response.ok) throw new Error('manifest');
            const data = await response.json();
            if (data.schema_version !== 1 || data.mode !== mode || !data.entries || typeof data.entries !== 'object') throw new Error('manifest');
            return data;
          }).catch(error => { manifests.delete(mode); throw error; }));
      }
      return manifests.get(mode);
    }
    async function textHash(text) {
      const bytes = new TextEncoder().encode(text.trim().normalize('NFC'));
      const hash = await host.crypto.subtle.digest('SHA-256', bytes);
      return Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, '0')).join('');
    }
    function showQuestion(mode, question) {
      stop(); retryFallback = false;
      const ticket = ++generation;
      current = question ? { mode, key: question.questionKey || question.id, text: String(question.question || ''), voice: choose(), state: 'loading' } : null;
      if (!current) return Promise.resolve();
      const item = current;
      if (!MODES.includes(mode) || !/^[wcps]\d{6}$/.test(item.key || '')) { item.state = 'missing'; return Promise.resolve(); }
      item.ready = Promise.all([manifest(mode), textHash(item.text)]).then(([data, hash]) => {
        if (ticket !== generation) return;
        const entry = data.entries[item.key];
        const asset = entry?.voices?.[item.voice];
        if (entry?.text_sha256 !== hash || !HASH.test(asset?.asset_id || '')) { item.state = 'missing'; return; }
        item.url = '/api/audio/file?mode=' + mode + '&key=' + item.key + '&voice=' + item.voice + '&asset=' + asset.asset_id;
        item.state = 'ready';
      }).catch(() => { if (ticket === generation) item.state = 'unavailable'; });
      return item.ready;
    }
    function setup(cancelOtherAudio) {
      readPreference(); populate();
      const select = doc.getElementById('voiceSelect');
      if (!select || select.dataset.savedAudioSetup) return;
      select.dataset.savedAudioSetup = 'true';
      select.addEventListener('change', () => {
        cancelOtherAudio();
        preference = Object.hasOwn(CHOICES, select.value) ? select.value : 'nova';
        try { host.localStorage.setItem(storageKey(), preference); } catch { /* device storage may be disabled */ }
        if (current) void showQuestion(current.mode, { questionKey: current.key, question: current.text });
        status('音声：' + CHOICES[preference]);
      });
      host.addEventListener('up-junior-student-changed', () => {
        cancelOtherAudio(); generation += 1; current = null;
        readPreference(); populate();
      });
    }
    function play(item, ticket) {
      // play() is called before any await in the manual-click execution path.
      return new Promise(resolve => {
        const audio = new host.Audio(item.url);
        activeAudio = audio;
        audio.preload = 'auto';
        let settled = false;
        const finish = (error, cancelled = false) => {
          if (settled) return;
          settled = true; host.clearTimeout(timer);
          if (cancelPending === cancel) cancelPending = null;
          if (error || cancelled) {
            audio.pause(); audio.removeAttribute('src'); audio.load();
            if (activeAudio === audio) activeAudio = null;
          }
          if (ticket === playback && error) {
            if (error.name === 'NotAllowedError') {
              status('音声ボタンを押して再生してください。');
            } else {
              retryFallback = true; manifests.delete(item.mode);
              status('保存音声を取得できません。もう一度押すと端末音声で読み上げます。');
            }
          }
          resolve(!error && !cancelled);
        };
        const cancel = () => finish(null, true);
        cancelPending = cancel;
        const timer = host.setTimeout(() => finish(new Error('timeout')), 8000);
        audio.addEventListener('error', () => {
          if (!settled) return finish(new Error('audio'));
          if (ticket === playback && activeAudio === audio) {
            audio.pause(); audio.removeAttribute('src'); audio.load(); activeAudio = null;
            retryFallback = true; manifests.delete(item.mode);
            status('音声が中断しました。もう一度押すと端末音声で読み上げます。');
          }
        }, { once: true });
        audio.addEventListener('ended', () => { if (activeAudio === audio) activeAudio = null; }, { once: true });
        try {
          Promise.resolve(audio.play()).then(() => {
            if (ticket === playback && !settled) status('再生音声：' + CHOICES[item.voice] + (preference === 'random' ? '（ランダム）' : ''));
            finish(null);
          }, error => finish(error));
        } catch (error) { finish(error); }
      });
    }
    function speak({ mode, question, manual, fallback }) {
      if (!question?.question) return Promise.resolve(false);
      if (!current || current.mode !== mode || current.key !== (question.questionKey || question.id) || current.text !== String(question.question)) showQuestion(mode, question);
      stop();
      const item = current, ticket = playback;
      const perform = () => {
        if (ticket !== playback || item !== current) return false;
        if (retryFallback || item.state !== 'ready') {
          host.speechSynthesis?.cancel();
          status('保存音声は未準備のため、端末音声を使用します。');
          return fallback();
        }
        host.speechSynthesis?.cancel();
        return play(item, ticket);
      };
      if (item.state === 'loading') {
        if (manual) {
          status('音声の準備中です。少し待ってからもう一度押してください。');
          return Promise.resolve(false);
        }
        return item.ready.then(perform); // Autoplay rejection is shown, never mistaken for missing MP3.
      }
      return Promise.resolve(perform());
    }
    return { setup, populate, showQuestion, speak, stop };
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = { createController };
  else root.UpJuniorAudio = createController(root);
})(typeof window !== 'undefined' ? window : globalThis);
