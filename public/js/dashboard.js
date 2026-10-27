(function () {
  const { api, esc, toast, say, downloadCSV, rateHtml } = window.SOC;
  window.SOC.registerSW();

  let ME = null;
  let META = null;
  let SUBJECTS = [];
  let currentSection = null;
  const main = document.getElementById('main');

  const ROLE_LABEL = {
    super_admin: '<i class="fas fa-crown"></i> <span class="d-none d-md-inline">المشرف العام</span>',
    doctor: '<i class="fas fa-chalkboard-user"></i> <span class="d-none d-md-inline">دكتور مادة</span>',
    leader: '<i class="fas fa-qrcode"></i> <span class="d-none d-md-inline">ليدر دفعة</span>'
  };
  const ROLE_PILL = {
    super_admin: '<span class="pill pill-brand"><i class="fas fa-crown"></i> مشرف عام</span>',
    doctor: '<span class="pill pill-gray"><i class="fas fa-chalkboard-user"></i> دكتور مادة</span>',
    leader: '<span class="pill pill-ok"><i class="fas fa-qrcode"></i> ليدر دفعة</span>'
  };

  const SECTIONS = {
    overview: { label: 'الإحصائيات', icon: 'fa-chart-pie', roles: ['super_admin', 'doctor'], render: renderOverview },
    scanner: { label: 'ماسح الحضور', icon: 'fa-qrcode', roles: ['super_admin', 'doctor', 'leader'], render: renderScanner },
    students: { label: 'الطلاب', icon: 'fa-users', roles: ['super_admin'], render: renderStudents },
    promotion: { label: 'ترقية الفرق', icon: 'fa-arrow-up-right-dots', roles: ['super_admin'], render: renderPromotion },
    users: { label: 'الحسابات والصلاحيات', icon: 'fa-user-shield', roles: ['super_admin'], render: renderUsers },
    audit: { label: 'سجل العمليات', icon: 'fa-clock-rotate-left', roles: ['super_admin'], render: renderAudit },
    settings: { label: 'الإعدادات والأمان', icon: 'fa-lock', roles: ['super_admin'], render: renderSettings }
  };

  // ==================== أدوات عامة ====================
  function opts(values, selected, allLabel) {
    return (allLabel ? `<option value="">${esc(allLabel)}</option>` : '') +
      values.map(v => {
        const value = typeof v === 'object' ? v.value : v;
        const label = typeof v === 'object' ? v.label : v;
        return `<option value="${esc(value)}" ${String(value) === String(selected) ? 'selected' : ''}>${esc(label)}</option>`;
      }).join('');
  }

  function subjectLabel(s) {
    return `${s.name} (${s.code})`;
  }

  function loadingHtml(text) {
    return `<div class="card-x text-center py-5 text-muted-2"><span class="spin me-2"></span> ${esc(text || 'جاري التحميل...')}</div>`;
  }

  function errorHtml(msg) {
    return `<div class="alert alert-danger"><i class="fas fa-triangle-exclamation me-1"></i> ${esc(msg)}</div>`;
  }

  // جدول قابل للترتيب والتقسيم لصفحات
  class Table {
    constructor(el, columns, o = {}) {
      this.el = el;
      this.columns = columns;
      this.pageSize = o.pageSize || 50;
      this.empty = o.empty || 'لا توجد بيانات';
      this.sortKey = o.sortKey || null;
      this.sortDir = o.sortDir || 1;
      this.rows = [];
      this.page = 0;
      this.maxHeight = o.maxHeight;
      this.onRender = o.onRender;
    }
    setRows(rows) {
      this.rows = rows || [];
      this.page = 0;
      this.render();
    }
    sorted() {
      if (!this.sortKey) return this.rows;
      const col = this.columns.find(c => c.key === this.sortKey);
      const get = col && col.sortValue ? col.sortValue : r => r[this.sortKey];
      return this.rows.slice().sort((a, b) => {
        const x = get(a);
        const y = get(b);
        if (typeof x === 'number' && typeof y === 'number') return (x - y) * this.sortDir;
        return String(x == null ? '' : x).localeCompare(String(y == null ? '' : y), 'ar') * this.sortDir;
      });
    }
    render() {
      const rows = this.sorted();
      const pages = Math.max(1, Math.ceil(rows.length / this.pageSize));
      if (this.page >= pages) this.page = pages - 1;
      const slice = rows.slice(this.page * this.pageSize, (this.page + 1) * this.pageSize);
      const head = this.columns.map(c => {
        const arrow = this.sortKey === c.key ? (this.sortDir > 0 ? ' ▲' : ' ▼') : '';
        return `<th class="${c.sortable === false ? '' : 'sortable'}" data-key="${esc(c.key)}">${c.headerHtml || esc(c.label)}${arrow}</th>`;
      }).join('');
      const body = slice.length ? slice.map(r => `<tr>${this.columns.map(c => `<td>${c.render ? c.render(r) : esc(r[c.key])}</td>`).join('')}</tr>`).join('')
        : `<tr class="empty-row"><td colspan="${this.columns.length}">${esc(this.empty)}</td></tr>`;
      this.el.innerHTML = `
        <div class="table-wrap" ${this.maxHeight ? `style="max-height:${this.maxHeight}px"` : ''}><table class="table-x"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>
        <div class="pager"><span>${rows.length} صف${pages > 1 ? ` • صفحة ${this.page + 1} من ${pages}` : ''}</span>
          ${pages > 1 ? `<div class="btn-group btn-group-sm"><button class="btn btn-soft" data-pg="-1" ${this.page === 0 ? 'disabled' : ''}>السابق</button><button class="btn btn-soft" data-pg="1" ${this.page >= pages - 1 ? 'disabled' : ''}>التالي</button></div>` : ''}
        </div>`;
      this.el.querySelectorAll('th.sortable').forEach(th => th.addEventListener('click', () => {
        const k = th.dataset.key;
        if (this.sortKey === k) this.sortDir *= -1; else { this.sortKey = k; this.sortDir = 1; }
        this.render();
      }));
      this.el.querySelectorAll('[data-pg]').forEach(b => b.addEventListener('click', () => {
        this.page += parseInt(b.dataset.pg, 10);
        this.render();
      }));
      if (this.onRender) this.onRender(rows);
    }
  }

  // ==================== التهيئة ====================
  async function init() {
    try {
      const [me, meta] = await Promise.all([api('/api/auth'), api('/api/meta')]);
      ME = me.user;
      META = meta;
      SUBJECTS = [];
      META.grades.forEach(g => META.terms.forEach(t => (META.curriculum[g][t] || []).forEach(s => SUBJECTS.push({ ...s, grade: g, term: t }))));
    } catch (e) {
      if (e.status !== 401) main.innerHTML = errorHtml(e.message);
      return;
    }

    document.getElementById('userChip').innerHTML = `${ROLE_LABEL[ME.role] || ''} <span class="d-none d-lg-inline">• ${esc(ME.name)}</span>`;
    document.getElementById('userEmail').textContent = ME.email;

    const nav = document.getElementById('sideNav');
    nav.innerHTML = Object.entries(SECTIONS).filter(([, s]) => s.roles.includes(ME.role))
      .map(([id, s]) => `<button data-section="${id}"><i class="fas ${s.icon}"></i> ${esc(s.label)}</button>`).join('');
    nav.addEventListener('click', e => {
      const b = e.target.closest('[data-section]');
      if (b) go(b.dataset.section);
    });

    if (ME.mustChangePassword) {
      main.innerHTML = `<div class="card-x text-center py-5"><i class="fas fa-key fa-2x text-warning mb-3"></i><h5 class="fw-800">يجب تغيير كلمة المرور قبل المتابعة</h5><p class="text-muted-2">لحماية حسابك، اختر كلمة مرور جديدة خاصة بك.</p></div>`;
      await changePassword(true);
      return;
    }
    const fromHash = location.hash.replace('#', '');
    go(SECTIONS[fromHash] && SECTIONS[fromHash].roles.includes(ME.role) ? fromHash : (ME.role === 'leader' ? 'scanner' : 'overview'));
  }

  function go(id) {
    if (!SECTIONS[id] || !SECTIONS[id].roles.includes(ME.role)) return;
    if (currentSection === 'scanner' && id !== 'scanner') stopCamera();
    currentSection = id;
    history.replaceState(null, '', '#' + id);
    document.querySelectorAll('#sideNav button').forEach(b => b.classList.toggle('active', b.dataset.section === id));
    SECTIONS[id].render();
  }

  document.addEventListener('click', e => {
    const a = e.target.closest('[data-action]');
    if (!a) return;
    if (a.dataset.action === 'logout') logout();
    if (a.dataset.action === 'change-password') changePassword(false);
  });

  async function logout() {
    stopCamera();
    try { await api('/api/auth', { method: 'POST', body: { action: 'logout' }, noRedirect: true }); } catch (e) { /* ignore */ }
    window.location.replace('/admin');
  }

  async function changePassword(forced) {
    const r = await Swal.fire({
      title: forced ? 'تعيين كلمة مرور جديدة' : 'تغيير كلمة المرور',
      html: `
        <div class="mb-2"><label class="form-label">كلمة المرور الحالية</label><input type="password" id="cpCur" class="form-control ltr" autocomplete="current-password"></div>
        <div class="mb-2"><label class="form-label">كلمة المرور الجديدة</label><input type="password" id="cpNew" class="form-control ltr" autocomplete="new-password"></div>
        <div class="mb-2"><label class="form-label">تأكيد كلمة المرور الجديدة</label><input type="password" id="cpNew2" class="form-control ltr" autocomplete="new-password"></div>
        <div class="small text-muted-2">10 أحرف على الأقل وتحتوي على حروف إنجليزية وأرقام.</div>`,
      showCancelButton: !forced,
      allowOutsideClick: !forced,
      allowEscapeKey: !forced,
      confirmButtonText: 'حفظ كلمة المرور',
      cancelButtonText: 'إلغاء',
      showLoaderOnConfirm: true,
      preConfirm: async () => {
        const cur = document.getElementById('cpCur').value;
        const n1 = document.getElementById('cpNew').value;
        const n2 = document.getElementById('cpNew2').value;
        if (!cur || !n1) return Swal.showValidationMessage('يرجى ملء الحقول');
        if (n1 !== n2) return Swal.showValidationMessage('كلمتا المرور غير متطابقتين');
        try {
          return await api('/api/auth', { method: 'POST', body: { action: 'changePassword', currentPassword: cur, newPassword: n1 } });
        } catch (e) {
          Swal.showValidationMessage(esc(e.message));
        }
      }
    });
    if (r.isConfirmed && r.value) {
      await Swal.fire({ icon: 'success', title: 'تم تغيير كلمة المرور', timer: 1800, showConfirmButton: false });
      if (forced) window.location.reload();
    } else if (forced) {
      changePassword(true);
    }
  }

  // ==================== 1. الإحصائيات ====================
  const an = { data: null, filters: { grade: '', term: '', subject: '', from: '', to: '', threshold: 75 }, tab: 'subjects', chart: null };

  function renderOverview() {
    const isDoc = ME.role === 'doctor';
    const f = an.filters;
    const docSubjects = ME.subjects || [];
    if (isDoc && docSubjects.length === 1) f.subject = docSubjects[0].code;

    main.innerHTML = `
      <div class="page-title"><h2>${isDoc ? 'إحصائيات موادي' : 'الإحصائيات ونسب الحضور'}</h2>
        <button class="btn btn-soft btn-sm" id="anRefresh"><i class="fas fa-rotate me-1"></i> تحديث</button></div>
      ${isDoc ? `<div class="role-banner" style="background:linear-gradient(135deg,#0369a1,#0284c7)">
          <div><div class="fw-800"><i class="fas fa-chalkboard-user me-1"></i> ${esc(ME.name)}</div>
          <div class="small opacity-75">تظهر لك بيانات المواد المسندة إليك فقط: ${docSubjects.map(s => esc(s.name)).join('، ') || '—'}</div></div></div>` : ''}
      <div class="card-x">
        <div class="filter-bar">
          ${isDoc ? `
            <div><label class="form-label">المادة</label><select class="form-select form-select-sm" id="fSubject">${opts(docSubjects.map(s => ({ value: s.code, label: subjectLabel(s) })), f.subject, docSubjects.length > 1 ? 'كل موادي' : '')}</select></div>` : `
            <div><label class="form-label">الفرقة</label><select class="form-select form-select-sm" id="fGrade">${opts(META.grades, f.grade, 'كل الفرق')}</select></div>
            <div><label class="form-label">الترم</label><select class="form-select form-select-sm" id="fTerm">${opts(META.terms, f.term, 'كل الترمات')}</select></div>
            <div style="grid-column: span 2"><label class="form-label">المادة</label><select class="form-select form-select-sm" id="fSubject"></select></div>`}
          <div><label class="form-label">من تاريخ</label><input type="date" class="form-control form-control-sm" id="fFrom" value="${esc(f.from)}"></div>
          <div><label class="form-label">إلى تاريخ</label><input type="date" class="form-control form-control-sm" id="fTo" value="${esc(f.to)}"></div>
          <div><label class="form-label">حد الحرمان %</label><input type="number" min="1" max="100" class="form-control form-control-sm" id="fThreshold" value="${esc(f.threshold)}"></div>
        </div>
      </div>
      <div id="anBody">${loadingHtml('جاري حساب الإحصائيات...')}</div>`;

    const fillSubjects = () => {
      if (isDoc) return;
      const list = SUBJECTS.filter(s => (!f.grade || s.grade === f.grade) && (!f.term || s.term === f.term));
      if (f.subject && !list.some(s => s.code === f.subject)) f.subject = '';
      document.getElementById('fSubject').innerHTML = opts(list.map(s => ({ value: s.code, label: `${subjectLabel(s)} — ${s.grade} / ${s.term}` })), f.subject, `كل المواد (${list.length})`);
    };
    fillSubjects();

    const bind = (id, key, refill) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('change', () => {
        f[key] = el.value;
        if (refill) fillSubjects();
        loadAnalytics();
      });
    };
    bind('fGrade', 'grade', true);
    bind('fTerm', 'term', true);
    bind('fSubject', 'subject');
    bind('fFrom', 'from');
    bind('fTo', 'to');
    bind('fThreshold', 'threshold');
    document.getElementById('anRefresh').addEventListener('click', loadAnalytics);
    loadAnalytics();
  }

  async function loadAnalytics() {
    const body = document.getElementById('anBody');
    if (!body) return;
    body.innerHTML = loadingHtml('جاري حساب الإحصائيات...');
    const qs = new URLSearchParams();
    Object.entries(an.filters).forEach(([k, v]) => { if (v) qs.set(k, v); });
    try {
      an.data = await api('/api/analytics?' + qs.toString());
      if (currentSection === 'overview') drawAnalytics();
    } catch (e) {
      body.innerHTML = errorHtml(e.message);
    }
  }

  function drawAnalytics() {
    const d = an.data;
    const t = d.totals;
    const body = document.getElementById('anBody');
    const kpi = (icon, bg, color, val, lbl) => `<div class="col-6 col-md-4 col-xl-2"><div class="kpi"><div class="ico" style="background:${bg};color:${color}"><i class="fas ${icon}"></i></div><div><div class="val">${val}</div><div class="lbl">${lbl}</div></div></div></div>`;
    body.innerHTML = `
      <div class="row g-3 mb-3">
        ${kpi('fa-users', '#e0e7ff', '#3730a3', t.students, 'طالب في النطاق')}
        ${kpi('fa-circle-check', '#dcfce7', '#15803d', t.attendanceRate + '%', 'متوسط الحضور')}
        ${kpi('fa-circle-xmark', '#fee2e2', '#b91c1c', t.absenceRate + '%', 'متوسط الغياب')}
        ${kpi('fa-person-chalkboard', '#e0f2fe', '#0369a1', t.sessions, 'محاضرة مرصودة')}
        ${kpi('fa-triangle-exclamation', '#fef3c7', '#b45309', t.atRisk, `أقل من ${d.threshold}%`)}
        ${kpi('fa-calendar-day', '#f3e8ff', '#7e22ce', t.todayRecords, 'حضور اليوم')}
      </div>
      <div class="card-x">
        <div class="card-head"><h3 class="card-title"><i class="fas fa-chart-column"></i> الحضور اليومي (آخر 30 يوم رصد)</h3></div>
        ${d.trend.length ? '<div style="height:220px"><canvas id="trendChart"></canvas></div>' : '<div class="text-center text-muted-2 py-4">لا توجد تسجيلات حضور في هذا النطاق بعد</div>'}
      </div>
      <div class="card-x">
        <div class="card-head">
          <div class="seg" id="anTabs">
            <button data-tab="subjects">المواد (${d.subjects.length})</button>
            <button data-tab="sessions">المحاضرات (${d.sessions.length})</button>
            <button data-tab="students">الطلاب (${d.students.length})</button>
            <button data-tab="records">السجلات (${d.recentRecords.length})</button>
          </div>
          <div id="anTools" class="d-flex gap-2 flex-wrap"></div>
        </div>
        <div id="anTab"></div>
      </div>`;

    if (an.chart) { an.chart.destroy(); an.chart = null; }
    if (d.trend.length && window.Chart) {
      an.chart = new Chart(document.getElementById('trendChart'), {
        type: 'bar',
        data: { labels: d.trend.map(x => x.date.slice(5)), datasets: [{ data: d.trend.map(x => x.count), backgroundColor: '#3b5bdb', borderRadius: 6, maxBarThickness: 28 }] },
        options: { maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { title: i => d.trend[i[0].dataIndex].date, label: i => `${i.raw} حضور` } } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } }, x: { grid: { display: false } } } }
      });
    }

    document.getElementById('anTabs').addEventListener('click', e => {
      const b = e.target.closest('[data-tab]');
      if (b) { an.tab = b.dataset.tab; drawAnTab(); }
    });
    drawAnTab();
  }

  function drawAnTab() {
    const d = an.data;
    document.querySelectorAll('#anTabs button').forEach(b => b.classList.toggle('active', b.dataset.tab === an.tab));
    const tools = document.getElementById('anTools');
    const box = document.getElementById('anTab');
    const fileTag = (an.filters.subject || 'all') + '_' + new Date().toISOString().slice(0, 10);

    if (an.tab === 'subjects') {
      tools.innerHTML = '<button class="btn btn-sm btn-outline-success" id="xSubj"><i class="fas fa-file-csv me-1"></i> تصدير</button>';
      const table = new Table(box, [
        { key: 'code', label: 'الكود', render: r => `<code>${esc(r.code)}</code>` },
        { key: 'name', label: 'المادة', render: r => `<b>${esc(r.name)}</b><div class="small text-muted-2">${esc(r.grade)} • ${esc(r.term)}</div>` },
        { key: 'lecturesDone', label: 'المحاضرات المنتهية', render: r => `<b>${r.lecturesDone}</b> / 15${r.currentLecture ? `<div class="small text-muted-2">التالية: رقم ${r.currentLecture}</div>` : '<div class="small text-success">اكتملت</div>'}` },
        { key: 'sessions', label: 'محاضرات مرصودة' },
        { key: 'enrolled', label: 'طلاب الفرقة' },
        { key: 'present', label: 'إجمالي الحضور', render: r => `${r.present}${r.otherGrade ? ` <span class="pill pill-warn" title="من فرق أخرى">+${r.otherGrade} تخلف</span>` : ''}` },
        { key: 'attendanceRate', label: 'نسبة الحضور', render: r => r.sessions ? rateHtml(r.attendanceRate) : '<span class="text-muted-2 small">لم تبدأ</span>' },
        { key: '_', label: '', sortable: false, render: r => ME.role === 'super_admin' || (ME.subjects || []).length > 1 ? `<button class="btn btn-sm btn-soft" data-drill="${esc(r.code)}">تفاصيل</button>` : '' }
      ], { sortKey: 'present', sortDir: -1 });
      table.setRows(d.subjects);
      box.onclick = e => {
        const b = e.target.closest('[data-drill]');
        if (!b) return;
        an.filters.subject = b.dataset.drill;
        an.tab = 'sessions';
        renderOverview();
      };
      document.getElementById('xSubj').addEventListener('click', () => downloadCSV(`المواد_${fileTag}.csv`,
        ['الكود', 'المادة', 'الفرقة', 'الترم', 'محاضرات', 'طلاب الفرقة', 'إجمالي الحضور', 'من فرق أخرى', 'نسبة الحضور %'],
        d.subjects.map(s => [s.code, s.name, s.grade, s.term, s.sessions, s.enrolled, s.present, s.otherGrade, s.attendanceRate])));
    }

    if (an.tab === 'sessions') {
      tools.innerHTML = '<button class="btn btn-sm btn-outline-success" id="xSess"><i class="fas fa-file-csv me-1"></i> تصدير</button>';
      const single = d.scope.length === 1;
      const table = new Table(box, [
        { key: 'lectureNo', label: 'المحاضرة', render: r => r.lectureNo ? `<span class="pill pill-brand">رقم ${r.lectureNo}</span>` : '<span class="text-muted-2 small">—</span>' },
        { key: 'date', label: 'التاريخ', render: r => `<b class="ltr">${esc(r.date)}</b>` },
        { key: 'subjectName', label: 'المادة', render: r => `${esc(r.subjectName)} <code>${esc(r.subjectCode)}</code>` },
        { key: 'present', label: 'حاضر', render: r => `<span class="pill pill-ok">${r.present}</span>` },
        { key: 'absent', label: 'غائب', render: r => `<span class="pill pill-bad">${r.absent}</span>` },
        { key: 'rate', label: 'النسبة', sortValue: r => r.enrolled ? r.present / r.enrolled : 0, render: r => rateHtml(r.enrolled ? Math.min(100, Math.round(r.present / r.enrolled * 100)) : 0) },
        { key: '_', label: '', sortable: false, render: r => single ? `<button class="btn btn-sm btn-soft" data-session="${esc(r.key)}"><i class="fas fa-list-check me-1"></i> كشف الحضور والغياب</button>` : '' }
      ], { sortKey: 'date', sortDir: -1 });
      table.setRows(d.sessions);
      if (!single) box.insertAdjacentHTML('afterbegin', '<div class="alert alert-info small py-2">اختر مادة واحدة من الفلتر لعرض كشف الحاضرين والغائبين بالأسماء لكل محاضرة.</div>');
      box.onclick = e => {
        const b = e.target.closest('[data-session]');
        if (b) showSessionSheet(b.dataset.session);
      };
      document.getElementById('xSess').addEventListener('click', () => downloadCSV(`المحاضرات_${fileTag}.csv`,
        ['رقم المحاضرة', 'التاريخ', 'كود المادة', 'المادة', 'الفرقة', 'حاضر', 'غائب', 'طلاب الفرقة'],
        d.sessions.map(s => [s.lectureNo || '', s.date, s.subjectCode, s.subjectName, s.grade, s.present, s.absent, s.enrolled])));
    }

    if (an.tab === 'students') {
      tools.innerHTML = `
        <input class="form-control form-control-sm" style="width:180px" id="stQ" placeholder="بحث بالاسم أو الكود">
        <select class="form-select form-select-sm" style="width:auto" id="stEnroll">${opts(META.enrollTypes, '', 'كل أنواع القيد')}</select>
        <select class="form-select form-select-sm" style="width:auto" id="stStatus">${opts(META.statuses, '', 'كل الحالات')}</select>
        <select class="form-select form-select-sm" style="width:auto" id="stRisk"><option value="">الكل</option><option value="risk">أقل من ${d.threshold}% فقط</option><option value="ok">${d.threshold}% فأكثر</option></select>
        <button class="btn btn-sm btn-outline-success" id="xStd"><i class="fas fa-file-csv me-1"></i> تصدير</button>`;
      const table = new Table(box, [
        { key: 'name', label: 'الطالب', render: r => `<b>${esc(r.name)}</b><div class="small"><code>${esc(r.code)}</code></div>` },
        { key: 'grade', label: 'الفرقة', render: r => `<span class="pill pill-gray">${esc(r.grade)}</span>` },
        { key: 'enrollType', label: 'القيد' },
        { key: 'attended', label: 'حضر', render: r => `${r.attended} / ${r.possible}` },
        { key: 'absent', label: 'غاب', render: r => r.absent ? `<span class="text-danger fw-800">${r.absent}</span>` : '0' },
        { key: 'attRate', label: 'نسبة الحضور', render: r => (r.possible ? rateHtml(r.attRate) : '<span class="text-muted-2 small">—</span>') + (r.atRisk ? ' <span class="pill pill-bad mt-1">معرض للحرمان</span>' : '') },
        { key: 'lastSeen', label: 'آخر حضور', render: r => `<span class="ltr small">${esc(r.lastSeen || '—')}</span>` }
      ], { sortKey: 'attRate', sortDir: 1 });
      const apply = () => {
        const q = document.getElementById('stQ').value.trim().toLowerCase();
        const en = document.getElementById('stEnroll').value;
        const stt = document.getElementById('stStatus').value;
        const rk = document.getElementById('stRisk').value;
        const rows = d.students.filter(s => (!q || s.name.toLowerCase().includes(q) || s.code.toLowerCase().includes(q)) &&
          (!en || s.enrollType === en) && (!stt || s.status === stt) && (!rk || (rk === 'risk' ? s.atRisk : !s.atRisk)));
        table.setRows(rows);
        return rows;
      };
      ['stQ', 'stEnroll', 'stStatus', 'stRisk'].forEach(id => document.getElementById(id).addEventListener('input', apply));
      apply();
      document.getElementById('xStd').addEventListener('click', () => downloadCSV(`نسب_الطلاب_${fileTag}.csv`,
        ['الكود', 'الاسم', 'الفرقة', 'نوع القيد', 'الحالة', 'حضر', 'من إجمالي', 'غاب', 'نسبة الحضور %', 'معرض للحرمان', 'آخر حضور'],
        apply().map(s => [s.code, s.name, s.grade, s.enrollType, s.status, s.attended, s.possible, s.absent, s.attRate, s.atRisk ? 'نعم' : 'لا', s.lastSeen])));
    }

    if (an.tab === 'records') {
      tools.innerHTML = `
        <input class="form-control form-control-sm" style="width:200px" id="rcQ" placeholder="بحث بالاسم أو الكود أو المسجل">
        <button class="btn btn-sm btn-outline-success" id="xRec"><i class="fas fa-file-csv me-1"></i> تصدير</button>`;
      const table = new Table(box, [
        { key: 'date', label: 'التاريخ', render: r => `<span class="ltr">${esc(r.date)}</span>` },
        { key: 'time', label: 'الساعة' },
        { key: 'studentName', label: 'الطالب', render: r => `<b>${esc(r.studentName)}</b> <code>${esc(r.studentCode)}</code>` },
        { key: 'grade', label: 'الفرقة' },
        { key: 'subjectName', label: 'المادة', render: r => `<span class="pill pill-brand">${esc(r.subjectName || r.subjectCode)}</span>` },
        { key: 'status', label: 'الحالة', render: r => `<span class="pill ${r.status === 'حاضر' ? 'pill-ok' : 'pill-warn'}">${esc(r.status)}</span>` },
        { key: 'recorder', label: 'سجّله', render: r => `<small class="text-muted-2 ltr">${esc(r.recorder)}</small>` }
      ], { sortKey: 'stamp', sortDir: -1 });
      const apply = () => {
        const q = document.getElementById('rcQ').value.trim().toLowerCase();
        const rows = d.recentRecords.filter(r => !q || [r.studentName, r.studentCode, r.recorder, r.subjectName].some(v => String(v).toLowerCase().includes(q)));
        table.setRows(rows);
        return rows;
      };
      document.getElementById('rcQ').addEventListener('input', apply);
      apply();
      document.getElementById('xRec').addEventListener('click', () => downloadCSV(`سجلات_الحضور_${fileTag}.csv`,
        ['التاريخ', 'الساعة', 'اسم الطالب', 'كود الطالب', 'الفرقة', 'الترم', 'كود المادة', 'المادة', 'الحالة', 'المسجل'],
        apply().map(r => [r.date, r.time, r.studentName, r.studentCode, r.grade, r.term, r.subjectCode, r.subjectName, r.status, r.recorder])));
    }
  }

  function showSessionSheet(key) {
    const d = an.data;
    const sess = d.sessions.find(s => s.key === key);
    if (!sess) return;
    const date = sess.date;
    const lecLabel = sess.lectureNo ? `المحاضرة رقم ${sess.lectureNo} — ` : '';
    const present = new Set(sess.presentCodes || []);
    const grade = d.scope[0].grade;
    const roster = d.students.filter(s => s.grade === grade);
    const presentList = roster.filter(s => present.has(s.code));
    const absentList = roster.filter(s => !present.has(s.code));
    const extra = [...present].filter(c => !roster.some(s => s.code === c));
    const list = arr => arr.length ? arr.map((s, i) => `<div class="d-flex justify-content-between border-bottom py-1 small"><span>${i + 1}. ${esc(s.name)}</span><code>${esc(s.code)}</code></div>`).join('') : '<div class="text-muted-2 small py-2">لا يوجد</div>';
    Swal.fire({
      width: 760,
      title: `كشف ${esc(sess.subjectName)}<div class="small fw-normal mt-1">${lecLabel}<span class="ltr d-inline-block">${esc(date)}</span></div>`,
      html: `
        <div class="row g-3 text-end">
          <div class="col-md-6"><div class="fw-800 text-success mb-1"><i class="fas fa-circle-check"></i> الحاضرون (${presentList.length + extra.length})</div><div style="max-height:340px;overflow:auto">${list(presentList)}${extra.length ? `<div class="small text-warning mt-2">+ ${extra.length} من خارج كشف الفرقة (تخلف أو موقوف)</div>` : ''}</div></div>
          <div class="col-md-6"><div class="fw-800 text-danger mb-1"><i class="fas fa-circle-xmark"></i> الغائبون (${absentList.length})</div><div style="max-height:340px;overflow:auto">${list(absentList)}</div></div>
        </div>`,
      showCancelButton: true,
      confirmButtonText: '<i class="fas fa-file-csv"></i> تصدير الكشف',
      cancelButtonText: 'إغلاق'
    }).then(r => {
      if (!r.isConfirmed) return;
      downloadCSV(`كشف_${sess.subjectCode}_${sess.lectureNo ? 'محاضرة' + sess.lectureNo + '_' : ''}${date}.csv`, ['الكود', 'الاسم', 'الفرقة', 'نوع القيد', 'الحالة'],
        [...presentList.map(s => [s.code, s.name, s.grade, s.enrollType, 'حاضر']), ...absentList.map(s => [s.code, s.name, s.grade, s.enrollType, 'غائب'])]);
    });
  }

  // ==================== 2. ماسح الحضور ====================
  const sc = { subject: null, cam: null, running: false, busy: false, last: '', lastAt: 0, count: 0, log: [], grade: '', term: '', q: '', lec: null, wantCam: false, paused: false, restarting: false, camError: false };

  function allowedScanSubjects() {
    if (ME.role === 'doctor') return (ME.subjects || []).map(s => SUBJECTS.find(x => x.code === s.code) || s);
    if (ME.role === 'leader' && ME.grade && ME.grade !== 'الكل') return SUBJECTS.filter(s => s.grade === ME.grade);
    return SUBJECTS;
  }

  function renderScanner() {
    const allowed = allowedScanSubjects();
    const simple = allowed.length <= 12;
    const banner = ME.role === 'leader'
      ? `<div class="role-banner" style="background:linear-gradient(135deg,#047857,#059669)"><div><div class="fw-800"><i class="fas fa-qrcode me-1"></i> وضع مسجل الحضور (ليدر دفعة)</div><div class="small opacity-75">${ME.grade && ME.grade !== 'الكل' ? `مصرح لك برصد مواد ${esc(ME.grade)}` : 'مصرح لك برصد كل المواد'} • لا يمكن الوصول للإحصائيات</div></div></div>`
      : ME.role === 'doctor'
        ? `<div class="role-banner" style="background:linear-gradient(135deg,#0369a1,#0284c7)"><div><div class="fw-800"><i class="fas fa-chalkboard-user me-1"></i> ماسح موادك</div><div class="small opacity-75">الماسح مقيد بالمواد المسندة إليك فقط</div></div></div>` : '';

    main.innerHTML = `
      <div class="page-title"><h2>ماسح الحضور</h2></div>
      ${banner}
      <div class="card-x" id="pickCard">
        <div class="card-head"><h3 class="card-title"><i class="fas fa-book-open"></i> اختر المحاضرة</h3></div>
        ${simple ? '' : `
          <div class="filter-bar mb-3">
            <div><label class="form-label">الفرقة</label><select class="form-select form-select-sm" id="scGrade">${opts([...new Set(allowed.map(s => s.grade))], sc.grade, 'كل الفرق')}</select></div>
            <div><label class="form-label">الترم</label><select class="form-select form-select-sm" id="scTerm">${opts(META.terms, sc.term, 'كل الترمات')}</select></div>
            <div style="grid-column: span 2"><label class="form-label">بحث</label><input class="form-control form-control-sm" id="scQ" value="${esc(sc.q)}" placeholder="اسم المادة أو الكود"></div>
          </div>`}
        <div class="subj-grid" id="subjGrid"></div>
      </div>
      <div class="card-x" id="lecCard" style="display:none"></div>
      <div class="row g-3" id="camArea" style="display:none">
        <div class="col-lg-7">
          <div class="card-x">
            <div class="card-head">
              <h3 class="card-title"><i class="fas fa-camera"></i> <span id="camTitle"></span></h3>
              <div class="d-flex gap-1"><button class="btn btn-sm btn-soft" data-cam="flip" title="تبديل الكاميرا الأمامية/الخلفية"><i class="fas fa-camera-rotate"></i></button><button class="btn btn-sm btn-soft" data-cam="restart" title="إعادة تشغيل الكاميرا"><i class="fas fa-rotate"></i> إعادة تشغيل</button></div>
            </div>
            <div id="reader"></div>
            <div class="scan-result idle" id="scanResult"><i class="fas fa-qrcode fa-2x mb-2"></i><div>وجّه الكاميرا نحو كارنيه الطالب</div></div>
          </div>
        </div>
        <div class="col-lg-5">
          <div class="card-x">
            <div class="d-flex justify-content-between align-items-center mb-3">
              <div><div class="counter" id="scCount">0</div><div class="small text-muted-2">حضور مسجل في هذه الجلسة</div></div>
              <button class="btn btn-sm btn-outline-success" id="xLog"><i class="fas fa-file-csv me-1"></i> تصدير الجلسة</button>
            </div>
            <div id="scLog" style="max-height:420px;overflow:auto"></div>
          </div>
        </div>
      </div>`;

    const drawGrid = () => {
      const q = sc.q.toLowerCase();
      const list = allowed.filter(s => (!sc.grade || s.grade === sc.grade) && (!sc.term || s.term === sc.term) && (!q || s.name.toLowerCase().includes(q) || s.code.toLowerCase().includes(q)));
      document.getElementById('subjGrid').innerHTML = list.length ? list.map(s => `
        <button class="subj-tile ${sc.subject && sc.subject.code === s.code ? 'active' : ''}" data-code="${esc(s.code)}">
          <div class="d-flex justify-content-between"><code>${esc(s.code)}</code><span class="small text-muted-2">${esc(s.grade || '')} • ${esc(s.term || '')}</span></div>
          <div class="nm">${esc(s.name)}</div>
        </button>`).join('') : '<div class="text-muted-2">لا توجد مواد مطابقة</div>';
    };
    drawGrid();
    if (!simple) {
      document.getElementById('scGrade').addEventListener('change', e => { sc.grade = e.target.value; drawGrid(); });
      document.getElementById('scTerm').addEventListener('change', e => { sc.term = e.target.value; drawGrid(); });
      document.getElementById('scQ').addEventListener('input', e => { sc.q = e.target.value; drawGrid(); });
    }
    document.getElementById('subjGrid').addEventListener('click', e => {
      const b = e.target.closest('[data-code]');
      if (b) startSubject(allowed.find(s => s.code === b.dataset.code));
    });
    document.getElementById('lecCard').addEventListener('click', onLectureAction);
    document.getElementById('xLog').addEventListener('click', () => {
      if (!sc.log.length) return toast('info', 'لا توجد تسجيلات بعد');
      downloadCSV(`جلسة_${sc.subject ? sc.subject.code : ''}_محاضرة${sc.lec && sc.lec.current ? sc.lec.current : ''}_${new Date().toISOString().slice(0, 10)}.csv`, ['الوقت', 'الطالب', 'الكود', 'النتيجة'], sc.log.map(l => [l.time, l.name, l.code, l.msg]));
    });
    drawLog();
    if (sc.subject && allowed.some(s => s.code === sc.subject.code)) startSubject(sc.subject);
  }

  function showPicker() {
    const pick = document.getElementById('pickCard');
    if (pick) pick.style.display = '';
    ['lecCard', 'camArea'].forEach(id => { const el = document.getElementById(id); if (el) el.style.display = 'none'; });
  }

  async function startSubject(subject) {
    if (!subject) return;
    if (!sc.subject || sc.subject.code !== subject.code) { sc.count = 0; sc.log = []; }
    sc.subject = subject;
    document.getElementById('pickCard').style.display = 'none';
    const card = document.getElementById('lecCard');
    card.style.display = '';
    card.innerHTML = `<div class="text-center text-muted-2 py-4"><span class="spin me-2"></span> جاري تحميل محاضرات ${esc(subject.name)}...</div>`;
    document.getElementById('scCount').textContent = sc.count;
    drawLog();
    await refreshLectures();
  }

  // ===== المحاضرات 1 → 15: لا مسح إلا داخل محاضرة مفتوحة اليوم =====
  // عدة ليدرز ممكن يمسحوا نفس المادة في نفس الوقت: الحالة تتزامن كل 15 ثانية من السيرفر
  async function refreshLectures(opts = {}) {
    if (!sc.subject) return;
    const card = document.getElementById('lecCard');
    const prev = sc.lec;
    let next;
    try {
      next = await api('/api/lectures?subject=' + encodeURIComponent(sc.subject.code));
    } catch (e) {
      if (!opts.silent) card.innerHTML = errorHtml(e.message);
      return;
    }
    if (currentSection !== 'scanner' || !sc.subject || next.subject.code !== sc.subject.code) return;
    sc.lec = next;

    // تنبيه لو ليدر تاني أنهى أو فتح المحاضرة من جهاز آخر
    if (opts.silent && prev && prev.subject.code === next.subject.code) {
      if (prev.openToday && !next.openToday) {
        const ended = next.lectures[prev.current - 1];
        say('info', `تم إنهاء المحاضرة رقم ${prev.current}`, ended && ended.endedBy ? `أنهاها ${ended.endedBy}${ended.endTime ? ' الساعة ' + ended.endTime : ''}` : 'تم إنهاؤها من جهاز آخر');
      } else if (!prev.openToday && next.openToday) {
        toast('info', `تم فتح المحاضرة رقم ${next.current}`);
      }
    }

    drawLectures();
    const cam = document.getElementById('camArea');
    if (sc.lec.openToday) {
      cam.style.display = '';
      document.getElementById('camTitle').textContent = `${sc.subject.name} — المحاضرة رقم ${sc.lec.current}`;
      if (!sc.wantCam) {
        setResult('idle', '<i class="fas fa-qrcode fa-2x mb-2"></i><div>وجّه الكاميرا نحو كارنيه الطالب</div>');
        await startCamera();
      }
    } else {
      await stopCamera();
      cam.style.display = 'none';
    }
  }

  setInterval(() => {
    const dialogOpen = Swal.isVisible() && !Swal.getPopup().classList.contains('swal2-toast');
    if (currentSection === 'scanner' && sc.subject && sc.lec && !sc.busy && document.visibilityState === 'visible' && !dialogOpen) {
      refreshLectures({ silent: true });
    }
  }, 20000);

  function drawLectures() {
    const L = sc.lec;
    const done = L.lectures.filter(l => l.state === 'done').length;
    const isSuper = ME.role === 'super_admin';
    const tile = l => {
      const map = {
        done: ['lec-done', 'fa-circle-check', `${esc(l.endDate || l.startDate)}<br>${l.count} حاضر`],
        open: ['lec-open', 'fa-tower-broadcast', 'مفتوحة الآن'],
        next: ['lec-next', 'fa-lock-open', L.nextBlockedToday ? 'المرة القادمة' : 'التالية'],
        locked: ['lec-locked', 'fa-lock', 'مقفولة']
      };
      const [cls, icon, sub] = map[l.state];
      const tip = l.state === 'done' ? `بدأت ${l.startDate} ${l.startTime || ''} • انتهت ${l.endDate} ${l.endTime || ''} • ${l.endedBy || ''}` : l.state === 'open' ? `فتحها ${l.startedBy} الساعة ${l.startTime}` : '';
      return `<div class="lec-tile ${cls}" title="${esc(tip)}"><i class="fas ${icon}"></i><div class="lec-no">${l.no}</div><div class="lec-sub">${sub}</div></div>`;
    };
    // إعادة فتح آخر محاضرة منتهية: لأي ليدر/دكتور/مشرف ما دامت المحاضرة التالية لم تبدأ
    const lastDone = L.lectures.filter(l => l.state === 'done').pop();
    const canReopen = !!lastDone && !L.openToday && !L.staleOpen;
    const reopenBtn = canReopen ? `<button class="btn btn-outline-primary fw-800" data-lec="reopen" data-no="${lastDone.no}"><i class="fas fa-rotate-left me-1"></i> إعادة فتح المحاضرة رقم ${lastDone.no}</button>` : '';
    let action = '';
    if (L.completed) {
      action = `<div class="lec-action info"><div><div class="fw-900"><i class="fas fa-flag-checkered me-1"></i> تم إنهاء المحاضرات الـ 15 لهذه المادة</div>${canReopen ? '<div class="small">لو المحاضرة الأخيرة اتقفلت بالغلط يمكنك إعادة فتحها.</div>' : ''}</div>${reopenBtn}</div>`;
    } else if (L.openToday) {
      const cur = L.lectures[L.current - 1];
      action = `<div class="lec-action open"><div><div class="fw-900">المحاضرة رقم ${L.current} مفتوحة الآن</div>
          <div class="small">فتحها ${esc(cur.startedBy || '')}${cur.startTime ? ' الساعة ' + esc(cur.startTime) : ''} • أي ليدر مصرح له يقدر يمسح فيها من جهازه.</div></div>
        <button class="btn btn-danger fw-800" data-lec="finish"><i class="fas fa-flag-checkered me-1"></i> تم إنهاء المحاضرة رقم ${L.current} اليوم</button></div>`;
    } else if (L.staleOpen) {
      const cur = L.lectures[L.current - 1];
      action = `<div class="lec-action warn"><div><div class="fw-900">المحاضرة رقم ${L.current} مفتوحة منذ ${esc(cur.startDate)} ولم يتم إنهاؤها</div><div class="small">أنهها أولاً، ثم تُفتح المحاضرة التالية.</div></div>
        <button class="btn btn-warning fw-800" data-lec="finish"><i class="fas fa-flag-checkered me-1"></i> إنهاء المحاضرة رقم ${L.current}</button></div>`;
    } else if (L.nextBlockedToday) {
      action = `<div class="lec-action info"><div><div class="fw-900"><i class="fas fa-lock me-1"></i> المحاضرة رقم ${L.current} تُفتح في المرة القادمة</div>
          <div class="small">تم إنهاء المحاضرة رقم ${L.current - 1} اليوم${lastDone && lastDone.endedBy ? ` بواسطة ${esc(lastDone.endedBy)}` : ''}. ${canReopen ? 'لو اتقفلت بالغلط وفيه طلاب لسه عايزين يسجلوا، أعد فتحها.' : ''}</div></div>
        <div class="d-flex gap-2 flex-wrap">${reopenBtn}${isSuper ? `<button class="btn btn-outline-secondary btn-sm" data-lec="force"><i class="fas fa-key me-1"></i> فتح المحاضرة ${L.current} استثنائياً</button>` : ''}</div></div>`;
    } else {
      action = `<div class="lec-action ready"><div><div class="fw-900">جاهز لبدء المحاضرة رقم ${L.current}</div><div class="small">بعد البدء تعمل الكاميرا ويتم تسجيل الحضور على المحاضرة رقم ${L.current}.${canReopen ? ` لو فيه طلاب لسه عايزين يسجلوا في المحاضرة رقم ${lastDone.no} أعد فتحها أولاً.` : ''}</div></div>
        <div class="d-flex gap-2 flex-wrap">${reopenBtn}<button class="btn btn-brand fw-800 px-4" data-lec="start"><i class="fas fa-play me-1"></i> بدء المحاضرة رقم ${L.current}</button></div></div>`;
    }
    document.getElementById('lecCard').innerHTML = `
      <div class="card-head">
        <div><h3 class="card-title"><i class="fas fa-list-ol"></i> ${esc(L.subject.name)} <code>${esc(L.subject.code)}</code></h3>
          <div class="small text-muted-2 mt-1">${esc(L.subject.grade)} • ${esc(L.subject.term)} • ${done} من 15 محاضرة منتهية</div></div>
        <button class="btn btn-sm btn-soft" data-lec="change"><i class="fas fa-repeat me-1"></i> تغيير المادة</button>
      </div>
      <div class="rate-bar mb-3" style="height:6px"><span style="width:${Math.round(done / 15 * 100)}%;background:var(--ok)"></span></div>
      <div class="lec-grid mb-3">${L.lectures.map(tile).join('')}</div>
      ${action}`;
  }

  async function onLectureAction(e) {
    const b = e.target.closest('[data-lec]');
    if (!b || !sc.lec) return;
    const act = b.dataset.lec;
    const code = sc.subject.code;
    const no = sc.lec.current;
    if (act === 'change') { await stopCamera(); showPicker(); return; }
    let body = null;
    if (act === 'start') body = { action: 'start', subjectCode: code, lectureNo: no };
    if (act === 'force') {
      const c = await Swal.fire({ icon: 'warning', title: `فتح المحاضرة رقم ${no} اليوم؟`, text: 'تم عقد محاضرة لهذه المادة اليوم بالفعل. استخدم هذا فقط لو المادة لها محاضرتان في نفس اليوم.', showCancelButton: true, confirmButtonText: 'نعم، افتحها', cancelButtonText: 'إلغاء' });
      if (!c.isConfirmed) return;
      body = { action: 'start', subjectCode: code, lectureNo: no, force: true };
    }
    if (act === 'finish') {
      const c = await Swal.fire({ icon: 'question', title: `إنهاء المحاضرة رقم ${no}؟`, html: `سيتوقف المسح في هذه المحاضرة <b>عند كل الليدرز وعلى كل الأجهزة</b>.<br>تأكد أن كل الطلاب سجلوا حضورهم.<br><small class="text-muted">لو أنهيتها بالغلط يمكن إعادة فتحها اليوم.</small>`, showCancelButton: true, confirmButtonText: 'نعم، تم إنهاء المحاضرة', cancelButtonText: 'إلغاء', focusCancel: true });
      if (!c.isConfirmed) return;
      body = { action: 'finish', subjectCode: code, lectureNo: no };
    }
    if (act === 'reopen') {
      const rn = parseInt(b.dataset.no, 10);
      const c = await Swal.fire({ icon: 'warning', title: `إعادة فتح المحاضرة رقم ${rn}؟`, text: 'للطلاب الذين لم يسجلوا بعد. الحضور المسجل قبل كده محفوظ، وبعد الانتهاء اضغط "تم إنهاء المحاضرة" مرة أخرى. العملية مسجلة باسمك.', showCancelButton: true, confirmButtonText: 'إعادة فتح', cancelButtonText: 'إلغاء' });
      if (!c.isConfirmed) return;
      body = { action: 'reopen', subjectCode: code, lectureNo: rn };
    }
    if (!body) return;
    b.disabled = true;
    try {
      const r = await api('/api/lectures', { method: 'POST', body });
      if (act === 'finish') {
        await stopCamera();
        Swal.fire({ icon: 'success', titleText: r.message, text: 'المحاضرة التالية تُفتح في المرة القادمة.', timer: 2600, showConfirmButton: false });
      } else toast('success', r.message);
      if (act === 'start' || act === 'force') { sc.count = 0; sc.log = []; document.getElementById('scCount').textContent = 0; drawLog(); }
    } catch (err) {
      say('warning', 'تنبيه', err.message);
    }
    await refreshLectures();
  }

  // ===== الكاميرا: ماسح خفيف مكتوب خصيصاً (بدون html5-qrcode) =====
  // - كاميرا واحدة فقط في أي وقت (رقم جيل لكل تشغيل يمنع تشغيلين متداخلين = شاشة سودا)
  // - قراءة QR بقارئ الهاتف المدمج (BarcodeDetector) أو jsQR على جزء صغير من الصورة ~7 مرات/ثانية
  // - عند الخروج من التطبيق أو قفل الشاشة تُغلق الكاميرا، وعند الرجوع تُفتح من جديد
  // - مراقبة كل 3 ثواني: لو الصورة وقفت أو اسودّت تُعاد تشغيل الكاميرا تلقائياً
  // - الشاشة لا تنطفئ أثناء المسح (Wake Lock)
  const cam = { gen: 0, stream: null, video: null, canvas: null, ctx: null, detector: undefined, timer: null, facing: 'environment', lastTime: -1, stuck: 0, restarts: [] };

  let wakeLock = null;
  async function keepScreenOn() {
    try {
      if ('wakeLock' in navigator && document.visibilityState === 'visible' && !wakeLock) {
        wakeLock = await navigator.wakeLock.request('screen');
        wakeLock.addEventListener('release', () => { wakeLock = null; });
      }
    } catch (e) { wakeLock = null; }
  }
  function releaseScreen() {
    try { if (wakeLock) wakeLock.release(); } catch (e) { /* ignore */ }
    wakeLock = null;
  }

  function releaseStream() {
    clearTimeout(cam.timer);
    cam.timer = null;
    if (cam.stream) cam.stream.getTracks().forEach(t => { try { t.stop(); } catch (e) { /* ignore */ } });
    if (cam.video) { try { cam.video.pause(); cam.video.srcObject = null; } catch (e) { /* ignore */ } }
    cam.stream = null;
    cam.video = null;
    sc.running = false;
  }

  function showCamError(msg) {
    sc.camError = true;
    const reader = document.getElementById('reader');
    if (reader) reader.innerHTML = '<div class="cam-off"><i class="fas fa-video-slash fa-2x mb-2"></i><div>الكاميرا متوقفة</div></div>';
    setResult('bad', `<div class="fw-800">تعذر تشغيل الكاميرا</div><div class="small">${esc(msg)}</div><button class="btn btn-sm btn-brand mt-2" data-cam="restart"><i class="fas fa-camera me-1"></i> إعادة المحاولة</button>`);
  }

  async function getDetector() {
    if (cam.detector !== undefined) return cam.detector;
    cam.detector = null;
    try {
      if ('BarcodeDetector' in window) {
        const formats = await window.BarcodeDetector.getSupportedFormats();
        if (formats.includes('qr_code')) cam.detector = new window.BarcodeDetector({ formats: ['qr_code'] });
      }
    } catch (e) { cam.detector = null; }
    return cam.detector;
  }

  async function startCamera() {
    sc.wantCam = true;
    sc.camError = false;
    const gen = ++cam.gen;
    releaseStream();
    const reader = document.getElementById('reader');
    if (!reader) return;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      return showCamError('المتصفح لا يدعم الكاميرا. افتح الموقع من Chrome أو Safari مباشرة (وليس من داخل فيسبوك/واتساب).');
    }
    reader.innerHTML = '<div class="cam-off"><span class="spin me-2"></span> جاري تشغيل الكاميرا...</div>';

    let stream = null;
    const tries = [
      { video: { facingMode: { ideal: cam.facing }, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 24, max: 30 } }, audio: false },
      { video: { facingMode: cam.facing }, audio: false },
      { video: true, audio: false }
    ];
    let lastErr = null;
    for (const c of tries) {
      try { stream = await navigator.mediaDevices.getUserMedia(c); break; } catch (e) {
        lastErr = e;
        if (e && (e.name === 'NotAllowedError' || e.name === 'SecurityError')) break;
      }
    }
    if (gen !== cam.gen || !sc.wantCam) {
      if (stream) stream.getTracks().forEach(t => t.stop());
      return;
    }
    if (!stream) {
      const denied = lastErr && lastErr.name === 'NotAllowedError';
      return showCamError(denied ? 'لم يتم السماح باستخدام الكاميرا. اسمح للموقع بالكاميرا من إعدادات المتصفح ثم أعد المحاولة.' : 'الكاميرا مشغولة أو غير متاحة. أغلق أي تطبيق آخر يستخدم الكاميرا ثم أعد المحاولة.');
    }

    cam.stream = stream;
    reader.innerHTML = '<video playsinline muted autoplay></video><div class="scan-frame"></div>';
    const video = reader.querySelector('video');
    video.muted = true;
    video.setAttribute('playsinline', '');
    video.srcObject = stream;
    cam.video = video;
    try { await video.play(); } catch (e) { /* يُعاد المحاولة بالمراقبة */ }
    const track = stream.getVideoTracks()[0];
    if (track) track.addEventListener('ended', () => { if (gen === cam.gen && sc.wantCam) restartCamera('track-ended'); });

    await getDetector();
    if (gen !== cam.gen) return;
    cam.lastTime = -1;
    cam.stuck = 0;
    sc.running = true;
    keepScreenOn();
    scheduleScan(gen);
  }

  function scheduleScan(gen) {
    cam.timer = setTimeout(() => scanFrame(gen), 140);
  }

  async function scanFrame(gen) {
    if (gen !== cam.gen || !cam.video) return;
    const v = cam.video;
    try {
      if (!sc.paused && !sc.busy && v.readyState >= 2 && v.videoWidth && document.visibilityState === 'visible') {
        const text = await decodeFrame(v);
        if (text && gen === cam.gen) onScan(text);
      }
    } catch (e) { /* إطار غير صالح: نكمل */ }
    if (gen === cam.gen) scheduleScan(gen);
  }

  async function decodeFrame(v) {
    if (cam.detector) {
      try {
        const codes = await cam.detector.detect(v);
        return codes && codes[0] ? codes[0].rawValue : null;
      } catch (e) {
        cam.detector = null; // بعض الأجهزة يفشل فيها القارئ المدمج: نرجع لـ jsQR
      }
    }
    if (!window.jsQR) return null;
    const w = v.videoWidth;
    const h = v.videoHeight;
    const side = Math.floor(Math.min(w, h) * 0.85);
    const size = Math.min(520, side);
    if (!cam.canvas) {
      cam.canvas = document.createElement('canvas');
      cam.ctx = cam.canvas.getContext('2d', { willReadFrequently: true });
    }
    if (cam.canvas.width !== size) { cam.canvas.width = size; cam.canvas.height = size; }
    cam.ctx.drawImage(v, (w - side) / 2, (h - side) / 2, side, side, 0, 0, size, size);
    const img = cam.ctx.getImageData(0, 0, size, size);
    const res = window.jsQR(img.data, size, size, { inversionAttempts: 'dontInvert' });
    return res ? res.data : null;
  }

  async function stopCamera(opts = {}) {
    if (!opts.restart) {
      sc.wantCam = false;
      cam.gen++;
      releaseScreen();
    }
    releaseStream();
  }

  async function restartCamera(reason) {
    if (sc.restarting || !sc.wantCam) return;
    const now = Date.now();
    cam.restarts = cam.restarts.filter(t => now - t < 60000);
    if (cam.restarts.length >= 6) {
      releaseStream();
      return showCamError('الكاميرا توقفت أكثر من مرة. اضغط إعادة المحاولة، ولو تكرر أعد تحميل الصفحة.');
    }
    cam.restarts.push(now);
    sc.restarting = true;
    console.warn('camera restart:', reason);
    try { await startCamera(); } finally { sc.restarting = false; }
  }

  function cameraHealthy() {
    const v = cam.video;
    const track = cam.stream && cam.stream.getVideoTracks()[0];
    if (!v || !track || track.readyState !== 'live') return false;
    if (v.paused) { v.play().catch(() => {}); cam.stuck++; return cam.stuck < 2; }
    if (v.readyState < 2 || v.currentTime === cam.lastTime) { cam.stuck++; return cam.stuck < 3; }
    cam.stuck = 0;
    cam.lastTime = v.currentTime;
    return true;
  }

  setInterval(() => {
    if (!sc.wantCam || sc.camError || sc.restarting || currentSection !== 'scanner' || document.visibilityState !== 'visible') return;
    if (!cameraHealthy()) restartCamera('watchdog');
  }, 3000);

  // الخروج من التطبيق/قفل الشاشة: نغلق الكاميرا. الرجوع: نفتحها من جديد (يمنع الشاشة السودا)
  document.addEventListener('visibilitychange', () => {
    if (!sc.wantCam || currentSection !== 'scanner') return;
    if (document.visibilityState === 'hidden') {
      cam.gen++;
      releaseStream();
    } else {
      cam.restarts = [];
      if (!sc.camError) startCamera();
      keepScreenOn();
      if (sc.subject) refreshLectures({ silent: true });
    }
  });

  document.addEventListener('click', e => {
    const b = e.target.closest('[data-cam]');
    if (!b) return;
    if (b.dataset.cam === 'restart') { cam.restarts = []; startCamera(); }
    if (b.dataset.cam === 'flip') { cam.facing = cam.facing === 'environment' ? 'user' : 'environment'; cam.restarts = []; startCamera(); }
  });

  function setResult(kind, html) {
    const el = document.getElementById('scanResult');
    if (!el) return;
    el.className = `scan-result ${kind}`;
    el.innerHTML = html;
  }

  // صوت واحد مشترك: إنشاء AudioContext جديد مع كل مسح كان يسبب تعليق الصفحة وشاشة سوداء بعد عدة مسحات
  let audioCtx = null;
  function feedback(ok) {
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === 'suspended') audioCtx.resume();
      const ctx = audioCtx;
      const play = (freq, at, dur) => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.connect(g); g.connect(ctx.destination);
        o.frequency.value = freq;
        g.gain.setValueAtTime(0.25, ctx.currentTime + at);
        o.start(ctx.currentTime + at);
        o.stop(ctx.currentTime + at + dur);
        o.onended = () => { try { o.disconnect(); g.disconnect(); } catch (e) { /* ignore */ } };
      };
      if (ok) { play(880, 0, 0.12); play(1320, 0.13, 0.15); } else { play(300, 0, 0.35); }
      if (navigator.vibrate && navigator.userActivation && navigator.userActivation.hasBeenActive) navigator.vibrate(ok ? 80 : [200, 80, 200]);
    } catch (e) { /* ignore */ }
  }

  async function onScan(text) {
    const now = Date.now();
    if (sc.busy || !sc.subject) return;
    if (text === sc.last && now - sc.lastAt < 5000) return;
    sc.last = text;
    sc.lastAt = now;
    sc.busy = true;
    setResult('idle', '<span class="spin me-2"></span> جاري التحقق من الكارنيه...');
    try {
      let res = await api('/api/attendance', { method: 'POST', body: { qrData: text, subjectCode: sc.subject.code } });
      if (res.type === 'confirm_grade') {
        sc.paused = true;
        feedback(false);
        const c = await Swal.fire({ icon: 'warning', title: 'طالب من فرقة أخرى', text: res.message, showCancelButton: true, confirmButtonText: 'نعم، سجّله', cancelButtonText: 'لا' });
        sc.paused = false;
        if (!c.isConfirmed) {
          setResult('warn', `<div class="who">${esc(res.studentName)}</div><div>لم يتم التسجيل</div>`);
          addLog(res.studentName, res.studentCode, 'تم الإلغاء (فرقة أخرى)', 'warn');
          return;
        }
        res = await api('/api/attendance', { method: 'POST', body: { qrData: text, subjectCode: sc.subject.code, confirmOtherGrade: true } });
      }
      if (res.success) {
        feedback(true);
        sc.count++;
        document.getElementById('scCount').textContent = sc.count;
        setResult('ok', `<i class="fas fa-circle-check fa-2x mb-1"></i><div class="who">${esc(res.studentName)}</div><div><code>${esc(res.studentCode)}</code> • ${esc(res.studentGrade)} • ${esc(res.enrollType || '')}</div><div class="small mt-1">${esc(res.status)} • المحاضرة رقم ${esc(res.lectureNo)} • ${esc(res.time)}</div>`);
        addLog(res.studentName, res.studentCode, res.status, 'ok', res.time);
      } else {
        feedback(false);
        const kind = res.type === 'duplicate' ? 'warn' : 'bad';
        const icon = res.type === 'forged' ? 'fa-user-secret' : res.type === 'duplicate' ? 'fa-clone' : 'fa-circle-xmark';
        setResult(kind, `<i class="fas ${icon} fa-2x mb-1"></i>${res.studentName ? `<div class="who">${esc(res.studentName)}</div>` : ''}<div class="fw-800">${esc(res.message)}</div>`);
        addLog(res.studentName || 'كارنيه مرفوض', res.studentCode || '', res.message, kind);
        if (res.type === 'no_lecture') refreshLectures();
      }
    } catch (e) {
      feedback(false);
      sc.last = ''; // يسمح بإعادة مسح نفس الكارنيه فوراً بعد خطأ اتصال
      setResult('bad', `<div class="fw-800">${esc(e.message)}</div><div class="small">وجّه الكاميرا للكارنيه مرة أخرى.</div>`);
    } finally {
      setTimeout(() => { sc.busy = false; }, 1200);
    }
  }

  function addLog(name, code, msg, kind, time) {
    sc.log.unshift({ name, code, msg, kind, time: time || new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }) });
    drawLog();
  }

  function drawLog() {
    const el = document.getElementById('scLog');
    if (!el) return;
    const cls = { ok: 'pill-ok', warn: 'pill-warn', bad: 'pill-bad' };
    el.innerHTML = sc.log.length ? sc.log.map(l => `
      <div class="log-item" style="background:${l.kind === 'ok' ? '#f0fdf4' : l.kind === 'warn' ? '#fffbeb' : '#fef2f2'}">
        <div><b>${esc(l.name)}</b> ${l.code ? `<code>${esc(l.code)}</code>` : ''}<div class="small text-muted-2">${esc(l.msg)}</div></div>
        <span class="pill ${cls[l.kind]}">${esc(l.time)}</span>
      </div>`).join('') : '<div class="text-center text-muted-2 small py-4">لم يتم مسح أي كارنيه بعد</div>';
  }

  // ==================== 3. الطلاب ====================
  const st = { list: [], q: '', grade: '', enroll: '', status: '', active: '', selected: new Set() };

  async function renderStudents() {
    main.innerHTML = `
      <div class="page-title"><h2>إدارة الطلاب</h2>
        <div class="d-flex gap-2"><a class="btn btn-soft btn-sm" href="/" target="_blank" rel="noopener"><i class="fas fa-user-plus me-1"></i> صفحة تسجيل الطلاب</a>
        <button class="btn btn-outline-success btn-sm" id="xStudents"><i class="fas fa-file-csv me-1"></i> تصدير</button></div></div>
      <div class="card-x">
        <div class="filter-bar mb-3">
          <div style="grid-column: span 2"><label class="form-label">بحث</label><input class="form-control form-control-sm" id="sQ" placeholder="الاسم أو الكود" value="${esc(st.q)}"></div>
          <div><label class="form-label">الفرقة</label><select class="form-select form-select-sm" id="sGrade">${opts([...META.grades, 'خريج'], st.grade, 'كل الفرق')}</select></div>
          <div><label class="form-label">نوع القيد</label><select class="form-select form-select-sm" id="sEnroll">${opts(META.enrollTypes, st.enroll, 'الكل')}</select></div>
          <div><label class="form-label">الحالة</label><select class="form-select form-select-sm" id="sStatus">${opts(META.statuses, st.status, 'الكل')}</select></div>
          <div><label class="form-label">الحساب</label><select class="form-select form-select-sm" id="sActive">${opts([{ value: '1', label: 'نشط' }, { value: '0', label: 'موقوف' }], st.active, 'الكل')}</select></div>
        </div>
        <div id="stBulk" class="alert alert-danger d-none justify-content-between align-items-center flex-wrap gap-2 py-2">
          <span class="fw-800"><i class="fas fa-square-check me-1"></i> تم تحديد <span id="stSelCount">0</span> طالب</span>
          <div class="d-flex gap-2"><button class="btn btn-sm btn-light" id="stClearSel">إلغاء التحديد</button><button class="btn btn-sm btn-danger" id="stDeleteSel"><i class="fas fa-trash me-1"></i> حذف المحددين</button></div>
        </div>
        <div id="stTable">${loadingHtml()}</div>
      </div>`;

    st.selected.clear();
    let visibleRows = [];
    const syncSelection = () => {
      document.getElementById('stSelCount').textContent = st.selected.size;
      const bulk = document.getElementById('stBulk');
      bulk.classList.toggle('d-none', st.selected.size === 0);
      bulk.classList.toggle('d-flex', st.selected.size > 0);
      const all = document.getElementById('stAll');
      if (all) {
        const n = visibleRows.filter(r => st.selected.has(r.code)).length;
        all.checked = visibleRows.length > 0 && n === visibleRows.length;
        all.indeterminate = n > 0 && n < visibleRows.length;
      }
    };

    const table = new Table(document.getElementById('stTable'), [
      { key: '_sel', label: '', sortable: false, headerHtml: '<input type="checkbox" class="form-check-input" id="stAll" title="تحديد كل الطلاب الظاهرين">', render: r => `<input type="checkbox" class="form-check-input stChk" value="${esc(r.code)}" ${st.selected.has(r.code) ? 'checked' : ''}>` },
      { key: 'code', label: 'الكود', render: r => `<code>${esc(r.code)}</code>` },
      { key: 'name', label: 'الاسم', render: r => `<b>${esc(r.name)}</b>` },
      { key: 'grade', label: 'الفرقة', render: r => `<span class="pill pill-gray">${esc(r.grade)}</span>` },
      { key: 'enrollType', label: 'القيد' },
      { key: 'status', label: 'الحالة' },
      { key: 'active', label: 'الحساب', render: r => r.active ? '<span class="pill pill-ok">نشط</span>' : '<span class="pill pill-bad">موقوف</span>' },
      { key: '_', label: 'إجراءات', sortable: false, render: r => `
        <div class="btn-group btn-group-sm">
          <button class="btn btn-soft" data-st="edit" data-code="${esc(r.code)}" title="تعديل"><i class="fas fa-pen"></i></button>
          <button class="btn btn-soft" data-st="card" data-code="${esc(r.code)}" title="الكارنيه"><i class="fas fa-id-card"></i></button>
          <button class="btn btn-soft ${r.active ? 'text-danger' : 'text-success'}" data-st="toggle" data-code="${esc(r.code)}" title="${r.active ? 'إيقاف' : 'تفعيل'}"><i class="fas ${r.active ? 'fa-ban' : 'fa-check'}"></i></button>
          <button class="btn btn-soft text-danger" data-st="delete" data-code="${esc(r.code)}" title="حذف نهائي"><i class="fas fa-trash"></i></button>
        </div>` }
    ], { sortKey: 'code', onRender: rows => { visibleRows = rows; syncSelection(); } });

    document.getElementById('stTable').addEventListener('change', e => {
      if (e.target.id === 'stAll') {
        visibleRows.forEach(r => (e.target.checked ? st.selected.add(r.code) : st.selected.delete(r.code)));
        document.querySelectorAll('.stChk').forEach(c => { c.checked = e.target.checked; });
      } else if (e.target.classList.contains('stChk')) {
        if (e.target.checked) st.selected.add(e.target.value); else st.selected.delete(e.target.value);
      } else return;
      syncSelection();
    });
    document.getElementById('stClearSel').addEventListener('click', () => {
      st.selected.clear();
      document.querySelectorAll('.stChk').forEach(c => { c.checked = false; });
      syncSelection();
    });
    document.getElementById('stDeleteSel').addEventListener('click', () => confirmDelete(st.list.filter(s => st.selected.has(s.code))));

    async function confirmDelete(targets) {
      if (!targets.length) return;
      const names = targets.slice(0, 8).map(s => `<li>${esc(s.name)} <code>${esc(s.code)}</code></li>`).join('') + (targets.length > 8 ? `<li>... و ${targets.length - 8} آخرين</li>` : '');
      const c = await Swal.fire({
        icon: 'warning',
        title: 'هل أنت متأكد من الحذف؟',
        html: `<p>سيتم حذف <b>${targets.length}</b> طالب نهائياً من الشيت، ولن يُقبل كارنيههم بعد ذلك.</p><ul class="small">${names}</ul><p class="small text-muted-2 mb-0">سجلات الحضور السابقة تبقى محفوظة كأرشيف. لا يمكن التراجع عن الحذف.</p>`,
        showCancelButton: true,
        confirmButtonText: '<i class="fas fa-trash"></i> نعم، احذف',
        cancelButtonText: 'إلغاء',
        focusCancel: true,
        customClass: { confirmButton: 'swal-danger' },
        showLoaderOnConfirm: true,
        preConfirm: async () => {
          try {
            return await api('/api/students', { method: 'DELETE', body: { codes: targets.map(s => s.code) } });
          } catch (err) { Swal.showValidationMessage(esc(err.message)); }
        }
      });
      if (c.isConfirmed && c.value) {
        targets.forEach(s => st.selected.delete(s.code));
        toast('success', c.value.message);
        reload();
      }
    }

    const filtered = () => {
      const q = st.q.trim().toLowerCase();
      return st.list.filter(s => (!q || s.name.toLowerCase().includes(q) || s.code.toLowerCase().includes(q)) &&
        (!st.grade || s.grade === st.grade) && (!st.enroll || s.enrollType === st.enroll) && (!st.status || s.status === st.status) &&
        (!st.active || (st.active === '1') === s.active));
    };
    const apply = () => table.setRows(filtered());
    [['sQ', 'q'], ['sGrade', 'grade'], ['sEnroll', 'enroll'], ['sStatus', 'status'], ['sActive', 'active']].forEach(([id, k]) => {
      document.getElementById(id).addEventListener('input', e => { st[k] = e.target.value; apply(); });
    });
    document.getElementById('xStudents').addEventListener('click', () => downloadCSV(`الطلاب_${new Date().toISOString().slice(0, 10)}.csv`,
      ['الكود', 'الاسم', 'الفرقة', 'نوع القيد', 'الحالة', 'الحساب', 'تاريخ التسجيل'], filtered().map(s => [s.code, s.name, s.grade, s.enrollType, s.status, s.active ? 'نشط' : 'موقوف', s.createdAt])));

    document.getElementById('stTable').addEventListener('click', async e => {
      const b = e.target.closest('[data-st]');
      if (!b) return;
      const s = st.list.find(x => x.code === b.dataset.code);
      if (!s) return;
      if (b.dataset.st === 'edit') editStudent(s, reload);
      if (b.dataset.st === 'card') showStudentCard(s.code);
      if (b.dataset.st === 'delete') confirmDelete([s]);
      if (b.dataset.st === 'toggle') {
        const c = await Swal.fire({ icon: 'warning', title: s.active ? 'إيقاف الطالب؟' : 'تفعيل الطالب؟', text: s.active ? `لن يتم قبول كارنيه ${s.name} في أي محاضرة حتى يعاد تفعيله.` : '', showCancelButton: true, confirmButtonText: 'تأكيد', cancelButtonText: 'إلغاء' });
        if (!c.isConfirmed) return;
        try {
          await api('/api/students', { method: 'PUT', body: { code: s.code, active: !s.active } });
          toast('success', 'تم التحديث');
          reload();
        } catch (err) { say('error', 'خطأ', err.message); }
      }
    });

    async function reload() {
      try {
        st.list = (await api('/api/students')).students;
        apply();
      } catch (e) {
        document.getElementById('stTable').innerHTML = errorHtml(e.message);
      }
    }
    reload();
  }

  async function editStudent(s, done) {
    const r = await Swal.fire({
      title: 'تعديل بيانات الطالب',
      html: `
        <div class="mb-2"><label class="form-label">الاسم</label><input id="eName" class="form-control" maxlength="80" value="${esc(s.name)}"></div>
        <div class="mb-2"><label class="form-label">الفرقة</label><select id="eGrade" class="form-select">${opts([...META.grades, 'خريج'], s.grade)}</select></div>
        <div class="mb-2"><label class="form-label">نوع القيد</label><select id="eEnroll" class="form-select">${opts(META.enrollTypes, s.enrollType)}</select></div>
        <div class="mb-2"><label class="form-label">الحالة</label><select id="eStatus" class="form-select">${opts(META.statuses, s.status)}</select></div>`,
      showCancelButton: true,
      confirmButtonText: 'حفظ',
      cancelButtonText: 'إلغاء',
      showLoaderOnConfirm: true,
      preConfirm: async () => {
        try {
          return await api('/api/students', { method: 'PUT', body: { code: s.code, name: document.getElementById('eName').value, grade: document.getElementById('eGrade').value, enrollType: document.getElementById('eEnroll').value, status: document.getElementById('eStatus').value } });
        } catch (e) { Swal.showValidationMessage(esc(e.message)); }
      }
    });
    if (r.isConfirmed && r.value) { toast('success', 'تم حفظ التعديلات'); done(); }
  }

  async function showStudentCard(code) {
    Swal.fire({ title: 'جاري تجهيز الكارنيه...', didOpen: () => Swal.showLoading() });
    try {
      const d = await api('/api/students?card=' + encodeURIComponent(code));
      const s = d.student;
      await Swal.fire({
        width: 420,
        html: `
          <div id="cardModalCard">
            <div style="background:linear-gradient(135deg,#172a74,#2747b0);color:#fff;padding:14px;text-align:center"><div class="small opacity-75">جامعة عين شمس - كلية الآداب</div><div class="fw-900">قسم علم الاجتماع</div></div>
            <div style="padding:16px;text-align:center"><div id="cardQr" style="display:inline-block;padding:8px;border:2px dashed #c7d2fe;border-radius:14px"></div>
              <div class="fw-900 mt-2" style="font-size:1.15rem">${esc(s.name)}</div><div class="ltr fw-800 text-primary">${esc(s.code)}</div>
              <div class="small text-muted-2">${esc(s.grade)} • ${esc(s.enrollType)} • ${esc(s.status)}</div></div>
          </div>`,
        didOpen: () => new QRCode(document.getElementById('cardQr'), { text: d.qrData, width: 190, height: 190, colorDark: '#0f1b4d', colorLight: '#ffffff', correctLevel: QRCode.CorrectLevel.M }),
        showCancelButton: true,
        confirmButtonText: '<i class="fas fa-download"></i> حفظ كصورة',
        cancelButtonText: 'إغلاق',
        preConfirm: async () => {
          const canvas = await html2canvas(document.getElementById('cardModalCard'), { scale: 3, backgroundColor: '#ffffff' });
          const a = document.createElement('a');
          a.download = `كارنيه_${s.code}.png`;
          a.href = canvas.toDataURL('image/png');
          a.click();
        }
      });
    } catch (e) { say('error', 'خطأ', e.message); }
  }

  // ==================== 4. الترقية ====================
  async function renderPromotion() {
    const next = { 'الفرقة الأولى': 'الفرقة الثانية', 'الفرقة الثانية': 'الفرقة الثالثة', 'الفرقة الثالثة': 'الفرقة الرابعة', 'الفرقة الرابعة': 'خريج' };
    main.innerHTML = `
      <div class="page-title"><h2>ترقية الفرق الدراسية</h2></div>
      <div class="card-x">
        <p class="text-muted-2 small">اختر الفرقة الحالية، حدد الطلاب الناجحين، ثم نفّذ الترقية. يتم تسجيل العملية في سجل العمليات.</p>
        <div class="filter-bar mb-3">
          <div><label class="form-label">الفرقة الحالية</label><select class="form-select" id="pFrom">${opts(META.grades, '', '-- اختر --')}</select></div>
          <div><label class="form-label">بعد الترقية</label><input class="form-control" id="pTo" readonly placeholder="تلقائي"></div>
          <div><label class="form-label">بحث</label><input class="form-control" id="pQ" placeholder="الاسم أو الكود"></div>
          <div><button class="btn btn-success w-100" id="pGo"><i class="fas fa-check-double me-1"></i> ترقية المحددين</button></div>
        </div>
        <div id="pList" class="text-muted-2 small">اختر الفرقة لعرض الطلاب</div>
      </div>`;
    let rows = [];
    const draw = () => {
      const q = document.getElementById('pQ').value.trim().toLowerCase();
      const list = rows.filter(s => !q || s.name.toLowerCase().includes(q) || s.code.toLowerCase().includes(q));
      document.getElementById('pList').innerHTML = `
        <div class="table-wrap"><table class="table-x"><thead><tr><th style="width:40px"><input type="checkbox" id="pAll"></th><th>الكود</th><th>الاسم</th><th>القيد</th><th>الفرقة</th></tr></thead>
        <tbody>${list.length ? list.map(s => `<tr><td><input type="checkbox" class="pChk" value="${esc(s.code)}"></td><td><code>${esc(s.code)}</code></td><td><b>${esc(s.name)}</b></td><td>${esc(s.enrollType)}</td><td>${esc(s.grade)}</td></tr>`).join('') : '<tr class="empty-row"><td colspan="5">لا يوجد طلاب</td></tr>'}</tbody></table></div>`;
      const all = document.getElementById('pAll');
      if (all) all.addEventListener('change', () => document.querySelectorAll('.pChk').forEach(c => { c.checked = all.checked; }));
    };
    document.getElementById('pFrom').addEventListener('change', async e => {
      const g = e.target.value;
      document.getElementById('pTo').value = next[g] || '';
      if (!g) return;
      document.getElementById('pList').innerHTML = loadingHtml();
      try {
        rows = (await api('/api/students')).students.filter(s => s.grade === g && s.active);
        draw();
      } catch (err) { document.getElementById('pList').innerHTML = errorHtml(err.message); }
    });
    document.getElementById('pQ').addEventListener('input', draw);
    document.getElementById('pGo').addEventListener('click', async () => {
      const to = document.getElementById('pTo').value;
      const codes = [...document.querySelectorAll('.pChk:checked')].map(c => c.value);
      if (!to || !codes.length) return say('warning', 'تنبيه', 'اختر الفرقة وحدد طالباً واحداً على الأقل');
      const c = await Swal.fire({ icon: 'question', title: 'تأكيد الترقية', html: `ترقية <b>${codes.length}</b> طالب إلى <b>${esc(to)}</b>؟`, showCancelButton: true, confirmButtonText: 'نعم، نفّذ', cancelButtonText: 'إلغاء' });
      if (!c.isConfirmed) return;
      try {
        const r = await api('/api/promote', { method: 'POST', body: { studentCodes: codes, targetGrade: to } });
        say('success', 'تمت الترقية', r.message);
        document.getElementById('pFrom').dispatchEvent(new Event('change'));
      } catch (err) { say('error', 'خطأ', err.message); }
    });
  }

  // ==================== 5. الدكاترة والليدرز ====================
  async function renderUsers() {
    main.innerHTML = `
      <div class="page-title"><h2>الحسابات والصلاحيات</h2>
        <div class="d-flex gap-2 flex-wrap">${ME.isPrimary ? '<button class="btn btn-warning btn-sm" id="addSuper"><i class="fas fa-crown me-1"></i> مشرف عام</button>' : ''}<button class="btn btn-brand btn-sm" id="addDoc"><i class="fas fa-plus me-1"></i> دكتور مادة</button><button class="btn btn-success btn-sm" id="addLeader"><i class="fas fa-plus me-1"></i> ليدر دفعة</button></div></div>
      <div class="row g-3 mb-3">
        <div class="col-md-4"><div class="kpi"><div class="ico" style="background:#e0e7ff;color:#3730a3"><i class="fas fa-crown"></i></div><div><div class="fw-800">المشرف العام</div><div class="lbl">كل الصلاحيات (المالك فقط يضيف مشرفين عامين)</div></div></div></div>
        <div class="col-md-4"><div class="kpi"><div class="ico" style="background:#e0f2fe;color:#0369a1"><i class="fas fa-chalkboard-user"></i></div><div><div class="fw-800">دكتور مادة</div><div class="lbl">إحصائيات وماسح مواده فقط</div></div></div></div>
        <div class="col-md-4"><div class="kpi"><div class="ico" style="background:#dcfce7;color:#15803d"><i class="fas fa-qrcode"></i></div><div><div class="fw-800">ليدر دفعة</div><div class="lbl">الماسح فقط بدون إحصائيات</div></div></div></div>
      </div>
      <div class="card-x">
        <div class="filter-bar mb-3">
          <div style="grid-column: span 2"><label class="form-label">بحث</label><input class="form-control form-control-sm" id="uQ" placeholder="الاسم أو البريد أو المادة"></div>
          <div><label class="form-label">الدور</label><select class="form-select form-select-sm" id="uRole">${opts([{ value: 'super_admin', label: 'مشرف عام' }, { value: 'doctor', label: 'دكتور مادة' }, { value: 'leader', label: 'ليدر دفعة' }], '', 'الكل')}</select></div>
          <div><label class="form-label">الحالة</label><select class="form-select form-select-sm" id="uActive">${opts([{ value: '1', label: 'نشط' }, { value: '0', label: 'معطل' }], '', 'الكل')}</select></div>
        </div>
        <div id="uTable">${loadingHtml()}</div>
      </div>`;

    let list = [];
    const table = new Table(document.getElementById('uTable'), [
      { key: 'name', label: 'الاسم', render: r => `<b>${esc(r.name)}</b><div class="small text-muted-2 ltr">${esc(r.email)}</div>` },
      { key: 'role', label: 'الدور', render: r => (ROLE_PILL[r.role] || '<span class="pill pill-bad">صلاحية غير صالحة</span>') + (r.isPrimary ? ' <span class="pill pill-gray">المالك</span>' : '') },
      { key: 'scope', label: 'النطاق', sortable: false, render: r => r.role === 'doctor' ? r.subjects.map(s => `<span class="pill pill-brand mb-1">${esc(s.name)}</span>`).join(' ') : r.role === 'leader' ? `<span class="pill pill-gray">${esc(r.grade === 'الكل' ? 'كل الفرق' : r.grade)}</span>` : 'الكل' },
      { key: 'active', label: 'الحالة', render: r => (r.active ? '<span class="pill pill-ok">نشط</span>' : '<span class="pill pill-bad">معطل</span>') + (r.mustChange ? ' <span class="pill pill-warn" title="لم يغير كلمة المرور المؤقتة بعد">كلمة مؤقتة</span>' : '') + (r.locked ? ' <span class="pill pill-bad" title="محاولات دخول خاطئة متكررة">مقفل مؤقتاً</span>' : '') },
      { key: 'lastLogin', label: 'آخر دخول', render: r => `<span class="small ltr">${esc(r.lastLogin || '—')}</span>` },
      { key: '_', label: 'إجراءات', sortable: false, render: r => r.isPrimary ? `<span class="small text-muted-2">${r.email === ME.email ? 'حسابك' : 'المالك'}</span>` : (r.role === 'super_admin' && !ME.isPrimary) ? '<span class="small text-muted-2">يديره المالك</span>' : `
        <div class="btn-group btn-group-sm">
          <button class="btn btn-soft" data-u="edit" data-email="${esc(r.email)}" title="تعديل الصلاحيات"><i class="fas fa-pen"></i></button>
          <button class="btn btn-soft" data-u="reset" data-email="${esc(r.email)}" title="كلمة مرور جديدة"><i class="fas fa-key"></i></button>
          <button class="btn btn-soft ${r.active ? 'text-danger' : 'text-success'}" data-u="${r.active ? 'disable' : 'enable'}" data-email="${esc(r.email)}" title="${r.active ? 'تعطيل' : 'تفعيل'}"><i class="fas ${r.active ? 'fa-ban' : 'fa-check'}"></i></button>
        </div>` }
    ], { sortKey: 'role' });

    const apply = () => {
      const q = document.getElementById('uQ').value.trim().toLowerCase();
      const role = document.getElementById('uRole').value;
      const act = document.getElementById('uActive').value;
      table.setRows(list.filter(a => (!q || [a.name, a.email, ...a.subjects.map(s => s.name + ' ' + s.code)].some(v => v.toLowerCase().includes(q))) &&
        (!role || a.role === role) && (!act || (act === '1') === a.active)));
    };
    ['uQ', 'uRole', 'uActive'].forEach(id => document.getElementById(id).addEventListener('input', apply));

    const reload = async () => {
      try {
        list = (await api('/api/admins')).admins;
        apply();
      } catch (e) { document.getElementById('uTable').innerHTML = errorHtml(e.message); }
    };

    const addSuper = document.getElementById('addSuper');
    if (addSuper) addSuper.addEventListener('click', () => userForm('super_admin', null, reload));
    document.getElementById('addDoc').addEventListener('click', () => userForm('doctor', null, reload));
    document.getElementById('addLeader').addEventListener('click', () => userForm('leader', null, reload));
    document.getElementById('uTable').addEventListener('click', async e => {
      const b = e.target.closest('[data-u]');
      if (!b) return;
      const u = list.find(a => a.email === b.dataset.email);
      if (!u) return;
      const act = b.dataset.u;
      if (act === 'edit') return userForm(u.role === 'invalid' ? 'leader' : u.role, u, reload);
      const texts = {
        reset: ['إنشاء كلمة مرور مؤقتة جديدة؟', `سيتم إلغاء كلمة مرور ${u.name} الحالية وإنهاء جلساته.`],
        disable: ['تعطيل الحساب؟', `لن يتمكن ${u.name} من الدخول أو المسح، وستنتهي جلساته الحالية فوراً.`],
        enable: ['تفعيل الحساب؟', '']
      };
      const c = await Swal.fire({ icon: 'warning', title: texts[act][0], text: texts[act][1], showCancelButton: true, confirmButtonText: 'تأكيد', cancelButtonText: 'إلغاء' });
      if (!c.isConfirmed) return;
      try {
        const r = await api('/api/admins', { method: 'POST', body: { action: act === 'reset' ? 'resetPassword' : act, email: u.email } });
        if (r.tempPassword) await showTempPassword(r.tempPassword);
        else toast('success', r.message);
        reload();
      } catch (err) { say('error', 'خطأ', err.message); }
    });
    reload();
  }

  function subjectsPicker(selected) {
    const sel = new Set(selected || []);
    let html = '<input class="form-control form-control-sm mb-2" id="msQ" placeholder="ابحث عن مادة..."><div class="ms-box" id="msBox">';
    META.grades.forEach(g => META.terms.forEach(t => {
      const items = SUBJECTS.filter(s => s.grade === g && s.term === t);
      html += `<div class="grp" data-grp>${esc(g)} — ${esc(t)}</div>` + items.map(s => `<label data-search="${esc((s.name + ' ' + s.code).toLowerCase())}"><input type="checkbox" class="form-check-input msChk" value="${esc(s.code)}" ${sel.has(s.code) ? 'checked' : ''}> ${esc(s.name)} <code>${esc(s.code)}</code></label>`).join('');
    }));
    return html + '</div>';
  }

  async function userForm(role, existing, done) {
    const isDoc = role === 'doctor';
    const isSuper = role === 'super_admin';
    const r = await Swal.fire({
      width: isDoc ? 640 : 480,
      title: existing ? `تعديل صلاحيات ${esc(existing.name)}` : (isDoc ? 'إضافة دكتور مادة' : isSuper ? 'إضافة مشرف عام' : 'إضافة ليدر دفعة'),
      html: `
        <div class="mb-2"><label class="form-label">الاسم</label><input id="fName" class="form-control" maxlength="80" value="${esc(existing ? existing.name : '')}" placeholder="${isDoc ? 'أ.د/ ...' : isSuper ? 'اسم المشرف' : 'اسم الليدر'}"></div>
        <div class="mb-2"><label class="form-label">البريد الإلكتروني</label><input id="fEmail" type="email" class="form-control ltr" value="${esc(existing ? existing.email : '')}" ${existing ? 'disabled' : ''}></div>
        ${isSuper ? '<div class="alert alert-warning small py-2 mb-2"><i class="fas fa-crown me-1"></i> المشرف العام يملك كل الصلاحيات: الإحصائيات، الطلاب والحذف، الدكاترة والليدرز، والإعدادات. لا يستطيع إدارة حسابات المشرفين العامين أو حسابك.</div>'
          : isDoc ? `<div class="mb-2"><label class="form-label">المواد المسندة (يرى إحصائياتها ويمسح فيها فقط)</label>${subjectsPicker(existing ? existing.subjects.map(s => s.code) : [])}</div>`
          : `<div class="mb-2"><label class="form-label">الفرقة المسموح له بالمسح فيها</label><select id="fGrade" class="form-select">${opts([{ value: 'الكل', label: 'كل الفرق (كل المواد)' }, ...META.grades], existing ? existing.grade : 'الكل')}</select></div>`}
        ${existing ? '' : '<div class="small text-muted-2"><i class="fas fa-lock me-1"></i> سيتم إنشاء كلمة مرور مؤقتة قوية تلقائياً، ويُطلب منه تغييرها عند أول دخول.</div>'}`,
      didOpen: () => {
        const q = document.getElementById('msQ');
        if (q) q.addEventListener('input', () => {
          const v = q.value.trim().toLowerCase();
          let grp = null;
          let any = false;
          const close = () => { if (grp) grp.style.display = any ? '' : 'none'; };
          [...document.getElementById('msBox').children].forEach(el => {
            if (el.hasAttribute('data-grp')) { close(); grp = el; any = false; return; }
            const show = !v || el.dataset.search.includes(v);
            el.style.display = show ? '' : 'none';
            if (show) any = true;
          });
          close();
        });
      },
      showCancelButton: true,
      confirmButtonText: 'حفظ',
      cancelButtonText: 'إلغاء',
      showLoaderOnConfirm: true,
      preConfirm: async () => {
        const adminData = {
          role,
          name: document.getElementById('fName').value,
          email: existing ? existing.email : document.getElementById('fEmail').value,
          subjects: isDoc ? [...document.querySelectorAll('.msChk:checked')].map(c => c.value) : [],
          grade: isDoc || isSuper ? 'الكل' : document.getElementById('fGrade').value
        };
        if (isDoc && !adminData.subjects.length) return Swal.showValidationMessage('اختر مادة واحدة على الأقل');
        try {
          return await api('/api/admins', { method: 'POST', body: { action: 'save', adminData } });
        } catch (e) { Swal.showValidationMessage(esc(e.message)); }
      }
    });
    if (r.isConfirmed && r.value) {
      if (r.value.tempPassword) await showTempPassword(r.value.tempPassword, r.value.message);
      else toast('success', r.value.message);
      done();
    }
  }

  async function showTempPassword(pass, title) {
    await Swal.fire({
      icon: 'success',
      titleText: title || 'كلمة المرور المؤقتة',
      html: `<p class="small text-muted-2 mb-2">انسخها وأرسلها للمستخدم بشكل خاص. <b>لن تظهر مرة أخرى</b>، وسيُطلب منه تغييرها عند أول دخول.</p>
        <div class="temp-pass" id="tmpPass">${esc(pass)}</div>
        <div class="small text-muted-2 mt-2">رابط الدخول: <span class="ltr">${esc(location.origin)}/admin</span></div>`,
      confirmButtonText: '<i class="fas fa-copy"></i> نسخ وإغلاق',
      allowOutsideClick: false,
      preConfirm: async () => {
        try { await navigator.clipboard.writeText(pass); toast('success', 'تم النسخ'); } catch (e) { /* ignore */ }
      }
    });
  }

  // ==================== 6. سجل العمليات ====================
  async function renderAudit() {
    main.innerHTML = `
      <div class="page-title"><h2>سجل العمليات والأمان</h2><button class="btn btn-soft btn-sm" id="aRefresh"><i class="fas fa-rotate me-1"></i> تحديث</button></div>
      <div class="card-x">
        <div class="filter-bar mb-3">
          <div style="grid-column: span 2"><label class="form-label">بحث</label><input class="form-control form-control-sm" id="aQ" placeholder="مستخدم، إجراء، تفاصيل، IP"></div>
          <div><label class="form-label">النوع</label><select class="form-select form-select-sm" id="aType"><option value="">الكل</option><option value="sec">تنبيهات أمنية فقط</option><option value="login">تسجيلات الدخول</option></select></div>
        </div>
        <div id="aTable">${loadingHtml()}</div>
      </div>`;
    let logs = [];
    const isSec = l => /مزور|فشل|حظر|غير مصرح|معطل|مكرر|غير صالح/.test(l.action);
    const table = new Table(document.getElementById('aTable'), [
      { key: 'time', label: 'التوقيت', render: r => `<span class="ltr small">${esc(r.time)}</span>` },
      { key: 'actor', label: 'المستخدم', render: r => `<span class="ltr small">${esc(r.actor)}</span>` },
      { key: 'action', label: 'الإجراء', render: r => `<span class="pill ${isSec(r) ? 'pill-bad' : 'pill-gray'}">${esc(r.action)}</span>` },
      { key: 'details', label: 'التفاصيل', render: r => `<small>${esc(r.details)}</small>` },
      { key: 'ip', label: 'IP', render: r => `<small class="ltr text-muted-2">${esc(r.ip)}</small>` }
    ], { pageSize: 100 });
    const apply = () => {
      const q = document.getElementById('aQ').value.trim().toLowerCase();
      const t = document.getElementById('aType').value;
      table.setRows(logs.filter(l => (!q || Object.values(l).some(v => String(v).toLowerCase().includes(q))) &&
        (!t || (t === 'sec' ? isSec(l) : /دخول|خروج/.test(l.action)))));
    };
    ['aQ', 'aType'].forEach(id => document.getElementById(id).addEventListener('input', apply));
    const load = async () => {
      try { logs = (await api('/api/admins?audit=1')).logs; apply(); } catch (e) { document.getElementById('aTable').innerHTML = errorHtml(e.message); }
    };
    document.getElementById('aRefresh').addEventListener('click', load);
    load();
  }

  // ==================== 7. تأمين الشيت ====================
  function renderSettings() {
    main.innerHTML = `
      <div class="page-title"><h2>الإعدادات والأمان</h2></div>
      <div id="switchCards"></div>
      <div class="card-x">
        <h3 class="card-title mb-3"><i class="fas fa-shield-halved"></i> الحماية المفعّلة في النظام</h3>
        <ul class="small lh-lg mb-0">
          <li>كلمات المرور مشفرة (scrypt) ولا تظهر لأي أحد، حتى للمشرف العام.</li>
          <li>جلسات دخول موقّعة داخل كوكي آمن (HttpOnly) وتنتهي بعد 12 ساعة، وتُلغى فوراً عند تعطيل الحساب أو تغيير كلمة المرور.</li>
          <li>كل الصلاحيات تُفحص على السيرفر: الدكتور لا يصل إلا لمواده، والليدر للماسح فقط.</li>
          <li>كارنيه الطالب موقّع رقمياً (HMAC) — أي كود مزور يُرفض ويُسجل في سجل العمليات.</li>
          <li>منع تكرار الحضور لنفس الطالب في نفس المادة واليوم، وتنبيه عند طالب من فرقة أخرى، ورفض الطلاب الموقوفين.</li>
          <li>حد أقصى لمحاولات الدخول والتسجيل لمنع التخمين والسبام، وحماية من حقن المعادلات في الشيت وملفات Excel.</li>
        </ul>
      </div>
      <div class="card-x">
        <h3 class="card-title mb-2"><i class="fas fa-table"></i> فحص وتأمين الشيت</h3>
        <p class="small text-muted-2">يقوم بـ: إنشاء أي تبويبات ناقصة للمواد الـ 78، تنسيق العناوين، <b>قفل كل التبويبات</b> بحيث لا يعدلها إلا النظام ومالك الشيت، تشفير أي كلمات مرور قديمة، وإعادة توقيع بيانات QR للطلاب. آمن للتكرار.</p>
        <button class="btn btn-brand" id="runSetup"><i class="fas fa-lock me-1"></i> تشغيل الفحص والتأمين الآن</button>
        <div id="setupOut" class="mt-3"></div>
      </div>`;
    // مفاتيح التشغيل/الإيقاف للصفحة العامة
    const SWITCH_UI = [
      { key: 'registrationOpen', icon: 'fa-user-plus', title: 'تسجيل الطلاب الجدد', hint: 'اغلق التسجيل بعد انتهاء فترة التسجيل لمنع أي تسجيلات وهمية. الكارنيهات المسجلة تظل تعمل.', on: 'التسجيل مفتوح للطلاب', off: 'التسجيل مغلق' },
      { key: 'lookupOpen', icon: 'fa-magnifying-glass', title: 'استرجاع الكارنيه بالاسم', hint: 'يسمح للطالب الذي فقد الكارنيه بالبحث باسمه الكامل وفرقته. البحث محدود المحاولات ومسجل في سجل العمليات.', on: 'الاسترجاع متاح للطلاب', off: 'الاسترجاع متوقف' }
    ];
    document.getElementById('switchCards').innerHTML = SWITCH_UI.map(sw => `
      <div class="card-x">
        <div class="card-head mb-0">
          <div><h3 class="card-title"><i class="fas ${sw.icon}"></i> ${sw.title}</h3><div class="small text-muted-2 mt-1">${sw.hint}</div></div>
          <div class="form-check form-switch fs-5 m-0"><input class="form-check-input" type="checkbox" role="switch" data-switch="${sw.key}" disabled></div>
        </div>
        <div class="small mt-2 text-muted-2" data-switch-state="${sw.key}"><span class="spin me-1"></span> جاري التحميل...</div>
      </div>`).join('');
    const showSwitch = (key, open) => {
      const sw = SWITCH_UI.find(x => x.key === key);
      const input = document.querySelector(`[data-switch="${key}"]`);
      input.checked = open;
      input.disabled = false;
      document.querySelector(`[data-switch-state="${key}"]`).innerHTML = open ? `<span class="pill pill-ok"><i class="fas fa-lock-open"></i> ${sw.on}</span>` : `<span class="pill pill-bad"><i class="fas fa-lock"></i> ${sw.off}</span>`;
    };
    api('/api/admins?settings=1').then(r => SWITCH_UI.forEach(sw => showSwitch(sw.key, r.settings[sw.key] !== false)))
      .catch(e => document.querySelectorAll('[data-switch-state]').forEach(el => { el.textContent = e.message; }));
    document.getElementById('switchCards').addEventListener('change', async e => {
      const key = e.target.dataset.switch;
      if (!key) return;
      const open = e.target.checked;
      e.target.disabled = true;
      try {
        const r = await api('/api/admins', { method: 'POST', body: { action: 'setSetting', key, open } });
        showSwitch(key, r.open);
        toast('success', r.message);
      } catch (err) { showSwitch(key, !open); say('error', 'خطأ', err.message); }
    });
    document.getElementById('runSetup').addEventListener('click', async e => {
      const btn = e.currentTarget;
      btn.disabled = true;
      btn.innerHTML = '<span class="spin me-1"></span> جاري التأمين...';
      try {
        const r = await api('/api/setup', { method: 'POST', body: {} });
        document.getElementById('setupOut').innerHTML = `<div class="alert alert-success small mb-0">
          <b>${esc(r.message)}</b><br>تبويبات مواد جديدة: ${r.createdTabs} • تبويبات تم قفلها: ${r.protectedTabs} • كلمات مرور تم تشفيرها: ${r.hashedPasswords} • كارنيهات أعيد توقيعها: ${r.resignedCards}
          <div class="mt-1">التعديل اليدوي على الشيت مسموح فقط لمالك الملف ولحساب الخدمة: <span class="ltr">${esc(r.serviceAccount || '')}</span></div></div>`;
      } catch (err) {
        document.getElementById('setupOut').innerHTML = errorHtml(err.message);
      } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-lock me-1"></i> تشغيل الفحص والتأمين الآن';
      }
    });
  }

  window.addEventListener('pagehide', stopCamera);
  if (location.hostname === 'localhost') { window.__socScan = onScan; window.__socCam = cam; } // للاختبار المحلي فقط
  window.addEventListener('hashchange', () => {
    const id = location.hash.replace('#', '');
    if (ME && !ME.mustChangePassword && id !== currentSection) go(id);
  });
  init();
})();
