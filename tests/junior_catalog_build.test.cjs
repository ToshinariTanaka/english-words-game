const {test} = require('node:test');
const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const {JSDOM} = require('jsdom');
const {build} = require('../scripts/build-static-junior');

test('built UI filters full catalog, combines flags and levels, and clears empty sessions', () => {
  build();
  const dom = new JSDOM(readFileSync('dist-junior/index.html', 'utf8'), {url:'https://student.test', runScripts:'outside-only'});
  const w = dom.window;
  let stops = 0;
  w.HTMLElement.prototype.scrollIntoView = () => {};
  w.speechSynthesis = {cancel(){}, getVoices:()=>[], addEventListener(){}};
  w.UpJuniorAudio = {stop(){stops++;}, showQuestion(){}};
  const source = readFileSync('dist-junior/script.js', 'utf8');
  w.eval(source.slice(0, source.indexOf('\nasync function initApp()')) + `
    autoSpeakEnabled=false; soundEnabled=false;
    setupLevelRangeSetting(); setupSharedCatalog();
    window.catalogTest={
      load:(rows,mode='word')=>{ state.mode=mode; applyQuestions(rows,'fixture'); },
      keys:()=>state.questions.map(q=>q.questionKey).sort().join(','),
      pool:()=>state.questionPool.length,
      current:()=>state.currentQuestion,
      mistakes:()=>state.mistakes.length,
      miss:()=>{state.mistakes.push(state.currentQuestion);},
    };
  `);
  const d = w.document, api = w.catalogTest;
  const rows = ['A1','A2','B1'].map((level,i)=>({level,question:'word '+i, correct:'意味',choice1:'別',choice2:'他',choice3:'異',question_key:'w00000'+(i+1),target1800:i===1?'0':'1'}));
  const change = (id,value) => {d.getElementById(id).value=value;d.getElementById(id).dispatchEvent(new w.Event('change'));};
  try {
    d.getElementById('questionCount').value='all';
    api.load(rows);
    assert.equal(api.pool(),3);
    d.getElementById('catalogJunior').click();
    assert.equal(api.keys(),'w000001,w000002');
    assert.equal(api.pool(),3);
    change('catalogScope','target1800');
    assert.equal(api.keys(),'w000001');
    change('levelEnd','C2');
    assert.equal(api.keys(),'w000001,w000003');
    api.miss(); const priorStops=stops;
    change('levelStart','C1');
    assert.equal(api.keys(),''); assert.equal(api.current(),null);
    assert.equal(api.mistakes(),0); assert.ok(stops>priorStops);
    assert.equal(d.getElementById('choices').children.length,0);
    assert.equal(d.getElementById('startQuizButton').disabled,true);
    d.getElementById('catalogAll').click();
    assert.equal(api.keys(),'w000001,w000002,w000003');
    change('catalogScope','target1800');
    api.load(rows.map(({target1800,...row})=>row));
    assert.equal(api.keys(),''); assert.equal(api.current(),null);
    assert.match(d.getElementById('questionText').textContent,/対象フラグ/);
    api.load(rows.map((row,i)=>({...row,question_key:'c00000'+(i+1)})), 'chunk');
    assert.equal(api.keys(),'c000001,c000002');
    assert.equal(api.pool(),3);
  } finally {w.close();}
});
