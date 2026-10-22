const { google } = require('googleapis');
const path = require('path');
const fs = require('fs');

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];
const SPREADSHEET_ID = (process.env.GOOGLE_SHEET_ID || '1lOvjgilrsXCeTWK5gvn9NTeb-gx4EuSE-cSOpu6UmFQ').trim();

// تنظيف اسم المادة ليناسب شروط أسماء التبويبات في جوجل شيت
function getSubjectSheetName(code, name) {
  const safeName = (name || '').replace(/[\[\]*?:/\\]/g, ' ').replace(/\s+/g, ' ').trim();
  let tabTitle = `${code} - ${safeName}`.trim();
  if (tabTitle.length > 95) {
    tabTitle = tabTitle.substring(0, 95);
  }
  return tabTitle;
}

// إنشاء اتصال مباشر مع Google Sheets API
async function getSheetsClient() {
  let auth;

  const rawKey = process.env.GOOGLE_PRIVATE_KEY;
  const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;

  if (rawKey && clientEmail) {
    const privateKey = rawKey.replace(/\\n/g, '\n').replace(/^"|"$/g, '');
    auth = new google.auth.JWT({
      email: clientEmail.trim(),
      key: privateKey,
      scopes: SCOPES
    });
  } else {
    // كملف احتياطي محلياً
    const keyPath = path.join(process.cwd(), 'service-account-key.json');
    if (fs.existsSync(keyPath)) {
      const keyData = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
      auth = new google.auth.JWT({
        email: keyData.client_email,
        key: keyData.private_key,
        scopes: SCOPES
      });
    } else {
      throw new Error('بيانات Google Service Account غير متوفرة. تأكد من ضبط GOOGLE_PRIVATE_KEY و GOOGLE_SERVICE_ACCOUNT_EMAIL');
    }
  }

  const sheets = google.sheets({ version: 'v4', auth });
  return { sheets, spreadsheetId: SPREADSHEET_ID };
}

// التأكد من وجود التبويبات الأساسية
async function ensureSheets(sheets, spreadsheetId) {
  try {
    const meta = await sheets.spreadsheets.get({ spreadsheetId });
    const existingSheets = (meta.data.sheets || []).map(s => s.properties.title);

    const requests = [];
    if (!existingSheets.includes('Students')) {
      requests.push({ addSheet: { properties: { title: 'Students' } } });
    }
    if (!existingSheets.includes('Attendance')) {
      requests.push({ addSheet: { properties: { title: 'Attendance' } } });
    }
    if (!existingSheets.includes('Admins')) {
      requests.push({ addSheet: { properties: { title: 'Admins' } } });
    }

    if (requests.length > 0) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: { requests }
      });
    }

    // تهيئة عناوين ورقة الطلاب
    const sValues = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Students!A1:H1'
    });
    if (!sValues.data.values || sValues.data.values.length === 0) {
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: 'Students!A1:H1',
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: [['التوقيت', 'الاسم بالكامل', 'نوع القيد', 'الحالة', 'الفرقة الدراسية', 'كود الطالب', 'بيانات QR', 'نشط']]
        }
      });
    }

    // تهيئة عناوين ورقة الحضور العام
    const aValues = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Attendance!A1:I1'
    });
    if (!aValues.data.values || aValues.data.values.length === 0) {
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: 'Attendance!A1:K1',
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: [['التوقيت', 'التاريخ', 'الساعة', 'اسم الطالب', 'كود الطالب', 'الفرقة الدراسية', 'الترم', 'كود المادة', 'اسم المادة', 'حالة الحضور', 'إيميل الدكتور/الأدمن']]
        }
      });
    }

    // تهيئة عناوين ورقة المشرفين والصلاحيات Admins
    const admValues = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Admins!A1:H1'
    });
    if (!admValues.data.values || admValues.data.values.length === 0) {
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: 'Admins!A1:H1',
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: [['الإيميل', 'كلمة المرور', 'الاسم', 'الدور', 'المادة المخصصة', 'الفرقة المخصصة', 'تاريخ الإضافة', 'نشط']]
        }
      });
    }
  } catch (err) {
    if (err.message && err.message.includes('The caller does not have permission')) {
      throw new Error('يرجى مشاركة شيت جوجل مع إيميل الخدمة كـ Editor (محرر): attendance-service-acct@asu-attendance-3aa317.iam.gserviceaccount.com');
    }
    throw err;
  }
}

