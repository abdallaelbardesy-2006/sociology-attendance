(function () {
  const { api, esc, say } = window.SOC;

  const GRADES = ['الفرقة الأولى', 'الفرقة الثانية', 'الفرقة الثالثة', 'الفرقة الرابعة'];
  const ENROLL = ['انتظام', 'انتساب'];
  const STATUS = ['عام', 'حالات خاصة', 'إبصار'];
  const STORE_KEY = 'soc_my_card';
  const $ = id => document.getElementById(id);

  function renderChoice(id, name, values, checked) {
    $(id).innerHTML = values.map((v, i) => `
      <input type="radio" name="${name}" id="${name}${i}" value="${esc(v)}" ${v === checked ? 'checked' : ''}>
      <label for="${name}${i}">${esc(v)}</label>`).join('');
  }
  renderChoice('gradeChoice', 'grade', GRADES, '');
  renderChoice('enrollChoice', 'enroll', ENROLL, 'انتظام');
  renderChoice('statusChoice', 'status', STATUS, 'عام');
  renderChoice('lkGradeChoice', 'lkgrade', GRADES, '');

  const val = name => (document.querySelector(`input[name="${name}"]:checked`) || {}).value || '';

  // ===== الكارنيه المحفوظ على هذا الجهاز (آخر كارنيه تم إنشاؤه أو استرجاعه) =====
  function loadSaved() {
    try {
      const d = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
      return d && d.studentCode && d.qrData ? d : null;
    } catch (e) { return null; }
  }
  function saveCard(d) {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({ studentCode: d.studentCode, qrData: d.qrData, name: d.name, grade: d.grade, enrollType: d.enrollType, status: d.status }));
    } catch (e) { /* التخزين غير متاح في هذا المتصفح */ }
    refreshSavedBar();
  }
  function refreshSavedBar() {
    const d = loadSaved();
    $('savedBar').classList.toggle('d-none', !d);
    if (d) $('savedName').textContent = `${d.name} • ${d.grade}`;
  }
  refreshSavedBar();
  $('btnShowSaved').addEventListener('click', () => { const d = loadSaved(); if (d) showCard(d); });

  // ===== التنقل بين الأقسام =====
  function showOnly(id) {
    ['formSection', 'lookupSection', 'cardSection'].forEach(s => $(s).classList.toggle('d-none', s !== id));
    $('savedBar').classList.toggle('d-none', id === 'cardSection' || !loadSaved());
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  $('btnShowLookup').addEventListener('click', () => { showOnly('lookupSection'); $('lkName').focus(); });
  $('btnBackFromLookup').addEventListener('click', () => showOnly('formSection'));
  $('btnNew').addEventListener('click', () => {
    $('regForm').reset();
    renderChoice('gradeChoice', 'grade', GRADES, '');
    showOnly('formSection');
  });

  // لو المشرف قفل التسجيل أو الاسترجاع
  api('/api/meta').then(m => {
    if (m.registrationOpen === false) {
      $('regForm').classList.add('d-none');
      $('regClosed').classList.remove('d-none');
    }
    if (m.lookupOpen === false) $('btnShowLookup').classList.add('d-none');
    if (m.registrationOpen === false && m.lookupOpen === false) document.querySelector('.or-line').classList.add('d-none');
  }).catch(() => {});

  // ===== التسجيل =====
  const btn = $('btnRegister');
  $('regForm').addEventListener('submit', async e => {
    e.preventDefault();
    const name = $('inName').value.replace(/\s+/g, ' ').trim();
    const grade = val('grade');
    if (name.split(' ').length < 3) return say('warning', 'الاسم غير مكتمل', 'اكتب اسمك ثلاثياً على الأقل كما هو مقيد بالكلية');
    if (!grade) return say('warning', 'اختر الفرقة الدراسية');

    const confirm = await Swal.fire({
      icon: 'question',
      title: 'تأكيد البيانات',
      html: `<div class="text-center"><b>${esc(name)}</b><br>${esc(grade)} • ${esc(val('enroll'))} • ${esc(val('status'))}<br><small class="text-muted">لا يمكن تعديل البيانات لاحقاً إلا عن طريق إدارة القسم</small></div>`,
      showCancelButton: true,
      confirmButtonText: 'تأكيد التسجيل',
      cancelButtonText: 'تعديل'
    });
    if (!confirm.isConfirmed) return;

    btn.disabled = true;
    btn.innerHTML = '<span class="spin me-1"></span> جاري التسجيل وتوليد الكارنيه...';
    try {
      const data = await api('/api/students', {
        method: 'POST',
        body: { name, grade, enrollType: val('enroll'), status: val('status'), website: $('inWebsite').value }
      });
      saveCard(data);
      showCard(data);
      say('success', 'تم التسجيل بنجاح', 'احفظ الكارنيه الآن كصورة على هاتفك. يمكنك أيضاً فتحه في أي وقت من زر "عرض الـ QR بتاعك".');
    } catch (err) {
      if (err.status === 409) {
        const r = await Swal.fire({ icon: 'info', titleText: 'أنت مسجل بالفعل', text: 'هذا الاسم مسجل في نفس الفرقة. يمكنك استرجاع الكارنيه بالبحث باسمك.', showCancelButton: true, confirmButtonText: 'ابحث عن الكارنيه', cancelButtonText: 'إغلاق' });
        if (r.isConfirmed) {
          $('lkName').value = name;
          renderChoice('lkGradeChoice', 'lkgrade', GRADES, grade);
          showOnly('lookupSection');
        }
      } else say('error', 'تعذر التسجيل', err.message);
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-qrcode me-1"></i> تأكيد التسجيل واستخراج الكارنيه';
    }
  });

  // ===== استرجاع الكارنيه =====
  const lkBtn = $('btnLookup');
  $('lookupForm').addEventListener('submit', async e => {
    e.preventDefault();
    const name = $('lkName').value.replace(/\s+/g, ' ').trim();
    const grade = val('lkgrade');
    if (name.split(' ').length < 3) return say('warning', 'الاسم غير مكتمل', 'اكتب اسمك كاملاً كما سجلته');
    if (!grade) return say('warning', 'اختر الفرقة الدراسية');
    lkBtn.disabled = true;
    lkBtn.innerHTML = '<span class="spin me-1"></span> جاري البحث...';
    try {
      const data = await api('/api/students', { method: 'POST', body: { action: 'lookup', name, grade, website: $('lkWebsite').value } });
      saveCard(data);
      showCard(data);
      $('lookupForm').reset();
      renderChoice('lkGradeChoice', 'lkgrade', GRADES, '');
    } catch (err) {
      say(err.status === 404 ? 'info' : 'error', err.status === 404 ? 'لم يتم العثور على الكارنيه' : 'تعذر البحث', err.message);
    } finally {
      lkBtn.disabled = false;
      lkBtn.innerHTML = '<i class="fas fa-magnifying-glass me-1"></i> ابحث عن الكارنيه';
    }
  });

  // ===== عرض الكارنيه =====
  function showCard(d) {
    $('resName').textContent = d.name;
    $('resCode').textContent = d.studentCode;
    $('resGrade').textContent = d.grade;
    $('resEnroll').textContent = d.enrollType;
    $('resStatus').textContent = d.status;
    const box = $('qrTarget');
    box.innerHTML = '';
    new QRCode(box, { text: d.qrData, width: 200, height: 200, colorDark: '#0f1b4d', colorLight: '#ffffff', correctLevel: QRCode.CorrectLevel.M });
    showOnly('cardSection');
  }

  $('btnDownload').addEventListener('click', () => {
    const code = $('resCode').textContent;
    html2canvas($('digitalCard'), { scale: 3, backgroundColor: '#ffffff' }).then(canvas => {
      const a = document.createElement('a');
      a.download = `كارنيه_حضور_${code}.png`;
      a.href = canvas.toDataURL('image/png');
      a.click();
    }).catch(err => say('error', 'خطأ', 'تعذر حفظ الصورة: ' + err.message));
  });
})();
