// ====================================================================
// نظام تسجيل الحضور والغياب الذكي - قسم علم الاجتماع (جامعة عين شمس)
// اللائحة الجديدة | Sociology Attendance System Backend
// ====================================================================

const SPREADSHEET_ID = '1lOvjgilrsXCeTWK5gvn9NTeb-gx4EuSE-cSOpu6UmFQ';
const SUPER_ADMIN_EMAIL = 'abdalla.elbardesy1@gmail.com';

function getSS_() {
  try {
    return SpreadsheetApp.openById(SPREADSHEET_ID);
  } catch (e) {
    return SpreadsheetApp.getActiveSpreadsheet();
  }
}

// 1. دالة استقبال كافة طلبات الموقع (POST)
function doPost(e) {
  try {
    let contents = {};
    if (e && e.postData && e.postData.contents) {
      contents = JSON.parse(e.postData.contents);
    } else if (e && e.parameter && e.parameter.data) {
      contents = JSON.parse(e.parameter.data);
    }

    const action = contents.action || (e && e.parameter && e.parameter.action);
    const payload = contents.payload || {};
    let result = { success: false, message: 'الإجراء غير معروف: ' + action };

    if (action === 'validateAdmin') {
      result = validateAdmin(payload.email);
    } else if (action === 'registerStudent') {
      result = registerStudent(payload);
    } else if (action === 'recordAttendance') {
      result = recordAttendance(payload);
    } else if (action === 'getStudentsList') {
      const list = getStudentsList(payload.grade, payload.search);
      result = { success: true, students: list };
    } else if (action === 'updateStudentData') {
      result = updateStudentData(payload.code, payload.updated);
    } else if (action === 'getFullAnalytics') {
      result = getFullAnalytics(payload.grade, payload.term);
    } else if (action === 'promoteStudentsList') {
      result = promoteStudentsList(payload.codes, payload.targetGrade);
    }

    return ContentService.createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ success: false, error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// 2. دالة الفحص عبر (GET)
function doGet(e) {
  if (e && e.parameter && e.parameter.action) {
    return doPost(e);
  }
  return ContentService.createTextOutput(JSON.stringify({ status: 'running', message: 'نظام الحضور يعمل بنجاح' }))
    .setMimeType(ContentService.MimeType.JSON);
}

// 3. تهيئة وتنسيق الجداول تلقائياً إن كانت فارغة
function setupSystem() {
  const ss = getSS_();
  
  // ورقة الطلاب Students
  let sSheet = ss.getSheetByName('Students') || ss.insertSheet('Students');
  if (sSheet.getLastRow() === 0) {
    sSheet.appendRow(['التوقيت', 'الاسم بالكامل', 'نوع القيد', 'الحالة', 'الفرقة الدراسية', 'كود الطالب', 'بيانات QR', 'نشط']);
    sSheet.getRange(1, 1, 1, 8).setBackground('#1a237e').setFontColor('#ffffff').setFontWeight('bold');
    sSheet.setFrozenRows(1);
  }

  // ورقة المشرفين Admins
  let aSheet = ss.getSheetByName('Admins') || ss.insertSheet('Admins');
  if (aSheet.getLastRow() === 0) {
    aSheet.appendRow(['الإيميل', 'الدور', 'تاريخ الإضافة']);
    aSheet.getRange(1, 1, 1, 3).setBackground('#1a237e').setFontColor('#ffffff').setFontWeight('bold');
    aSheet.appendRow([SUPER_ADMIN_EMAIL, 'super_admin', new Date()]);
    aSheet.setFrozenRows(1);
  }

  // ورقة الحضور Attendance
  let attSheet = ss.getSheetByName('Attendance') || ss.insertSheet('Attendance');
  if (attSheet.getLastRow() === 0) {
    attSheet.appendRow(['التوقيت', 'التاريخ', 'الساعة', 'اسم الطالب', 'كود الطالب', 'الفرقة الدراسية', 'الترم', 'كود المادة', 'اسم المادة', 'حالة الحضور', 'إيميل الأدمن']);
    attSheet.getRange(1, 1, 1, 11).setBackground('#1a237e').setFontColor('#ffffff').setFontWeight('bold');
    attSheet.setFrozenRows(1);
  }

  return { success: true };
}

// 4. التحقق من صلاحية الأدمن
function validateAdmin(email) {
  const ss = getSS_();
  setupSystem();
  const sheet = ss.getSheetByName('Admins');
  const data = sheet.getDataRange().getValues();
  const clean = String(email || '').trim().toLowerCase();

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim().toLowerCase() === clean) {
      return { valid: true, email: data[i][0], role: data[i][1] };
    }
  }

  if (clean === SUPER_ADMIN_EMAIL.toLowerCase()) {
    sheet.appendRow([SUPER_ADMIN_EMAIL, 'super_admin', new Date()]);
    return { valid: true, email: SUPER_ADMIN_EMAIL, role: 'super_admin' };
  }

  return { valid: false, message: 'هذا الإيميل غير مضاف في قائمة المشرفين المصرح لهم' };
}