// التأكد من وجود تبويب مادة مخصص وإنشائه تلقائياً مع الترويسة
async function ensureSubjectSheet(sheets, spreadsheetId, tabTitle) {
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const existingSheets = (meta.data.sheets || []).map(s => s.properties.title);

  if (!existingSheets.includes(tabTitle)) {
    // 1. إضافة ورقة المادة
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [
          {
            addSheet: {
              properties: {
                title: tabTitle,
                gridProperties: { frozenRowCount: 1 },
                tabColor: { red: 0.1, green: 0.25, blue: 0.65 }
              }
            }
          }
        ]
      }
    });

    // 2. كتابة صف العناوين المتطابق والمنظم
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `'${tabTitle}'!A1:I1`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [['التوقيت', 'التاريخ', 'الساعة', 'اسم الطالب', 'كود الطالب', 'الفرقة الدراسية', 'الترم', 'حالة الحضور', 'إيميل الدكتور/الأدمن']]
      }
    });
  }
}

// 1. تسجيل طالب جديد
async function registerStudentDirect(payload) {
  const { sheets, spreadsheetId } = await getSheetsClient();
  await ensureSheets(sheets, spreadsheetId);

  const name = (payload.name || '').trim();
  const regType = (payload.enrollType || payload.regType || 'انتظام').trim();
  const status = (payload.status || 'عام').trim();
  const grade = (payload.grade || 'الفرقة الأولى').trim();

  if (!name) throw new Error('اسم الطالب مطلوب');

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'Students!A:F'
  });
  const rows = res.data.values || [];
  const nextNum = rows.length === 0 ? 1 : rows.length;

  let gCode = 'G1';
  if (grade.includes('الثانية')) gCode = 'G2';
  else if (grade.includes('الثالثة')) gCode = 'G3';
  else if (grade.includes('الرابعة')) gCode = 'G4';

  const year = new Date().getFullYear();
  const seq = ('0000' + nextNum).slice(-4);
  const studentCode = `SOC-${year}-${gCode}-${seq}`;

  const qrData = JSON.stringify({
    code: studentCode,
    name: name,
    grade: grade,
    regType: regType,
    status: status,
    v: 2
  });

  const now = new Date();
  const nowStr = now.toLocaleDateString('ar-EG') + ' ' + now.toLocaleTimeString('ar-EG');

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: 'Students!A:H',
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [[nowStr, name, regType, status, grade, studentCode, qrData, 'نعم']]
    }
  });

  return {
    success: true,
    message: 'تم تسجيل الطالب بنجاح في Google Sheets',
    studentCode: studentCode,
    qrData: qrData,
    name: name,
    grade: grade
  };
}

// 2. جلب قائمة الطلاب
async function getStudentsListDirect(gradeFilter, searchQuery) {
  const { sheets, spreadsheetId } = await getSheetsClient();
  await ensureSheets(sheets, spreadsheetId);

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'Students!A2:H'
  });

  const rows = res.data.values || [];
  const q = (searchQuery || '').trim().toLowerCase();

  const list = [];
  rows.forEach((row, idx) => {
    const name = row[1] || '';
    const enrollType = row[2] || '';
    const status = row[3] || '';
    const grade = row[4] || '';
    const code = row[5] || '';
    const qrData = row[6] || '';
    const active = row[7] || 'نعم';

    if (gradeFilter && gradeFilter !== 'الكل' && grade !== gradeFilter) return;
    if (q && !name.toLowerCase().includes(q) && !code.toLowerCase().includes(q)) return;

    list.push({
      rowId: idx + 2,
      name,
      enrollType,
      status,
      grade,
      code,
      qrData,
      active
    });
  });

  return list;
}

// 3. تعديل بيانات طالب
async function updateStudentDataDirect(code, updated) {
  const { sheets, spreadsheetId } = await getSheetsClient();
  await ensureSheets(sheets, spreadsheetId);

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'Students!A2:F'
  });
  const rows = res.data.values || [];
  let targetRowIndex = -1;

  for (let i = 0; i < rows.length; i++) {
    if ((rows[i][5] || '').toString().trim() === code.trim()) {
      targetRowIndex = i + 2;
      break;
    }
  }

  if (targetRowIndex === -1) {
    throw new Error('لم يتم العثور على كود الطالب في الشيت');
  }

  const updates = [];
  if (updated.name) updates.push({ range: `Students!B${targetRowIndex}`, values: [[updated.name]] });
  if (updated.enrollType) updates.push({ range: `Students!C${targetRowIndex}`, values: [[updated.enrollType]] });
  if (updated.status) updates.push({ range: `Students!D${targetRowIndex}`, values: [[updated.status]] });
  if (updated.grade) updates.push({ range: `Students!E${targetRowIndex}`, values: [[updated.grade]] });

  for (const up of updates) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: up.range,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: up.values }
    });
  }

  return { success: true, message: 'تم تحديث بيانات الطالب في شيت جوجل بنجاح' };
}

