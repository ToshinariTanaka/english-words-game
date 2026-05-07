const TOOL_VERSION = "wordbook-batch-v0.1.0";

const STATE = { rows: [], headers: [], currentBatch: [] };
const COLUMN_ALIASES = {
  word: ["word", "英単語"],
  meaning: ["meaning", "和訳"],
  level: ["level"],
  chunk: ["chunk"],
  chunk_meaning: ["chunk_meaning"],
  definition: ["definition"],
  definition_meaning: ["definition_meaning"],
  status: ["status"],
  note: ["note"],
  checked_at: ["checked_at"]
};

const REQUIRED_MASTER_COLUMNS = ["word","meaning","level","chunk","chunk_meaning","definition","definition_meaning","status","note","checked_at"];

function normalizeHeader(h) { return (h || "").trim().toLowerCase(); }
function cleanValue(v) { return (v ?? "").toString().trim(); }

function parseCSV(text) {
  const rows = [];
  let i = 0, cell = "", row = [], inQuotes = false;
  while (i < text.length) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i += 2; continue; }
      if (ch === '"') { inQuotes = false; i++; continue; }
      cell += ch; i++; continue;
    }
    if (ch === '"') { inQuotes = true; i++; continue; }
    if (ch === ',') { row.push(cell); cell = ""; i++; continue; }
    if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i+1] === '\n') i++;
      row.push(cell); rows.push(row);
      row = []; cell = ""; i++; continue;
    }
    cell += ch; i++;
  }
  row.push(cell);
  if (row.length > 1 || row[0] !== "") rows.push(row);
  return rows;
}

function toCSV(rows) {
  return rows.map(r => r.map(v => {
    const s = (v ?? "").toString();
    if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  }).join(",")).join("\n");
}

function findKey(headerMap, canonical) {
  const aliases = COLUMN_ALIASES[canonical] || [canonical];
  for (const a of aliases) if (headerMap.has(normalizeHeader(a))) return headerMap.get(normalizeHeader(a));
  return -1;
}

function hydrateRows(matrix) {
  const headers = matrix[0] || [];
  const headerMap = new Map(headers.map((h, i) => [normalizeHeader(h), i]));
  const out = [];
  for (let i = 1; i < matrix.length; i++) {
    const src = matrix[i];
    const obj = { row_number: i + 1 };
    for (const c of REQUIRED_MASTER_COLUMNS) {
      const idx = findKey(headerMap, c);
      obj[c] = idx >= 0 ? (src[idx] ?? "") : "";
    }
    out.push(obj);
  }
  return { headers, out };
}

