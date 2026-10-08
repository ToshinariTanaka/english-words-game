'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { build, rewriteJavaScript, rewriteHtml } = require('../scripts/build-static-junior');

const root = path.resolve(__dirname, '..');
const output = path.join(root, 'dist-junior');
const source = path.join(root, 'study-app');
const modes = ['word', 'chunk', 'phrase', 'definition'];

test('builds a static standalone junior preview without changing application sources', () => {
  const originalJs = fs.readFileSync(path.join(source, 'script.js'), 'utf8');
  const originalHtml = fs.readFileSync(path.join(source, 'index.html'), 'utf8');
  build();

  assert.equal(fs.readFileSync(path.join(source, 'script.js'), 'utf8'), originalJs);
  assert.equal(fs.readFileSync(path.join(source, 'index.html'), 'utf8'), originalHtml);
  assert.equal(fs.existsSync(path.join(output, 'index.html')), true);
  assert.equal(fs.existsSync(path.join(output, 'style.css')), true);
  assert.equal(fs.existsSync(path.join(output, 'script.js')), true);
  assert.equal(fs.existsSync(path.join(output, 'robots.txt')), true);
});

test('uses current application scoring logic with Render APIs disabled in static preview', () => {
  const js = fs.readFileSync(path.join(output, 'script.js'), 'utf8');
  assert.doesNotThrow(() => new vm.Script(js, { filename: 'static-junior/script.js' }));
  assert.match(js, /const STATIC_JUNIOR_PREVIEW = true;/);
  assert.match(js, /if \(STATIC_JUNIOR_PREVIEW\) throw new Error\('静的試験版ではローカルのサンプル教材を使います。'\);/);
  assert.match(js, /if \(STATIC_JUNIOR_PREVIEW\) return null;/);
  assert.match(js, /if \(STATIC_JUNIOR_PREVIEW\) throw new Error\('静的試験版はアップロードAPIを使用しません。'\);/);
  assert.match(js, /variant: 'junior-static-preview'/);
  assert.match(js, /updateLearningStat\(current, isCorrect\)/);
  assert.match(js, /incrementStudyCount\(\)/);
  assert.doesNotMatch(js, /https:\/\/english-words-game-1ph3\.onrender\.com/);
});

test('page warns about demo-only local storage and discourages search indexing', () => {
  const html = fs.readFileSync(path.join(output, 'index.html'), 'utf8');
  assert.match(html, /noindex,nofollow/);
  assert.match(html, /実際の塾生データは含みません/);
  assert.match(html, /ほかの端末にも共有されません/);
  assert.match(html, /<script src="\.\/script\.js"><\/script>/);
  assert.doesNotMatch(html, /cdn\.render\.com|onrender\.com/);
});

test('exports four playable demo CSV sources without private Render data', () => {
  for (const mode of modes) {
    const file = path.join(output, 'data', mode + '_mode.csv');
    assert.equal(fs.existsSync(file), true);
    const rows = fs.readFileSync(file, 'utf8').trim().split(/\r?\n/);
    assert.equal(rows.length, 4, mode + ' should have a header and three demo questions');
    for (const row of rows) {
      // Separate on commas that are not inside quoted fields.
      const cols = row.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/);
      assert.equal(cols.length, 13, mode + ' should have 13 CSV columns');
    }
  }
});

test('source drifts fail loudly rather than silently re-enabling APIs', () => {
  assert.throws(() => rewriteJavaScript('broken'), /unexpected source/);
  assert.throws(() => rewriteHtml('broken'), /unexpected source/);
});
