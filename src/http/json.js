'use strict';

const { ValidationError } = require('../auth/errors');

function sendJson(res, statusCode, data, headers = {}) {
  const body = JSON.stringify(data);
  res.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    ...headers,
  });
  res.end(body);
}

function readJson(req, maxBytes) {
  return new Promise((resolve, reject) => {
    const contentType = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
    if (contentType !== 'application/json') {
      reject(new ValidationError('Content-Type は application/json を指定してください。'));
      return;
    }
    const chunks = [];
    let total = 0;
    let settled = false;
    req.on('data', (chunk) => {
      if (settled) return;
      total += chunk.length;
      if (total > maxBytes) {
        settled = true;
        const error = new ValidationError('入力サイズが上限を超えました。');
        error.statusCode = 413;
        reject(error);
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (settled) return;
      try {
        const text = Buffer.concat(chunks).toString('utf8');
        const value = JSON.parse(text || '{}');
        if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('object required');
        settled = true;
        resolve(value);
      } catch (_) {
        settled = true;
        const error = new ValidationError('JSONの形式が正しくありません。');
        error.code = 'INVALID_JSON';
        reject(error);
      }
    });
    req.on('error', reject);
  });
}

function parseCookies(header) {
  const result = {};
  for (const part of String(header || '').split(';')) {
    const index = part.indexOf('=');
    if (index < 1) continue;
    const name = part.slice(0, index).trim();
    try { result[name] = decodeURIComponent(part.slice(index + 1).trim()); } catch (_) { result[name] = ''; }
  }
  return result;
}

module.exports = { parseCookies, readJson, sendJson };
