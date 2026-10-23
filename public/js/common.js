// أدوات مشتركة بين كل صفحات النظام
(function () {
  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' };
  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"'`]/g, c => ESC[c]);
  }

  async function api(url, options = {}) {
    const opts = { method: options.method || 'GET', credentials: 'same-origin', headers: { Accept: 'application/json' } };
    if (options.body !== undefined) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(options.body);
    }
    let res;
    try {
      res = await fetch(url, opts);
    } catch (e) {
      throw Object.assign(new Error('تعذر الاتصال بالخادم. تحقق من الإنترنت'), { network: true });
    }
    let data = {};
    try { data = await res.json(); } catch (e) { /* ignore */ }
    if (!res.ok) {
      if (res.status === 401 && data.code === 'NO_SESSION' && !options.noRedirect) {
        window.location.replace('/admin');
      }
      throw Object.assign(new Error(data.message || `خطأ ${res.status}`), { status: res.status, data });
    }
    return data;
  }

  function toast(icon, title) {
    if (!window.Swal) return;
    Swal.fire({ toast: true, position: 'top', icon, title, showConfirmButton: false, timer: 2600, timerProgressBar: true });
  }

  // تصدير CSV آمن ضد حقن المعادلات عند الفتح في Excel
  function downloadCSV(filename, headers, rows) {
    const cell = v => {
      let s = String(v == null ? '' : v);
      if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
      return '"' + s.replace(/"/g, '""') + '"';
    };
    const csv = '﻿' + [headers, ...rows].map(r => r.map(cell).join(',')).join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function rateColor(p) {
    return p >= 75 ? 'var(--ok)' : p >= 50 ? '#d97706' : 'var(--bad)';
  }

  function rateHtml(p) {
    const v = Math.max(0, Math.min(100, Number(p) || 0));
    return `<div class="rate"><div class="rate-bar"><span style="width:${v}%;background:${rateColor(v)}"></span></div><b style="color:${rateColor(v)}">${v}%</b></div>`;
  }

  function registerSW() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').then(r => r.update()).catch(() => {});
    }
  }

  window.SOC = { esc, api, toast, downloadCSV, rateHtml, rateColor, registerSW };
})();