// 5. تسجيل طالب جديد وتوليد الكود
function registerStudent(data) {
  const ss = getSS_();
  setupSystem();
  const sheet = ss.getSheetByName('Students');
  const gradeMap = { 'الفرقة الأولى': '1', 'الفرقة الثانية': '2', 'الفرقة الثالثة': '3', 'الفرقة الرابعة': '4' };
  const gNum = gradeMap[data.grade] || '1';
  const year = new Date().getFullYear();

  const rows = sheet.getDataRange().getValues();
  const prefix = 'SOC-' + year + '-' + gNum;
  let maxSeq = 0;
  for (let i = 1; i < rows.length; i++) {
    const c = String(rows[i][5]);
    if (c.startsWith(prefix)) {
      const n = parseInt(c.split('-').pop(), 10);
      if (n > maxSeq) maxSeq = n;
    }
  }

  const studentCode = prefix + '-' + String(maxSeq + 1).padStart(4, '0');
  const qrData = JSON.stringify({
    code: studentCode,
    name: data.name,
    grade: data.grade,
    enrollType: data.enrollType,
    status: data.status
  });

  sheet.appendRow([new Date(), data.name, data.enrollType, data.status, data.grade, studentCode, qrData, 'نشط']);
  return { success: true, studentCode: studentCode, qrData: qrData };
}

// 6. تسجيل الحضور مع كشف الغش والتكرار
function recordAttendance(data) {
  const ss = getSS_();
  setupSystem();
  const attSheet = ss.getSheetByName('Attendance');
  const stdSheet = ss.getSheetByName('Students');

  let qrInfo;
  try {
    qrInfo = typeof data.qrData === 'string' ? JSON.parse(data.qrData) : data.qrData;
  } catch (e) {
    return { success: false, message: 'كود QR غير صالح', type: 'error' };
  }

  const students = stdSheet.getDataRange().getValues();
  let student = null;
  for (let i = 1; i < students.length; i++) {
    if (String(students[i][5]).trim() === String(qrInfo.code).trim()) {
      student = students[i];
      break;
    }
  }

  if (!student) return { success: false, message: 'الطالب غير مقيد في شيت الكلية!', type: 'error' };
  if (student[7] === 'غير نشط') return { success: false, message: 'قيد الطالب معطل حالياً!', type: 'error' };
  if (String(student[4]).trim() !== String(data.selectedGrade).trim()) {
    return { success: false, message: 'الطالب مقيد في (' + student[4] + ') وليس في (' + data.selectedGrade + ')', type: 'warning' };
  }

  const today = Utilities.formatDate(new Date(), 'Africa/Cairo', 'yyyy-MM-dd');
  const logs = attSheet.getDataRange().getValues();
  const duplicate = logs.some(function(l) {
    const rowDate = Utilities.formatDate(new Date(l[0]), 'Africa/Cairo', 'yyyy-MM-dd');
    return String(l[4]).trim() === String(qrInfo.code).trim() && String(l[7]).trim() === String(data.subjectCode).trim() && rowDate === today;
  });

  if (duplicate) {
    return { success: false, message: 'الطالب (' + student[1] + ') مسجل مسبقاً اليوم في هذه المادة!', type: 'duplicate' };
  }

  const now = new Date();
  const timeStr = Utilities.formatDate(now, 'Africa/Cairo', 'hh:mm:ss a');
  attSheet.appendRow([now, today, timeStr, student[1], qrInfo.code, data.selectedGrade, data.selectedTerm, data.subjectCode, data.subjectName, 'حاضر', data.adminEmail]);

  return { success: true, message: 'تم تسجيل حضور: ' + student[1], studentName: student[1], studentCode: qrInfo.code, time: timeStr };
}

