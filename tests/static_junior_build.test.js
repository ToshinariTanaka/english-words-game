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
  for (const file of ['index.html','style.css','script.js','parser.mjs']) {
    assert.equal(fs.existsSync(path.join(output, 'admin','junior-data',file)), true);
  }
  const routes = JSON.parse(fs.readFileSync(path.join(output,'_routes.json'),'utf8'));
  assert.deepEqual(routes.include,['/api/*']);
  assert.deepEqual(routes.exclude,[]);
});

test('uses current application scoring logic with Render APIs disabled in static preview', () => {
  const js = fs.readFileSync(path.join(output, 'script.js'), 'utf8');
  assert.doesNotThrow(() => new vm.Script(js, { filename: 'static-junior/script.js' }));
  assert.match(js, /const STATIC_JUNIOR_PREVIEW = true;/);
  assert.match(js, /const response = await fetch\('\/api\/questions\/current\?mode='/);
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

test('shared-device statistics are partitioned by verified student ID without erasing anonymous history',()=>{
  const source=fs.readFileSync(path.join(output,'script.js'),'utf8');
  const snippet=source.slice(source.indexOf('const MODES ='),source.indexOf('function setLoadingState'));
  const store=new Map();
  const box={console,localStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)},window:{UpJuniorStudent:{studentId:null},location:{origin:'http://localhost',hostname:'localhost'},confirm:()=>true},document:{querySelectorAll:()=>[],getElementById:()=>({})}};
  vm.createContext(box);vm.runInContext(snippet+';this.read=readStudyCounts;this.add=incrementStudyCount;this.stat=getLearningStat;this.record=updateLearningStat;',box);
  box.add();box.window.UpJuniorStudent.studentId='DUMMY001';assert.equal(box.read().total,0);box.add();box.add();box.record({questionKey:'w000001'},true);
  box.window.UpJuniorStudent.studentId='DUMMY002';assert.equal(box.read().total,0);assert.equal(box.stat({questionKey:'w000001'}).total_correct,0);box.add();
  box.window.UpJuniorStudent.studentId='DUMMY001';assert.equal(box.read().total,2);assert.equal(box.stat({questionKey:'w000001'}).total_correct,1);
  box.window.UpJuniorStudent.studentId=null;assert.equal(box.read().total,1);
});
