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
    // مهلة قصوى للطلب حتى لا تعلق الشاشة لو النت ضعيف
    const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), options.timeout || 25000) : null;
    if (ctrl) opts.signal = ctrl.signal;
    let res;
    try {
      res = await fetch(url, opts);
    } catch (e) {
      const timedOut = e && e.name === 'AbortError';
      throw Object.assign(new Error(timedOut ? 'الاتصال بطيء جداً ولم يصل رد. حاول مرة أخرى' : 'تعذر الاتصال بالخادم. تحقق من الإنترنت'), { network: true, timeout: timedOut });
    } finally {
      if (timer) clearTimeout(timer);
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
    Swal.fire({ toast: true, position: 'top', icon, titleText: title, showConfirmButton: false, timer: 2600, timerProgressBar: true });
  }

  // رسالة بنص عادي (بدون HTML) حتى لا يُنفذ أي محتوى قادم من الخادم
  function say(icon, title, text) {
    if (!window.Swal) return Promise.resolve({});
    return Swal.fire({ icon, titleText: title, text: text == null ? '' : String(text) });
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

  window.SOC = { esc, api, toast, say, downloadCSV, rateHtml, rateColor, registerSW };
})();
