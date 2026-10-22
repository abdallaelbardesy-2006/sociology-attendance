const { getSheetsInstance, ensureSheetsInitialized } = require('./_sheets');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const { grade, term } = req.query || {};
    const { sheets, spreadsheetId } = await getSheetsInstance();
    await ensureSheetsInitialized(sheets, spreadsheetId);

    const [stRes, attRes] = await Promise.all([
      sheets.spreadsheets.values.get({ spreadsheetId, range: 'Students!A2:H' }),
      sheets.spreadsheets.values.get({ spreadsheetId, range: 'Attendance!A2:K' })
    ]);

    const rawStudents = stRes.data.values || [];
    const rawAtt = attRes.data.values || [];

    let students = rawStudents.map(r => ({
      name: r[1] || '',
      enrollType: r[2] || '',
      status: r[3] || '',
      grade: r[4] || '',
      code: String(r[5] || '').trim()
    }));

    if (grade && grade.trim() !== '') {
      students = students.filter(s => s.grade === grade);
    }

    let logs = rawAtt.map(r => ({
      date: String(r[1] || '').trim(),
      time: r[2] || '',
      name: r[3] || '',
      code: String(r[4] || '').trim(),
      grade: r[5] || '',
      term: r[6] || '',
      subjCode: String(r[7] || '').trim(),
      subjName: r[8] || ''
    }));

    if (grade && grade.trim() !== '') {
      logs = logs.filter(l => l.grade === grade);
    }
    if (term && term.trim() !== '') {
      logs = logs.filter(l => l.term === term);
    }

    // 1. إحصائيات المواد
    const subjectsMap = {};
    logs.forEach(l => {
      if (!subjectsMap[l.subjCode]) {
        subjectsMap[l.subjCode] = {
          name: l.subjName,
          dates: new Set(),
          attendees: new Set()
        };
      }
      subjectsMap[l.subjCode].dates.add(l.date);
      subjectsMap[l.subjCode].attendees.add(l.code);
    });

    const subjectStats = Object.keys(subjectsMap).map(k => {
      const s = subjectsMap[k];
      const sessionCount = s.dates.size;
      const totalCapacity = (sessionCount * (students.length || 1)) || 1;
      const actualHits = logs.filter(x => x.subjCode === k).length;
      const attRate = Math.min(100, Math.round((actualHits / totalCapacity) * 100));
      return {
        code: k,
        name: s.name,
        sessions: sessionCount,
        attendeesCount: s.attendees.size,
        attendanceRate: attRate,
        absenceRate: Math.max(0, 100 - attRate)
      };
    });

    const totalDistinctSessions = Object.values(subjectsMap).reduce((acc, curr) => acc + curr.dates.size, 0) || 1;

    // 2. إحصائيات كل طالب
    const studentStats = students.map(st => {
      const myCount = logs.filter(l => l.code === st.code).length;
      const attRate = Math.min(100, Math.round((myCount / totalDistinctSessions) * 100));
      return {
        name: st.name,
        code: st.code,
        grade: st.grade,
        attended: myCount,
        totalPossible: totalDistinctSessions,
        attRate: attRate,
        absRate: Math.max(0, 100 - attRate)
      };
    });

    // 3. إحصائيات الترم (ترم أول / ترم ثاني)
    const termStats = {
      'ترم أول': { attended: 0, totalCapacity: 0, rate: 0, absRate: 0 },
      'ترم ثاني': { attended: 0, totalCapacity: 0, rate: 0, absRate: 0 }
    };

    ['ترم أول', 'ترم ثاني'].forEach(t => {
      const tLogs = rawAtt.filter(r => (grade ? r[5] === grade : true) && r[6] === t);
      const tSubjectsMap = {};
      tLogs.forEach(r => {
        const sc = String(r[7] || '').trim();
        if (!tSubjectsMap[sc]) tSubjectsMap[sc] = new Set();
        tSubjectsMap[sc].add(String(r[1] || '').trim());
      });
      const tSessions = Object.values(tSubjectsMap).reduce((a, b) => a + b.size, 0) || 1;
      const tCapacity = (tSessions * (students.length || 1)) || 1;
      const rate = Math.min(100, Math.round((tLogs.length / tCapacity) * 100));
      termStats[t] = {
        attended: tLogs.length,
        sessions: tSessions,
        rate: rate,
        absRate: Math.max(0, 100 - rate)
      };
    });

    // 4. إحصائيات العام الدراسي ككل
    const grandCapacity = (totalDistinctSessions * (students.length || 1)) || 1;
    const yearAttRate = Math.min(100, Math.round((logs.length / grandCapacity) * 100));

    return res.status(200).json({
      success: true,
      totalStudents: students.length,
      totalLogs: logs.length,
      yearAttRate: yearAttRate,
      yearAbsRate: Math.max(0, 100 - yearAttRate),
      termStats,
      subjects: subjectStats,
      students: studentStats
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
};
