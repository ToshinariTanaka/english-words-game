const TOOL_VERSION = "wordbook-batch-v0.2.0";

const MASTER_COLUMNS = [
  "row_number",
  "word","meaning","gold","level",
  "chunk1","chunk1_meaning",
  "chunk2","chunk2_meaning",
  "chunk3","chunk3_meaning",
  "definition","definition_meaning",
  "status","note","checked_at"
];
const CHAPPY_COLUMNS = ["row_number","word","meaning","gold","level","chunk1","chunk1_meaning","chunk2","chunk2_meaning","chunk3","chunk3_meaning","definition","definition_meaning","status","note"];
const LEVEL_TO_GOLD = { A1: 1, A2: 2, B1: 4, B2: 8, C1: 16, C2: 32 };
const STATE = { rows: [], currentBatch: [] };

function normalizeHeader(h) { return (h || "").trim().toLowerCase(); }
function cleanValue(v) { return (v ?? "").toString().trim(); }
function normalizeLevel(v) { const k = cleanValue(v).toUpperCase(); return LEVEL_TO_GOLD[k] ? k : "A1"; }
function safeGold(gold, level) { const n = Number(gold); return Number.isFinite(n) && n > 0 ? n : (LEVEL_TO_GOLD[normalizeLevel(level)] || 1); }

function parseCSV(text) {
  const rows = []; let i = 0; let cell = ""; let row = []; let inQuotes = false;
  while (i < text.length) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i += 2; continue; }
      if (ch === '"') { inQuotes = false; i++; continue; }
      cell += ch; i++; continue;
    }
    if (ch === '"') { inQuotes = true; i++; continue; }
    if (ch === ',') { row.push(cell.trim()); cell = ""; i++; continue; }
    if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cell.trim()); if (row.some(Boolean)) rows.push(row); row = []; cell = ""; i++; continue; }
    cell += ch; i++;
  }
  row.push(cell.trim()); if (row.some(Boolean)) rows.push(row); return rows;
}
function toCSV(rows) { return rows.map(r => r.map(v => { const s = (v ?? "").toString(); return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }).join(",")).join("\n"); }

function hydrateRows(matrix) {
  const headers = (matrix[0] || []).map(normalizeHeader);
  const format = headers.includes("word") && headers.includes("gold") && headers.includes("chunk1") ? "new" : headers.includes("word") ? "old" : "ja";
  const out = [];
  for (let i = 1; i < matrix.length; i++) {
    const src = matrix[i];
    const row = { row_number: i };
    MASTER_COLUMNS.forEach((c) => { row[c] = ""; });
    const g = (idx) => cleanValue(src[idx]);
    if (format === "new") {
      const map = Object.fromEntries(headers.map((h, idx) => [h, idx]));
      MASTER_COLUMNS.forEach((c) => { row[c] = g(map[c]); });
      row.row_number = Number(g(map.row_number)) || i;
    } else if (format === "old") {
      const map = Object.fromEntries(headers.map((h, idx) => [h, idx]));
      row.word = g(map.word ?? 0); row.meaning = g(map.meaning ?? 1); row.level = normalizeLevel(g(map.level ?? 2));
      row.gold = safeGold(g(map.gold), row.level); row.chunk1 = g(map.chunk); row.chunk1_meaning = g(map.chunk_meaning);
      row.definition = g(map.definition); row.definition_meaning = g(map.definition_meaning); row.status = g(map.status); row.note = g(map.note); row.checked_at = g(map.checked_at);
    } else {
      row.word = g(0); row.meaning = g(1); row.gold = safeGold(g(2), g(10)); row.level = normalizeLevel(g(10));
      row.chunk1 = g(3); row.chunk1_meaning = g(4); row.chunk2 = g(5); row.chunk2_meaning = g(6); row.chunk3 = g(7); row.chunk3_meaning = g(8);
      row.definition = g(11); row.definition_meaning = g(12);
    }
    row.row_number = Number(row.row_number) || i;
    row.level = normalizeLevel(row.level);
    row.gold = safeGold(row.gold, row.level);
    if (!row.status) row.status = "";
    out.push(row);
  }
  return out;
}

