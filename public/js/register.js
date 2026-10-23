(function () {
  const { api, esc, say } = window.SOC;

  const GRADES = ['الفرقة الأولى', 'الفرقة الثانية', 'الفرقة الثالثة', 'الفرقة الرابعة'];
  const ENROLL = ['انتظام', 'انتساب'];
  const STATUS = ['عام', 'حالات خاصة', 'إبصار'];

  function renderChoice(id, name, values, checked) {
    document.getElementById(id).innerHTML = values.map((v, i) => `
      <input type="radio" name="${name}" id="${name}${i}" value="${esc(v)}" ${v === checked ? 'checked' : ''}>
      <label for="${name}${i}">${esc(v)}</label>`).join('');
  }
  renderChoice('gradeChoice', 'grade', GRADES, '');
  renderChoice('enrollChoice', 'enroll', ENROLL, 'انتظام');
  renderChoice('statusChoice', 'status', STATUS, 'عام');

  // لو المشرف قفل التسجيل نعرض رسالة بدل الفورم
  api('/api/meta').then(m => {
    if (m.registrationOpen === false) {
      document.getElementById('formSection').innerHTML = '<div class="text-center py-4"><i class="fas fa-lock fa-2x text-muted mb-3"></i><h2 class="h5 fw-900">التسجيل مغلق حالياً</h2><p class="text-muted-2 mb-0">انتهت فترة تسجيل الطلاب. إذا فقدت الكارنيه تواصل مع إدارة القسم.</p></div>';
    }
  }).catch(() => {});

  const val = name => (document.querySelector(`input[name="${name}"]:checked`) || {}).value || '';
  const btn = document.getElementById('btnRegister');

  document.getElementById('regForm').addEventListener('submit', async e => {
    e.preventDefault();
    const name = document.getElementById('inName').value.replace(/\s+/g, ' ').trim();
    const grade = val('grade');
    if (name.split(' ').length < 3) return Swal.fire({ icon: 'warning', title: 'الاسم غير مكتمل', text: 'اكتب اسمك ثلاثياً على الأقل كما هو مقيد بالكلية' });
    if (!grade) return Swal.fire({ icon: 'warning', title: 'اختر الفرقة الدراسية' });

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
        body: { name, grade, enrollType: val('enroll'), status: val('status'), website: document.getElementById('inWebsite').value }
      });
      showCard(data);
      Swal.fire({ icon: 'success', title: 'تم التسجيل بنجاح', text: 'احفظ الكارنيه الآن كصورة على هاتفك لاستخدامه في المحاضرات.' });
    } catch (err) {
      Swal.fire({ icon: 'error', title: 'تعذر التسجيل', text: err.message });
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-qrcode me-1"></i> تأكيد التسجيل واستخراج الكارنيه';
    }
  });

  function showCard(d) {
    document.getElementById('formSection').classList.add('d-none');
    document.getElementById('cardSection').classList.remove('d-none');
    document.getElementById('resName').textContent = d.name;
    document.getElementById('resCode').textContent = d.studentCode;
    document.getElementById('resGrade').textContent = d.grade;
    document.getElementById('resEnroll').textContent = d.enrollType;
    document.getElementById('resStatus').textContent = d.status;
    const box = document.getElementById('qrTarget');
    box.innerHTML = '';
    new QRCode(box, { text: d.qrData, width: 200, height: 200, colorDark: '#0f1b4d', colorLight: '#ffffff', correctLevel: QRCode.CorrectLevel.M });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  document.getElementById('btnDownload').addEventListener('click', () => {
    const code = document.getElementById('resCode').textContent;
    html2canvas(document.getElementById('digitalCard'), { scale: 3, backgroundColor: '#ffffff' }).then(canvas => {
      const a = document.createElement('a');
      a.download = `كارنيه_حضور_${code}.png`;
      a.href = canvas.toDataURL('image/png');
      a.click();
    }).catch(err => say('error', 'خطأ', 'تعذر حفظ الصورة: ' + err.message));
  });

  document.getElementById('btnNew').addEventListener('click', () => {
    document.getElementById('regForm').reset();
    renderChoice('gradeChoice', 'grade', GRADES, '');
    document.getElementById('cardSection').classList.add('d-none');
    document.getElementById('formSection').classList.remove('d-none');
  });
})();
