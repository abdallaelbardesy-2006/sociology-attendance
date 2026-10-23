// محاكاة بسيطة لـ Google Sheets API داخل الذاكرة — للاختبار المحلي فقط
function colToIndex(col) {
  let n = 0;
  for (const ch of col) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

function parseRange(range) {
  const m = range.match(/^(?:'((?:[^']|'')+)'|([^!]+))!?([A-Z]*)(\d*)(?::([A-Z]*)(\d*))?$/);
  if (!m) throw new Error('bad range ' + range);
  const tab = (m[1] || m[2]).replace(/''/g, "'");
  return {
    tab,
    c1: m[3] ? colToIndex(m[3]) : 0,
    r1: m[4] ? parseInt(m[4], 10) - 1 : 0,
    c2: m[5] ? colToIndex(m[5]) : (m[3] && !m[5] && m[6] === undefined ? colToIndex(m[3]) : 25),
    r2: m[6] ? parseInt(m[6], 10) - 1 : (m[4] && m[5] === undefined ? parseInt(m[4], 10) - 1 : Infinity)
  };
}

function createMockSheets(seed = {}) {
  const tabs = new Map();
  const meta = new Map();
  let nextId = 1;
  const addTab = title => {
    if (tabs.has(title)) throw new Error('exists ' + title);
    tabs.set(title, []);
    meta.set(title, { sheetId: nextId++, protectedRanges: [] });
  };
  Object.entries(seed).forEach(([t, rows]) => { addTab(t); tabs.set(t, rows.map(r => r.slice())); });

  const lastRow = grid => {
    for (let i = grid.length - 1; i >= 0; i--) if ((grid[i] || []).some(v => v !== '' && v != null)) return i;
    return -1;
  };
  const read = range => {
    const p = parseRange(range);
    if (!tabs.has(p.tab)) throw new Error('Unable to parse range: ' + range);
    const grid = tabs.get(p.tab);
    const out = [];
    const end = Math.min(p.r2, lastRow(grid));
    for (let r = p.r1; r <= end; r++) {
      const row = (grid[r] || []).slice(p.c1, p.c2 + 1).map(v => (v == null ? '' : String(v)));
      while (row.length && row[row.length - 1] === '') row.pop();
      out.push(row);
    }
    while (out.length && !out[out.length - 1].length) out.pop();
    return { range, values: out.length ? out : undefined };
  };
  const write = (range, values) => {
    const p = parseRange(range);
    if (!tabs.has(p.tab)) throw new Error('Unable to parse range: ' + range);
    const grid = tabs.get(p.tab);
    values.forEach((vals, i) => {
      const r = p.r1 + i;
      grid[r] = grid[r] || [];
      vals.forEach((v, j) => { grid[r][p.c1 + j] = v; });
    });
  };

  const api = {
    _tabs: tabs,
    _meta: meta,
    spreadsheets: {
      async get() {
        return { data: { sheets: [...tabs.keys()].map(title => ({ properties: { title, sheetId: meta.get(title).sheetId }, protectedRanges: meta.get(title).protectedRanges })) } };
      },
      async batchUpdate({ requestBody }) {
        for (const req of requestBody.requests) {
          if (req.addSheet) addTab(req.addSheet.properties.title);
          if (req.addProtectedRange) {
            const id = req.addProtectedRange.protectedRange.range.sheetId;
            for (const m of meta.values()) if (m.sheetId === id) m.protectedRanges.push(req.addProtectedRange.protectedRange);
          }
        }
        return { data: {} };
      },
      values: {
        async get({ range }) { return { data: read(range) }; },
        async batchGet({ ranges }) { return { data: { valueRanges: ranges.map(read) } }; },
        async update({ range, requestBody }) { write(range, requestBody.values); return { data: {} }; },
        async batchUpdate({ requestBody }) { requestBody.data.forEach(d => write(d.range, d.values)); return { data: {} }; },
        async append({ range, requestBody }) {
          const p = parseRange(range);
          const grid = tabs.get(p.tab);
          if (!grid) throw new Error('Unable to parse range: ' + range);
          const start = lastRow(grid) + 1;
          requestBody.values.forEach((v, i) => { grid[start + i] = v.slice(); });
          return { data: { updates: { updatedRange: `${p.tab}!A${start + 1}:K${start + requestBody.values.length}` } } };
        }
      }
    }
  };
  return api;
}

module.exports = { createMockSheets, parseRange };