// 4. رصد الحضور (تسجيل في شيت المادة المخصص + شيت الحضور العام)
async function recordAttendanceDirect(payload) {
  const { sheets, spreadsheetId } = await getSheetsClient();
  await ensureSheets(sheets, spreadsheetId);

  let studentCode = '';
  let studentName = '';

  try {
    const parsed = JSON.parse(payload.qrData);
    studentCode = (parsed.code || '').trim();
    studentName = (parsed.name || '').trim();
  } catch(e) {
    studentCode = (payload.qrData || '').trim();
    studentName = (payload.studentName || studentCode).trim();
  }

  const subjectCode = (payload.subjectCode || '').trim();
  const subjectName = (payload.subjectName || '').trim();
  const grade = (payload.selectedGrade || '').trim();
  const term = (payload.selectedTerm || '').trim();
  const recordedBy = (payload.adminEmail || 'مسؤول الحضور').trim();

  if (!studentCode || !subjectCode) {
    throw new Error('بيانات الحضور غير مكتملة');
  }

  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const timeStr = now.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
  const dateTimeStr = todayStr + ' ' + timeStr;

  // فحص منع التكرار في نفس اليوم والمادة
  const attRes = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'Attendance!A2:K'
  });
  const attRows = attRes.data.values || [];

  for (const row of attRows) {
    const rowDate = (row[1] || row[0] || '').toString().trim();
    const rowCode = (row[4] || row[2] || '').toString().trim();
    const rowSubj = (row[7] || row[6] || '').toString().trim();

    if (rowDate.includes(todayStr) && rowCode === studentCode && rowSubj === subjectCode) {
      return {
        success: false,
        type: 'duplicate',
        message: `تم تسجيل حضور الطالب ${studentName} في مادة (${subjectName}) اليوم مسبقاً.`
      };
    }
  }

  // أ. إنشاء وحفظ الحضور في التبويب المخصص لهذه المادة تحديداً
  // الأعمدة: [التوقيت، التاريخ، الساعة، اسم الطالب، كود الطالب، الفرقة الدراسية، الترم، حالة الحضور، إيميل الدكتور/الأدمن]
  const subjectTabName = getSubjectSheetName(subjectCode, subjectName);
  await ensureSubjectSheet(sheets, spreadsheetId, subjectTabName);

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `'${subjectTabName}'!A:I`,
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [[dateTimeStr, todayStr, timeStr, studentName, studentCode, grade, term, 'حاضر', recordedBy]]
    }
  });

  // ب. حفظ الحضور أيضاً في التبويب المركزي Attendance المتطابق مع الترويسة المحددة
  // الأعمدة: [التوقيت، التاريخ، الساعة، اسم الطالب، كود الطالب، الفرقة الدراسية، الترم، كود المادة، اسم المادة، حالة الحضور، إيميل الدكتور/الأدمن]
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: 'Attendance!A:K',
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [[dateTimeStr, todayStr, timeStr, studentName, studentCode, grade, term, subjectCode, subjectName, 'حاضر', recordedBy]]
    }
  });

  return {
    success: true,
    message: `تم رصد حضور الطالب: ${studentName} في شيت [${subjectTabName}] بنجاح`,
    studentName: studentName,
    studentCode: studentCode,
    subjectTab: subjectTabName,
    time: timeStr
  };
}

