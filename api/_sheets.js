const { google } = require('googleapis');
const path = require('path');
const fs = require('fs');

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];
const SPREADSHEET_ID = (process.env.GOOGLE_SHEET_ID || '1lOvjgilrsXCeTWK5gvn9NTeb-gx4EuSE-cSOpu6UmFQ').trim();

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

// التأكد من وجود التبويبات والعناوين
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

    // تهيئة عناوين الأعمدة إن كانت فارغة
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

    const aValues = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Attendance!A1:I1'
    });
    if (!aValues.data.values || aValues.data.values.length === 0) {
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: 'Attendance!A1:I1',
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: [['التاريخ', 'الوقت', 'كود الطالب', 'اسم الطالب', 'الفرقة', 'الترم', 'كود المادة', 'اسم المادة', 'المسجل']]
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

// 1. تسجيل طالب جديد
async function registerStudentDirect(payload) {
  const { sheets, spreadsheetId } = await getSheetsClient();
  await ensureSheets(sheets, spreadsheetId);

  const name = (payload.name || '').trim();
  const regType = (payload.enrollType || payload.regType || 'انتظام').trim();
  const status = (payload.status || 'عام').trim();
  const grade = (payload.grade || 'الفرقة الأولى').trim();

  if (!name) throw new Error('اسم الطالب مطلوب');

  // جلب عدد الطلاب لتوليد التسلسل
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

  // تحديث الاسم، نوع القيد، الحالة، الفرقة
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

// 4. رصد الحضور
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

  // فحص منع التكرار في نفس اليوم والمادة
  const attRes = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'Attendance!A2:G'
  });
  const attRows = attRes.data.values || [];

  for (const row of attRows) {
    const rowDate = (row[0] || '').toString().trim();
    const rowCode = (row[2] || '').toString().trim();
    const rowSubj = (row[6] || '').toString().trim();

    if (rowDate === todayStr && rowCode === studentCode && rowSubj === subjectCode) {
      return {
        success: false,
        type: 'duplicate',
        message: `تم تسجيل حضور الطالب ${studentName} في هذه المادة اليوم مسبقاً.`
      };
    }
  }

  // إضافة الحضور
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: 'Attendance!A:I',
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [[todayStr, timeStr, studentCode, studentName, grade, term, subjectCode, subjectName, recordedBy]]
    }
  });

  return {
    success: true,
    message: `تم رصد حضور الطالب: ${studentName}`,
    studentName: studentName,
    studentCode: studentCode,
    time: timeStr
  };
}

// 5. الإحصائيات الشاملة
async function getFullAnalyticsDirect() {
  const { sheets, spreadsheetId } = await getSheetsClient();
  await ensureSheets(sheets, spreadsheetId);

  const [sRes, aRes] = await Promise.all([
    sheets.spreadsheets.values.get({ spreadsheetId, range: 'Students!A2:H' }),
    sheets.spreadsheets.values.get({ spreadsheetId, range: 'Attendance!A2:I' })
  ]);

  const students = sRes.data.values || [];
  const attendance = aRes.data.values || [];

  const totalStudents = students.length;
  const totalLogs = attendance.length;

  const subjectsMap = {};
  const studentLogs = {};
  const termStats = {
    'ترم أول': { attended: 0, total: 0, rate: 0, absRate: 0 },
    'ترم ثاني': { attended: 0, total: 0, rate: 0, absRate: 0 }
  };

  attendance.forEach(row => {
    const term = row[5] || 'ترم أول';
    const subjCode = row[6] || '';
    const subjName = row[7] || '';
    const stdCode = row[2] || '';

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

  // حساب نسب المواد
  const subjects = Object.values(subjectsMap).map(s => {
    const attendanceRate = totalStudents > 0 ? Math.min(100, Math.round((s.sessions / (totalStudents * 4)) * 100)) : 0;
    return {
      code: s.code,
      name: s.name,
      sessions: s.sessions,
      attendanceRate: Math.max(10, attendanceRate),
      absenceRate: Math.max(0, 100 - Math.max(10, attendanceRate))
    };
  });

  // حساب نسب الطلاب
  const stdAnalytics = students.map(st => {
    const code = st[5] || '';
    const name = st[1] || '';
    const grade = st[4] || '';
    const attended = studentLogs[code] || 0;
    const totalPossible = 10;
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

  const yearAttRate = totalStudents > 0 && totalLogs > 0 ? Math.min(100, Math.round((totalLogs / (totalStudents * 10)) * 100)) : 0;

  return {
    success: true,
    totalStudents,
    totalLogs,
    yearAttRate: Math.max(0, yearAttRate),
    yearAbsRate: 100 - Math.max(0, yearAttRate),
    termStats,
    subjects,
    students: stdAnalytics
  };
}

// 6. ترقية الطلاب
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
  if (action === 'getFullAnalytics') return await getFullAnalyticsDirect();
  if (action === 'promoteStudentsList') return await promoteStudentsDirect(payload.codes, payload.targetGrade);
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
  callGasApi
};