function renderBatch(rows) {
  const tbody = document.querySelector("#batchTable tbody");
  tbody.innerHTML = "";
  for (const r of rows) {
    const tr = document.createElement("tr");
    const cols = ["row_number","word","meaning","level","chunk","chunk_meaning","definition","definition_meaning","status","note"];
    cols.forEach(c => {
      const td = document.createElement("td");
      td.textContent = r[c] || "";
      if (c === "status") td.className = cleanValue(r[c]) === "OK" ? "status-ok" : (cleanValue(r[c]) ? "status-ng" : "");
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  }
}

function unresolved(row) {
  const notOk = cleanValue(row.status).toUpperCase() !== "OK";
  const missingAny = ["chunk","chunk_meaning","definition","definition_meaning"].some(c => !cleanValue(row[c]));
  return notOk && missingAny;
}

function buildPrompt(rows) {
  const csvRows = [["row_number","word","meaning","level","chunk","chunk_meaning","definition","definition_meaning","status","note"]];
  rows.forEach(r => csvRows.push(csvRows[0].map(k => r[k] ?? "")));
  return `以下の50行について、空欄になっている chunk, chunk_meaning, definition, definition_meaning を補完してください。
既存の値が入っているセルは原則上書きしないでください。

chunk ルール：
1. word を含む自然な英語チャンクにする。
2. 名詞の場合、単に the word のような形にしない。
3. 動詞の場合、単に to word のような形にしない。
4. 4択問題で使いやすい短めのチャンクにする。
5. chunk_meaning は自然な日本語にする。

definition ルール：
Up塾 英英定義ルール 初期版
1. 定義文の語彙は原則A2まで。
2. 必要な場合だけB1語を少し使う。
3. 1定義は8〜14語程度。
4. 同じ行の見出し語 word そのものを使わない。
5. meaning と意味がズレない。
6. 4択で見たときに正解が分かる程度に明確にする。
7. 難語を難語で説明しない。

definition_meaning ルール：
1. definition の意味確認用の日本語訳を書く。
2. 自然な意訳より、definition の意味対応を優先する。
3. 長くしすぎない。

出力形式：
CSV形式で返してください。
列は以下にしてください。
row_number,word,meaning,level,chunk,chunk_meaning,definition,definition_meaning,status,note

status は基本 OK にしてください。
意味が怪しい場合や判断が難しい場合は 要確認 にしてください。
note には要確認理由を書いてください。

対象データCSV:
${toCSV(csvRows)}`;
}

function mergePasted(text) {
  const matrix = parseCSV(text.trim());
  if (matrix.length < 2) return 0;
  const headers = matrix[0].map(normalizeHeader);
  const idx = Object.fromEntries(["row_number","chunk","chunk_meaning","definition","definition_meaning","status","note"].map(k => [k, headers.indexOf(k)]));
  let applied = 0;
  for (let i = 1; i < matrix.length; i++) {
    const r = matrix[i];
    const rn = Number(r[idx.row_number]);
    if (!Number.isInteger(rn) || rn < 2) continue;
    const target = STATE.rows.find(row => row.row_number === rn);
    if (!target) continue;
    for (const c of ["chunk","chunk_meaning","definition","definition_meaning","status","note"]) {
      const newVal = idx[c] >= 0 ? (r[idx[c]] ?? "") : "";
      if (cleanValue(newVal)) target[c] = newVal;
    }
    applied++;
  }
  return applied;
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\$&");
}

function definitionContainsWord(word, definition) {
  const w = cleanValue(word);
  const d = cleanValue(definition);
  if (w.length < 3 || !d) return false;
  const regex = new RegExp(`\\b${escapeRegex(w)}\\b`, "i");
  return regex.test(d);
}

function appendNote(row, msg) {
  const current = cleanValue(row.note);
  if (!current.includes(msg)) row.note = current ? `${current} / ${msg}` : msg;
}

function isValidLevel(level) {
  const v = cleanValue(level);
  if (!v) return false;
  if (!Number.isNaN(Number(v))) return true;
  return ["A1", "A2", "B1", "B2", "C1", "C2"].includes(v.toUpperCase());
}

function checkRows(targetRows) {
  let ok = 0, need = 0, unprocessed = 0;
  for (const r of targetRows) {
    const issues = [];
    if (!cleanValue(r.word)) issues.push("word空欄");
    if (!cleanValue(r.meaning)) issues.push("meaning空欄");
    if (!cleanValue(r.level)) {
      issues.push("level空欄");
    } else if (!isValidLevel(r.level)) {
      issues.push("level不正");
    }
    if (!cleanValue(r.chunk)) issues.push("chunk空欄");
    if (!cleanValue(r.chunk_meaning)) issues.push("chunk_meaning空欄");
    if (!cleanValue(r.definition)) issues.push("definition空欄");
    if (!cleanValue(r.definition_meaning)) issues.push("definition_meaning空欄");
    if (cleanValue(r.chunk).toLowerCase() === cleanValue(r.word).toLowerCase()) issues.push("chunkがwordのみ");
    if (definitionContainsWord(r.word, r.definition)) issues.push("definitionにword含む");
    const wc = cleanValue(r.definition) ? cleanValue(r.definition).split(/\s+/).length : 0;
    if (wc && (wc < 8 || wc > 14)) issues.push(`definition語数${wc}`);
    if (!cleanValue(r.status)) issues.push("status空欄");

    if (issues.length > 0) {
      r.status = "要確認";
      issues.forEach(i => appendNote(r, i));
      need++;
    } else {
      r.status = "OK";
      ok++;
    }
    if (unresolved(r)) unprocessed++;
    r.checked_at = new Date().toISOString();
  }
  return { ok, need, unprocessed };
}

function downloadCSV(filename, cols) {
  const rows = [cols, ...STATE.rows.map(r => cols.map(c => r[c] ?? ""))];
  const blob = new Blob(["\uFEFF" + toCSV(rows)], { type: "text/csv;charset=utf-8;" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

function bind() {
  document.getElementById("toolVersion").textContent = `TOOL_VERSION: ${TOOL_VERSION}`;
  document.getElementById("csvFile").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const raw = await file.text();
    const text = raw.charCodeAt(0) === 0xFEFF ? raw.slice(1) : raw;
    const matrix = parseCSV(text);
    const { out } = hydrateRows(matrix);
    STATE.rows = out;
    STATE.currentBatch = [];
    renderBatch([]);
    document.getElementById("loadStatus").textContent = `読込完了: ${out.length}件`;
  });

  document.getElementById("extractNext50").addEventListener("click", () => {
    STATE.currentBatch = STATE.rows.filter(unresolved).slice(0, 50);
    renderBatch(STATE.currentBatch);
    document.getElementById("extractStatus").textContent = `抽出件数: ${STATE.currentBatch.length}`;
  });

  document.getElementById("extractRange").addEventListener("click", () => {
    const s = Number(document.getElementById("rangeStart").value);
    const e = Number(document.getElementById("rangeEnd").value);
    if (!s || !e || e < s) return alert("開始行・終了行を正しく指定してください。");
    STATE.currentBatch = STATE.rows.filter(r => r.row_number >= s && r.row_number <= e);
    renderBatch(STATE.currentBatch);
    document.getElementById("extractStatus").textContent = `範囲抽出: ${s}〜${e} (${STATE.currentBatch.length}件)`;
  });

  document.getElementById("buildPrompt").addEventListener("click", () => {
    document.getElementById("promptArea").value = buildPrompt(STATE.currentBatch);
  });
  document.getElementById("copyPrompt").addEventListener("click", async () => {
    await navigator.clipboard.writeText(document.getElementById("promptArea").value || "");
  });

  document.getElementById("applyPaste").addEventListener("click", () => {
    const applied = mergePasted(document.getElementById("pasteArea").value || "");
    renderBatch(STATE.currentBatch);
    document.getElementById("pasteStatus").textContent = `反映件数: ${applied}`;
  });

  document.getElementById("runCheck").addEventListener("click", () => {
    const r = checkRows(STATE.currentBatch);
    renderBatch(STATE.currentBatch);
    document.getElementById("checkStatus").textContent = `（現在バッチ）OK件数: ${r.ok} / 要確認件数: ${r.need} / 未処理件数: ${r.unprocessed}`;
  });

  document.getElementById("runCheckAll").addEventListener("click", () => {
    const r = checkRows(STATE.rows);
    renderBatch(STATE.currentBatch);
    document.getElementById("checkStatus").textContent = `（全体）OK件数: ${r.ok} / 要確認件数: ${r.need} / 未処理件数: ${r.unprocessed}`;
  });

  document.getElementById("exportApp").addEventListener("click", () => {
    downloadCSV("important_5000_for_app.csv", ["word","meaning","level","chunk","chunk_meaning","definition","definition_meaning"]);
  });
  document.getElementById("exportMaster").addEventListener("click", () => {
    downloadCSV("important_5000_master.csv", REQUIRED_MASTER_COLUMNS);
  });
}

bind();
