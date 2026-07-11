(() => {
  const originalSpeakCurrentQuestion = window.speakCurrentQuestion;

  function isEnglishNarrationVoice(voice) {
    const lang = String(voice?.lang || '').trim();
    return /^en(?:[-_]|$)/i.test(lang) && !window.isSpecialVoice?.(voice);
  }

  function getLanguagePriority(lang) {
    const normalized = String(lang || '').toLowerCase();
    if (normalized === 'en-us') return 0;
    if (normalized === 'en-gb') return 1;
    if (normalized === 'en-au') return 2;
    if (normalized === 'en-ca') return 3;
    if (normalized.startsWith('en-')) return 4;
    return 5;
  }

  window.filterNarrationVoices = function filterNarrationVoices(voices) {
    return Array.from(voices || []).filter(isEnglishNarrationVoice);
  };

  window.getDisplayVoices = function getDisplayVoices(voices) {
    return window.filterNarrationVoices(voices).sort((left, right) => {
      const priorityDifference = getLanguagePriority(left?.lang) - getLanguagePriority(right?.lang);
      if (priorityDifference !== 0) return priorityDifference;
      return String(left?.name || '').localeCompare(String(right?.name || ''), 'en');
    });
  };

  window.getRecommendedVoices = function getRecommendedVoices(voices) {
    return window.getDisplayVoices(voices);
  };

  window.speakCurrentQuestion = function speakCurrentQuestion(options = {}) {
    const selectedVoiceValue = window.getSelectedVoiceValue?.() || '';
    if (!selectedVoiceValue || typeof originalSpeakCurrentQuestion !== 'function') {
      return originalSpeakCurrentQuestion?.(options);
    }

    window.cancelSpeech?.();
    const statusPrefix = options.statusPrefix || '';
    const selectionLabel = selectedVoiceValue === 'random' ? 'ランダム音声' : '選択音声';
    window.speakCurrentQuestionWithWebSpeech?.(`${statusPrefix}${selectionLabel}`);
    return Promise.resolve();
  };

  const refreshVoiceOptions = () => window.populateVoiceSelect?.();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', refreshVoiceOptions, { once: true });
  } else {
    queueMicrotask(refreshVoiceOptions);
  }
})();
