const fs = require('fs');
const assert = require('assert');

const source = fs.readFileSync('study-app/script.js', 'utf8');

assert.match(source, /currentQuestion:\s*null/, 'state keeps an explicit currentQuestion');
assert.match(source, /function startReview\(\) \{[\s\S]*state\.questions = shuffle\(state\.mistakes\)\.map\(cloneQuestionForSession\);[\s\S]*state\.currentQuestion = state\.questions\[0\] \|\| null;[\s\S]*showQuestion\(\);/m, 'startReview builds review questions, sets currentQuestion, and uses normal rendering');
assert.doesNotMatch(source.match(/function startReview\(\) \{[\s\S]*?\n\}/m)[0], /state\.mistakes\s*=\s*\[\]/, 'startReview must not clear all mistakes before answering review questions');
assert.match(source, /function answer\(choice\) \{[\s\S]*if \(state\.reviewMode && isCorrect\) \{[\s\S]*removeMistake\(current\);[\s\S]*\}/m, 'review-mode correct answers remove the item from the mistake list');
assert.match(source, /function showQuestion\(\) \{[\s\S]*state\.currentQuestion = current \|\| null;[\s\S]*els\.questionText\.textContent = current\.question;[\s\S]*current\.choices\.forEach/m, 'showQuestion synchronizes currentQuestion and renders question text and choices');
assert.match(source, /function addMistake\(question\) \{[\s\S]*if \(!hasMistake\(question\)\) state\.mistakes\.push\(question\);[\s\S]*\}/m, 'normal mode adds unique mistakes only');

console.log('tests_study_app_mistake_review: OK');