// 5. الإحصائيات الشاملة مع دعم الفلترة وصلاحيات الدكتور والسوبر أدمن
async function getFullAnalyticsDirect(params = {}) {
  const { sheets, spreadsheetId } = await getSheetsClient();
  await ensureSheets(sheets, spreadsheetId);

  const userRole = (params.userRole || params.role || 'super_admin').trim();
  const assignedSubject = (params.assignedSubject || '').trim();
  const assignedGrade = (params.assignedGrade || '').trim();
  const filterSubject = (params.filterSubject || params.subject || '').trim();
  const filterGrade = (params.filterGrade || params.grade || '').trim();
  const filterTerm = (params.filterTerm || params.term || '').trim();

  if (userRole === 'leader') {
    throw new Error('غير مصرح لحساب ليدر الدفعة بالوصول إلى قسم الإحصائيات');
  }

  const [sRes, aRes] = await Promise.all([
    sheets.spreadsheets.values.get({ spreadsheetId, range: 'Students!A2:H' }),
    sheets.spreadsheets.values.get({ spreadsheetId, range: 'Attendance!A2:K' })
  ]);

  let students = sRes.data.values || [];
  let attendance = aRes.data.values || [];

  // إذا كان المستخدم دكتور، نلزم العرض بمادته وفرقته المخصصة فقط
  let targetSubject = (userRole === 'doctor' ? assignedSubject : filterSubject) || '';
  let targetGrade = (userRole === 'doctor' && assignedGrade !== 'الكل' ? assignedGrade : filterGrade) || '';
  let targetTerm = filterTerm || '';

  // تصفية الطلاب حسب الفرقة إن وُجدت
  if (targetGrade && targetGrade !== 'الكل') {
    students = students.filter(st => (st[4] || '').toString().trim() === targetGrade.trim());
  }

  // تصفية سجلات الحضور حسب المادة، الفرقة، والترم
  let filteredLogs = attendance;
  if (targetSubject && targetSubject !== 'الكل') {
    const cleanSubj = targetSubject.toLowerCase().trim();
    filteredLogs = filteredLogs.filter(row => {
      const code = (row[7] || row[6] || '').toString().toLowerCase().trim();
      const name = (row[8] || row[7] || '').toString().toLowerCase().trim();
      return code.includes(cleanSubj) || name.includes(cleanSubj) || cleanSubj.includes(code);
    });
  }
  if (targetGrade && targetGrade !== 'الكل') {
    filteredLogs = filteredLogs.filter(row => (row[5] || row[4] || '').toString().trim() === targetGrade.trim());
  }
  if (targetTerm && targetTerm !== 'الكل') {
    filteredLogs = filteredLogs.filter(row => (row[6] || row[5] || '').toString().trim() === targetTerm.trim());
  }

  const totalStudents = students.length;
  const totalLogs = filteredLogs.length;

  const subjectsMap = {};
  const studentLogs = {};
  const termStats = {
    'ترم أول': { attended: 0, total: 0, rate: 0, absRate: 0 },
    'ترم ثاني': { attended: 0, total: 0, rate: 0, absRate: 0 }
  };

  filteredLogs.forEach(row => {
    const term = row[6] || row[5] || 'ترم أول';
    const subjCode = row[7] || row[6] || '';
    const subjName = row[8] || row[7] || '';
    const stdCode = row[4] || row[2] || '';

    if (subjCode) {
      if (!subjectsMap[subjCode]) subjectsMap[subjCode] = { code: subjCode, name: subjName, sessions: 0 };
      subjectsMap[subjCode].sessions++;
    }

    if (stdCode) {
      studentLogs[stdCode] = (studentLogs[stdCode] || 0) + 1;
    }

    if (termStats[term]) {
      termStats[term].attended++;
    }
  });

  const subjects = Object.values(subjectsMap).map(s => {
    const attendanceRate = totalStudents > 0 ? Math.min(100, Math.round((s.sessions / Math.max(1, totalStudents * 4)) * 100)) : 0;
    return {
      code: s.code,
      name: s.name,
      sessions: s.sessions,
      attendanceRate: Math.max(10, attendanceRate),
      absenceRate: Math.max(0, 100 - Math.max(10, attendanceRate))
    };
  });

  const stdAnalytics = students.map(st => {
    const code = st[5] || '';
    const name = st[1] || '';
    const grade = st[4] || '';
    const attended = studentLogs[code] || 0;
    const totalPossible = targetSubject ? 5 : 10;
    const attRate = Math.min(100, Math.round((attended / totalPossible) * 100));
    return {
      name,
      grade,
      attended,
      totalPossible,
      attRate,
      absRate: 100 - attRate
    };
  });

  // قائمة السجلات التفصيلية لعرضها في جدول المادة وتصديرها Excel
  const recentRecords = filteredLogs.slice(-300).reverse().map(row => ({
    timestamp: row[0] || '',
    date: row[1] || '',
    time: row[2] || '',
    studentName: row[3] || '',
    studentCode: row[4] || '',
    grade: row[5] || '',
    term: row[6] || '',
    subjectCode: row[7] || '',
    subjectName: row[8] || '',
    status: row[9] || 'حاضر',
    recorder: row[10] || ''
  }));

  const yearAttRate = totalStudents > 0 && totalLogs > 0 ? Math.min(100, Math.round((totalLogs / (totalStudents * 5)) * 100)) : 0;

  return {
    success: true,
    isDoctorView: userRole === 'doctor',
    activeSubject: targetSubject || 'جميع المواد',
    totalStudents,
    totalLogs,
    yearAttRate: Math.max(0, yearAttRate),
    yearAbsRate: 100 - Math.max(0, yearAttRate),
    termStats,
    subjects,
    students: stdAnalytics,
    recentRecords
  };
}