function renderTableHeader() {
  const tr = document.querySelector("#batchTable thead tr");
  if (!tr) return;
  tr.innerHTML = "";
  CHAPPY_COLUMNS.forEach((c) => {
    const th = document.createElement("th");
    th.textContent = c;
    tr.appendChild(th);
  });
}

function renderBatch(rows) {
  const tbody = document.querySelector("#batchTable tbody"); tbody.innerHTML = "";
  for (const r of rows) { const tr = document.createElement("tr"); CHAPPY_COLUMNS.forEach(c => { const td = document.createElement("td"); td.textContent = r[c] || ""; tr.appendChild(td); }); tbody.appendChild(tr); }
}
function unresolved(r) { return ["chunk1","chunk1_meaning","definition","definition_meaning"].some(c => !cleanValue(r[c])) || cleanValue(r.status).toUpperCase() !== "OK"; }
function buildPrompt(rows) {
  const csvRows = [CHAPPY_COLUMNS]; rows.forEach(r => csvRows.push(CHAPPY_COLUMNS.map(k => r[k] ?? "")));
  return `以下の50行について空欄補完してください。既存値は原則上書きしないでください。\n\n出力列:\n${CHAPPY_COLUMNS.join(",")}\n\n対象データCSV:\n${toCSV(csvRows)}`;
}
function stripCodeBlock(text) {
  return String(text || "").replace(/^\s*```csv(?:\s+id="[^"]*")?\s*/i, "").replace(/^\s*```\s*/i, "").replace(/\s*```\s*$/i, "").trim();
}
function mergePasted(text) {
  const cleaned = stripCodeBlock(text);
  const matrix = parseCSV(cleaned);
  if (!matrix.length) return { applied: 0, reason: "CSVヘッダーが認識できません" };
  const headers = (matrix[0] || []).map(normalizeHeader);
  const withHeader = headers.includes("row_number");
  const idx = withHeader ? Object.fromEntries(["row_number","chunk1","chunk1_meaning","definition","definition_meaning","status","note"].map(k => [k, headers.indexOf(k)])) : null;
  const dataRows = withHeader ? matrix.slice(1) : matrix;
  if (!withHeader && dataRows.some(r => r.length < 7)) return { applied: 0, reason: "列数が不足しています" };
  if (withHeader && idx.row_number < 0) return { applied: 0, reason: "CSVヘッダーが認識できません" };

  let applied = 0; let rowMissing = 0; let hasValueSkipped = 0; let noBlankTarget = 0;
  for (const r of dataRows) {
    const rn = Number(withHeader ? r[idx.row_number] : r[0]);
    const target = STATE.rows.find(row => row.row_number === rn);
    if (!Number.isInteger(rn) || !target || !STATE.currentBatch.find((b) => b.row_number === rn)) { rowMissing++; continue; }
    let rowApplied = 0;
    const cols = ["chunk1","chunk1_meaning","definition","definition_meaning","status","note"];
    cols.forEach((c, i) => {
      const val = cleanValue(withHeader ? r[idx[c]] : r[i + 1]);
      if (!val) return;
      if (c === "status" && !cleanValue(target.status)) { target.status = val || "OK"; rowApplied++; return; }
      if (!cleanValue(target[c])) { target[c] = val; rowApplied++; } else { hasValueSkipped++; }
    });
    if (!cleanValue(target.status)) target.status = "OK";
    if (rowApplied === 0) noBlankTarget++;
    if (rowApplied > 0) applied++;
  }
  if (applied > 0) return { applied, reason: "" };
  if (rowMissing > 0) return { applied, reason: "row_number が現在の50行に存在しません" };
  if (hasValueSkipped > 0) return { applied, reason: "既存値があるため上書きされませんでした" };
  if (noBlankTarget > 0) return { applied, reason: "反映対象の空欄がありませんでした" };
  return { applied, reason: "反映できる行がありませんでした" };
}

function checkRows(rows) {
  const targetRows = Array.isArray(rows) ? rows : [];
  const result = { total: targetRows.length, ok: 0, review: 0, pending: 0, errors: [] };
  if (!targetRows.length) return result;

  const allowedStatus = new Set(["OK", "要確認", "PENDING"]);
  const requiredColumns = [
    "row_number", "word", "meaning", "gold", "level",
    "chunk1", "chunk1_meaning", "definition", "definition_meaning", "status"
  ];

  for (const row of targetRows) {
    for (const col of requiredColumns) {
      const val = cleanValue(row[col]);
      if (!val) result.errors.push(`row_number ${row.row_number} ${col} が空欄です`);
    }

    const statusRaw = cleanValue(row.status);
    const statusUpper = statusRaw.toUpperCase();
    if (!allowedStatus.has(statusUpper)) {
      result.errors.push(`row_number ${row.row_number} status が不正です (${statusRaw || "空欄"})`);
      continue;
    }

    if (statusUpper === "OK") result.ok += 1;
    else if (statusUpper === "要確認") result.review += 1;
    else result.pending += 1;
  }

  return result;
}

function renderCheckResult(result, label) {
  const statusEl = document.getElementById("checkStatus");
  if (!statusEl) return;
  if (!result || result.total === 0) {
    statusEl.textContent = "チェック対象がありません。先に抽出してください。";
    return;
  }

  const base = `チェック完了：${label}${result.total}件中 OK ${result.ok}件、要確認 ${result.review}件、pending ${result.pending}件、エラー ${result.errors.length}件`;
  statusEl.textContent = result.errors.length ? `${base} / ${result.errors[0]}` : base;
}

function downloadCSV(filename, cols) {
  const rows = [cols, ...STATE.rows.map(r => cols.map(c => r[c] ?? ""))];
  const blob = new Blob(["\uFEFF" + toCSV(rows)], { type: "text/csv;charset=utf-8;" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = filename; a.click(); URL.revokeObjectURL(a.href);
}
function bind() {
  renderTableHeader();
  document.getElementById("toolVersion").textContent = `TOOL_VERSION: ${TOOL_VERSION}`;
  document.getElementById("csvFile").addEventListener("change", async (e) => { const file = e.target.files[0]; if (!file) return; const matrix = parseCSV((await file.text()).replace(/^\uFEFF/,"")); STATE.rows = hydrateRows(matrix); STATE.currentBatch = []; renderBatch([]); document.getElementById("loadStatus").textContent = `読込完了: ${STATE.rows.length}件`; });
  document.getElementById("extractNext50").addEventListener("click", () => { STATE.currentBatch = STATE.rows.filter(unresolved).slice(0, 50); renderBatch(STATE.currentBatch); document.getElementById("extractStatus").textContent = `抽出件数: ${STATE.currentBatch.length}`; });
  document.getElementById("extractRange").addEventListener("click", () => { const s = Number(document.getElementById("rangeStart").value); const e = Number(document.getElementById("rangeEnd").value); if (!s || !e || e < s) return alert("開始行・終了行を正しく指定してください。"); STATE.currentBatch = STATE.rows.filter(r => r.row_number >= s && r.row_number <= e); renderBatch(STATE.currentBatch); document.getElementById("extractStatus").textContent = `範囲抽出: ${s}〜${e} (${STATE.currentBatch.length}件)`; });
  document.getElementById("buildPrompt").addEventListener("click", () => { document.getElementById("promptArea").value = buildPrompt(STATE.currentBatch); });
  document.getElementById("copyPrompt").addEventListener("click", async () => { await navigator.clipboard.writeText(document.getElementById("promptArea").value || ""); });
  document.getElementById("applyPaste").addEventListener("click", () => { const result = mergePasted(document.getElementById("pasteArea").value || ""); renderBatch(STATE.currentBatch); document.getElementById("pasteStatus").textContent = result.applied > 0 ? `反映件数: ${result.applied}` : `反映件数: 0（${result.reason}）`; });
  const runCheckButton = document.getElementById("runCheck");
  if (runCheckButton) {
    runCheckButton.addEventListener("click", () => {
      const target = STATE.currentBatch.length ? STATE.currentBatch : [];
      const result = checkRows(target);
      renderCheckResult(result, "抽出範囲 ");
    });
  }
  const runCheckAllButton = document.getElementById("runCheckAll");
  if (runCheckAllButton) {
    runCheckAllButton.addEventListener("click", () => {
      const result = checkRows(STATE.rows);
      renderCheckResult(result, "全体 ");
    });
  }
  document.getElementById("exportMaster").addEventListener("click", () => downloadCSV("important_5000_master.csv", MASTER_COLUMNS));
}
bind();
