// Minimal RFC 4180-compliant CSV parse/serialize (no npm dependency).

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cur += '"'; i++; } else { inQuotes = false; }
      } else {
        cur += ch;
      }
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === ',') { row.push(cur); cur = ''; }
      else if (ch === '\r') { /* skip */ }
      else if (ch === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
      else cur += ch;
    }
  }
  if (cur.length > 0 || row.length > 0) { row.push(cur); rows.push(row); }
  return rows.filter(r => r.length && !(r.length === 1 && r[0] === ''));
}

function parseCsvToObjects(text, { strictColumns = true, expectedColumns = null } = {}) {
  const rows = parseCsv(text);
  if (rows.length === 0) return { headers: [], rows: [] };
  const headers = rows[0].map(h => h.trim());
  if (expectedColumns && strictColumns) {
    const missing = expectedColumns.filter(c => !headers.includes(c));
    const extra = headers.filter(h => !expectedColumns.includes(h));
    if (missing.length || extra.length) {
      const e = new Error('CSV header mismatch');
      e.apiCode = 'VALIDATION_ERROR';
      e.status = 422;
      e.details = { missing, extra };
      throw e;
    }
  }
  const out = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const obj = {};
    headers.forEach((h, idx) => { obj[h] = (r[idx] != null ? r[idx] : '').trim(); });
    out.push({ line: i + 1, values: obj });
  }
  return { headers, rows: out };
}

function escapeField(v) {
  if (v == null) return '';
  const s = typeof v === 'string' ? v : String(v);
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function objectsToCsv(rows, columns) {
  const header = columns.map(escapeField).join(',');
  const body = rows.map(r => columns.map(c => escapeField(r[c])).join(',')).join('\n');
  return `${header}\n${body}\n`;
}

module.exports = { parseCsv, parseCsvToObjects, objectsToCsv, escapeField };
