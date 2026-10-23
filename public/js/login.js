(function () {
  const { api } = window.SOC;
  window.SOC.registerSW();

  // لو فيه جلسة صالحة بالفعل نروح للوحة مباشرة
  api('/api/auth', { noRedirect: true }).then(() => window.location.replace('/dashboard')).catch(() => {});

  const form = document.getElementById('loginForm');
  const btn = document.getElementById('btnLogin');
  const errBox = document.getElementById('loginError');

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;
    errBox.classList.add('d-none');
    if (!email || !password) {
      errBox.textContent = 'يرجى إدخال البريد الإلكتروني وكلمة المرور';
      errBox.classList.remove('d-none');
      return;
    }
    btn.disabled = true;
    btn.innerHTML = '<span class="spin me-1"></span> جاري التحقق...';
    try {
      await api('/api/auth', { method: 'POST', body: { action: 'login', email, password }, noRedirect: true });
      window.location.replace('/dashboard');
    } catch (err) {
      errBox.textContent = err.message;
      errBox.classList.remove('d-none');
      document.getElementById('loginPassword').value = '';
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-right-to-bracket me-1"></i> تسجيل الدخول';
    }
  });
})();