// 6. التحقق من صلاحيات المشرف أو الدكتور أو ليدر الدفعة
async function validateAdminDirect(email, password) {
  const { sheets, spreadsheetId } = await getSheetsClient();
  await ensureSheets(sheets, spreadsheetId);

  const cleanEmail = (email || '').trim().toLowerCase();
  const cleanPass = (password || '').trim();
  const superAdminEmail = 'abdalla.elbardesy1@gmail.com';
  const masterKey = (process.env.ADMIN_SECRET_KEY || 'AinSarts@2027').trim();

  // إذا كان السوبر أدمن الرئيسي وكلمة المرور صحيحة
  if ((cleanEmail === superAdminEmail || cleanEmail === (process.env.ADMIN_EMAIL || '').toLowerCase().trim()) &&
      (cleanPass === masterKey || cleanPass === 'AinSarts@2027')) {
    return {
      valid: true,
      email: cleanEmail,
      name: 'عبدالله البرديسي (المشرف العام)',
      role: 'super_admin',
      assignedSubject: 'الكل',
      assignedGrade: 'الكل',
      active: 'نعم'
    };
  }

  // البحث في المشرفين / الدكاترة / الليدرز المسجلين في الشيت
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'Admins!A2:H'
  });
  const rows = res.data.values || [];

  for (const row of rows) {
    const rowEmail = (row[0] || '').toString().trim().toLowerCase();
    const rowPass = (row[1] || '').toString().trim();
    const rowName = (row[2] || rowEmail).toString().trim();
    const rowRole = (row[3] || 'leader').toString().trim();
    const rowSubj = (row[4] || 'الكل').toString().trim();
    const rowGrade = (row[5] || 'الكل').toString().trim();
    const rowActive = (row[7] || 'نعم').toString().trim();

    if (rowEmail === cleanEmail) {
      if (rowActive === 'لا') {
        throw new Error('تم تعطيل هذا الحساب من قِبل المشرف العام');
      }
      if (rowPass !== cleanPass && cleanPass !== masterKey && cleanPass !== 'AinSarts@2027') {
        throw new Error('كلمة المرور أو المفتاح السري غير صحيح');
      }
      return {
        valid: true,
        email: rowEmail,
        name: rowName,
        role: rowRole, // 'super_admin' | 'doctor' | 'leader'
        assignedSubject: rowSubj,
        assignedGrade: rowGrade,
        active: rowActive
      };
    }
  }

  throw new Error('البريد الإلكتروني غير مسجل ضمن قائمة المشرفين المصرح لهم');
}

// 7. إدارة المشرفين والصلاحيات (للسوبر أدمن فقط)
async function getAdminsListDirect() {
  const { sheets, spreadsheetId } = await getSheetsClient();
  await ensureSheets(sheets, spreadsheetId);

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'Admins!A2:H'
  });
  const rows = res.data.values || [];

  return rows.map((r, idx) => ({
    rowId: idx + 2,
    email: (r[0] || '').trim(),
    password: (r[1] || '').trim(),
    name: (r[2] || '').trim(),
    role: (r[3] || 'leader').trim(),
    assignedSubject: (r[4] || 'الكل').trim(),
    assignedGrade: (r[5] || 'الكل').trim(),
    createdAt: (r[6] || '').trim(),
    active: (r[7] || 'نعم').trim()
  }));
}

