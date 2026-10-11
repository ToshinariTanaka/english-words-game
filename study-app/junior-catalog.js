// Cloudflare build only: these helpers share the study app's lexical state.
// A filter never replaces the full question pool or changes stable question IDs.
function isQuestionInSelectedCatalog(question) {
  if (document.getElementById('catalogScope')?.value !== 'target1800') return true;
  return state.mode === 'word' ? question.target1800 === true : ['A1', 'A2'].includes(question.level);
}

function clearEmptyCatalogSelection() {
  resetSessionStats();
  showEmptyState();
  const message = '選択したレベル・教材条件に合う問題がありません。条件を変更してください。教材フラグを使う場合は、管理画面から対象フラグ付きのExcelを公開してください。';
  els.feedback.hidden = true;
  els.questionText.textContent = message;
  els.settingsStatus.textContent = message;
}

function applySharedCatalogSelection() {
  syncLevelRangeUiWithState();
  saveStoredString(LEVEL_RANGE_START_STORAGE_KEY, els.levelStart.value);
  saveStoredString(LEVEL_RANGE_END_STORAGE_KEY, els.levelEnd.value);
  if (refreshQuestionCountOptionsForLevelRange() > 0) beginConfiguredSession();
  else clearEmptyCatalogSelection();
}

function setupSharedCatalog() {
  const scope = document.getElementById('catalogScope');
  scope.addEventListener('change', applySharedCatalogSelection);
  for (const [id, end] of [['catalogJunior', 'A2'], ['catalogAll', 'C2']]) {
    document.getElementById(id).addEventListener('click', () => {
      scope.value = 'all';
      els.levelStart.value = 'A1';
      els.levelEnd.value = end;
      applySharedCatalogSelection();
    });
  }
}