// 7. جلب قائمة الطلاب
function getStudentsList(grade, search) {
  const sheet = getSS_().getSheetByName('Students');
  setupSystem();
  const rows = sheet.getDataRange().getValues();
  const list = [];
  for (let i = 1; i < rows.length; i++) {
    const item = { name: rows[i][1], enrollType: rows[i][2], status: rows[i][3], grade: rows[i][4], code: rows[i][5], active: rows[i][7] || 'نشط' };
    if (grade && item.grade !== grade) continue;
    if (search) {
      const q = search.toLowerCase();
      if (!String(item.name).toLowerCase().includes(q) && !String(item.code).toLowerCase().includes(q)) continue;
    }
    list.push(item);
  }
  return list;
}

// 8. تعديل بيانات طالب
function updateStudentData(code, updated) {
  const sheet = getSS_().getSheetByName('Students');
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][5]).trim() === String(code).trim()) {
      const r = i + 1;
      sheet.getRange(r, 2).setValue(updated.name);
      sheet.getRange(r, 3).setValue(updated.enrollType);
      sheet.getRange(r, 4).setValue(updated.status);
      sheet.getRange(r, 5).setValue(updated.grade);
      const qrData = JSON.stringify({ code: code, name: updated.name, grade: updated.grade, enrollType: updated.enrollType, status: updated.status });
      sheet.getRange(r, 7).setValue(qrData);
      return { success: true };
    }
  }
  return { success: false, error: 'الطالب غير موجود' };
}

// 9. الإحصائيات الشاملة
function getFullAnalytics(grade, term) {
  const ss = getSS_();
  setupSystem();
  const students = ss.getSheetByName('Students').getDataRange().getValues();
  const atts = ss.getSheetByName('Attendance').getDataRange().getValues();

  const stdList = [];
  for (let i = 1; i < students.length; i++) {
    if (!grade || students[i][4] === grade) {
      stdList.push({ name: students[i][1], code: String(students[i][5]), grade: students[i][4] });
    }
  }

  const logs = [];
  for (let i = 1; i < atts.length; i++) {
    if ((!grade || atts[i][5] === grade) && (!term || atts[i][6] === term)) {
      logs.push({ date: atts[i][1], code: String(atts[i][4]), subjCode: String(atts[i][7]), subjName: atts[i][8] });
    }
  }

  const subjectsMap = {};
  logs.forEach(function(l) {
    if (!subjectsMap[l.subjCode]) subjectsMap[l.subjCode] = { name: l.subjName, dates: new Set() };
    subjectsMap[l.subjCode].dates.add(l.date);
  });

  const subjectStats = Object.keys(subjectsMap).map(function(k) {
    const s = subjectsMap[k];
    const cap = (s.dates.size * (stdList.length || 1)) || 1;
    const hits = logs.filter(function(x) { return x.subjCode === k; }).length;
    const rate = Math.min(100, Math.round((hits / cap) * 100));
    return { code: k, name: s.name, sessions: s.dates.size, attendanceRate: rate, absenceRate: 100 - rate };
  });

  const totalSessions = Object.values(subjectsMap).reduce(function(a, b) { return a + b.dates.size; }, 0) || 1;
  const studentStats = stdList.map(function(st) {
    const myHits = logs.filter(function(l) { return l.code === st.code; }).length;
    const rate = Math.min(100, Math.round((myHits / totalSessions) * 100));
    return { name: st.name, code: st.code, grade: st.grade, attended: myHits, totalPossible: totalSessions, attRate: rate, absRate: 100 - rate };
  });

  const grandCap = (totalSessions * (stdList.length || 1)) || 1;
  const yearAttRate = Math.min(100, Math.round((logs.length / grandCap) * 100));

  return { success: true, totalStudents: stdList.length, totalLogs: logs.length, yearAttRate: yearAttRate, yearAbsRate: 100 - yearAttRate, subjects: subjectStats, students: studentStats };
}

// 10. ترقية الطلاب
function promoteStudentsList(codes, targetGrade) {
  const sheet = getSS_().getSheetByName('Students');
  const rows = sheet.getDataRange().getValues();
  let count = 0;
  for (let i = 1; i < rows.length; i++) {
    if (codes.includes(String(rows[i][5]))) {
      const r = i + 1;
      sheet.getRange(r, 5).setValue(targetGrade);
      const qrData = JSON.stringify({ code: rows[i][5], name: rows[i][1], grade: targetGrade, enrollType: rows[i][2], status: rows[i][3] });
      sheet.getRange(r, 7).setValue(qrData);
      count++;
    }
  }
  return { success: true, count: count, message: 'تمت ترقية ' + count + ' طالب بنجاح' };
}