async function addOrUpdateAdminDirect(adminData) {
  const { sheets, spreadsheetId } = await getSheetsClient();
  await ensureSheets(sheets, spreadsheetId);

  const email = (adminData.email || '').trim().toLowerCase();
  const password = (adminData.password || '').trim();
  const name = (adminData.name || email).trim();
  const role = (adminData.role || 'leader').trim();
  const assignedSubject = (adminData.assignedSubject || 'الكل').trim();
  const assignedGrade = (adminData.assignedGrade || 'الكل').trim();
  const active = adminData.active || 'نعم';

  if (!email || !password) {
    throw new Error('البريد الإلكتروني وكلمة المرور مطلوبان');
  }

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'Admins!A2:H'
  });
  const rows = res.data.values || [];
  let existingRow = -1;

  for (let i = 0; i < rows.length; i++) {
    if ((rows[i][0] || '').toString().trim().toLowerCase() === email) {
      existingRow = i + 2;
      break;
    }
  }

  const dateStr = new Date().toLocaleDateString('ar-EG');
  const rowData = [email, password, name, role, assignedSubject, assignedGrade, dateStr, active];

  if (existingRow !== -1) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `Admins!A${existingRow}:H${existingRow}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [rowData] }
    });
    return { success: true, message: `تم تحديث صلاحيات الحساب (${name}) بنجاح` };
  } else {
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: 'Admins!A:H',
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [rowData] }
    });
    return { success: true, message: `تم إضافة الحساب (${name}) بدور (${role}) بنجاح` };
  }
}

async function deleteAdminDirect(email) {
  const { sheets, spreadsheetId } = await getSheetsClient();
  const cleanEmail = (email || '').trim().toLowerCase();

  if (cleanEmail === 'abdalla.elbardesy1@gmail.com') {
    throw new Error('لا يمكن حذف حساب السوبر أدمن الرئيسي');
  }

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'Admins!A2:A'
  });
  const rows = res.data.values || [];
  let targetRow = -1;

  for (let i = 0; i < rows.length; i++) {
    if ((rows[i][0] || '').toString().trim().toLowerCase() === cleanEmail) {
      targetRow = i + 2;
      break;
    }
  }

  if (targetRow === -1) {
    throw new Error('الحساب غير موجود');
  }

  // تعطيل الحساب
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `Admins!H${targetRow}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [['لا']] }
  });

  return { success: true, message: `تم تعطيل حساب (${cleanEmail}) بنجاح` };
}

// 8. ترقية الطلاب
async function promoteStudentsDirect(codes, targetGrade) {
  const { sheets, spreadsheetId } = await getSheetsClient();
  await ensureSheets(sheets, spreadsheetId);

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'Students!A2:F'
  });
  const rows = res.data.values || [];
  let count = 0;

  for (let i = 0; i < rows.length; i++) {
    const code = (rows[i][5] || '').toString().trim();
    if (codes.includes(code)) {
      const rowIndex = i + 2;
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `Students!E${rowIndex}`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [[targetGrade]] }
      });
      count++;
    }
  }

  return { success: true, message: `تمت ترقية ${count} طالب بنجاح إلى ${targetGrade}` };
}

// دالة وسيطة للتوافق
async function callGasApi(action, payload = {}) {
  if (action === 'registerStudent') return await registerStudentDirect(payload);
  if (action === 'getStudentsList') return { success: true, students: await getStudentsListDirect(payload.grade, payload.search) };
  if (action === 'updateStudentData') return await updateStudentDataDirect(payload.code, payload.updated);
  if (action === 'recordAttendance') return await recordAttendanceDirect(payload);
  if (action === 'getFullAnalytics') return await getFullAnalyticsDirect(payload);
  if (action === 'promoteStudentsList') return await promoteStudentsDirect(payload.codes, payload.targetGrade);
  if (action === 'validateAdmin') return await validateAdminDirect(payload.email, payload.key);
  if (action === 'getAdminsList') return { success: true, admins: await getAdminsListDirect() };
  if (action === 'addOrUpdateAdmin') return await addOrUpdateAdminDirect(payload);
  if (action === 'deleteAdmin') return await deleteAdminDirect(payload.email);
  return { success: false, message: 'Unknown action' };
}

module.exports = {
  getSheetsClient,
  registerStudentDirect,
  getStudentsListDirect,
  updateStudentDataDirect,
  recordAttendanceDirect,
  getFullAnalyticsDirect,
  promoteStudentsDirect,
  validateAdminDirect,
  getAdminsListDirect,
  addOrUpdateAdminDirect,
  deleteAdminDirect,
  callGasApi,
  getSubjectSheetName,
  ensureSubjectSheet
};
