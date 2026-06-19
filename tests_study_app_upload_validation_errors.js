const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const source = fs.readFileSync('study-app/script.js', 'utf8');
assert.ok(source.includes("definition: 's'"), 'definition mode question_key prefix remains s');
assert.ok(source.includes('function showUploadValidationErrors'), '専用エラー表示関数を持つ');
assert.ok(source.includes('textContent = String(error)'), 'HTML特殊文字はtextContentで表示する');
assert.ok(!source.includes('escapeHtml('), '未定義のescapeHtml呼び出しを残さない');

function createElement(tagName) {
  return {
    tagName,
    children: [],
    hidden: false,
    className: '',
    id: '',
    textContent: '',
    appendChild(child) { this.children.push(child); return child; },
    insertAdjacentElement(position, element) { document.elements[element.id] = element; return element; },
  };
}

const document = {
  elements: {},
  getElementById(id) { return this.elements[id] || null; },
  createElement,
};
document.elements.uploadStatus = createElement('p');

const snippet = `
const MAX_SHOWN_UPLOAD_ERRORS = 20;
const els = { uploadStatus: document.getElementById('uploadStatus') };
${source.match(/function getOrCreateUploadValidationBox\(\)[\s\S]*?function clearUploadValidationErrors\(\)[\s\S]*?\n}\n/)[0]}
this.showUploadValidationErrors = showUploadValidationErrors;
`;

const sandbox = { document };
vm.createContext(sandbox);
vm.runInContext(snippet, sandbox);

sandbox.showUploadValidationErrors({
  errors: ['<img src=x onerror=alert(1)> & "danger"'],
  errorCount: 1,
  shownErrorCount: 1,
  moreErrorCount: 0,
});

const box = document.getElementById('uploadValidationErrors');
assert.ok(box, 'エラーボックスを生成する');
assert.strictEqual(box.hidden, false);
assert.strictEqual(box.children[1].children[0].textContent, '<img src=x onerror=alert(1)> & "danger"');
assert.strictEqual(box.children[1].children[0].innerHTML, undefined, 'innerHTMLへ危険文字列を書かない');

console.log('tests_study_app_upload_validation_errors: OK');
