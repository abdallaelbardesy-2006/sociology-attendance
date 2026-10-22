const { getSheetsClient, getSubjectSheetName } = require('../api/_sheets.js');

const CURRICULUM = {
  'الفرقة الأولى': {
    'ترم أول': [
      { code: 'IIT110', name: 'مقدمة في التكنولوجيا والمعلومات (متطلب جامعة)' },
      { code: 'EUR110', name: 'لغة أوروبية 1' },
      { code: 'soc111', name: 'مدخل إلى علم الاجتماع' },
      { code: 'soc112', name: 'علم النفس الاجتماعي' },
      { code: 'soc113', name: 'علم الاجتماع والذكاء الاصطناعي' },
      { code: 'soc114', name: 'مبادئ إحصاء اجتماعي' },
      { code: 'soc115', name: 'فلسفة حديثة' },
      { code: 'soc116', name: 'مجتمع عربي معاصر (اختياري)' },
      { code: 'soc117', name: 'المرأة والمجتمع (اختياري)' },
      { code: 'soc118', name: 'مهارات التفكير العلمي (اختياري)' }
    ],
    'ترم ثاني': [
      { code: 'AEA120', name: 'الفن المصري القديم (متطلب جامعة)' },
      { code: 'Arb120', name: 'لغة عربية 1' },
      { code: 'soc121', name: 'الفكر الاجتماعي بين الأصالة والمعاصرة' },
      { code: 'soc122', name: 'بناء المجتمع المصري' },
      { code: 'soc123', name: 'مقدمة في الأنثروبولوجيا' },
      { code: 'soc124', name: 'الأسرة المصرية المعاصرة' },
      { code: 'soc125', name: 'علم اجتماع مسنين تدريب ميداني' },
      { code: 'soc126', name: 'التغير الاجتماعي (اختياري)' },
      { code: 'soc127', name: 'علم اجتماع تربية (اختياري)' },
      { code: 'soc128', name: 'علم اجتماع سكاني (اختياري)' }
    ]
  },
  'الفرقة الثانية': {
    'ترم أول': [
      { code: 'soc210', name: 'قضايا مجتمعية (متطلب جامعة)' },
      { code: 'EUR210', name: 'لغة أوروبية 2' },
      { code: 'soc211', name: 'علم الاجتماع الاقتصادي' },
      { code: 'soc212', name: 'الإحصاء الاجتماعي التطبيقي' },
      { code: 'soc213', name: 'علم اجتماع الثقافة' },
      { code: 'soc214', name: 'قضايا الطفولة المعاصرة' },
      { code: 'soc215', name: 'العولمة والمجتمع' },
      { code: 'soc216', name: 'الشباب والمجتمع (اختياري)' },
      { code: 'soc217', name: 'الاستشارات الأسرية (اختياري)' },
      { code: 'soc218', name: 'علم اجتماع ريفي (اختياري)' }
    ],
    'ترم ثاني': [
      { code: 'CIA220', name: 'الفن القبطي والإسلامي (متطلب جامعة)' },
      { code: 'Arb220', name: 'لغة عربية 2' },
      { code: 'soc221', name: 'علم الاجتماع الإعلامي' },
      { code: 'soc222', name: 'علم الاجتماع الأمني' },
      { code: 'soc223', name: 'نصوص اجتماعية بلغة أوروبية 1' },
      { code: 'soc224', name: 'الفن والمجتمع' },
      { code: 'soc225', name: 'الفئات الاجتماعية الخاصة تدريب ميداني' },
      { code: 'soc226', name: 'نماذج تنموية عالمية (اختياري)' },
      { code: 'soc227', name: 'علم الاجتماع الحياة اليومية (اختياري)' },
      { code: 'soc228', name: 'علم الاجتماع البيئي (اختياري)' }
    ]
  },
  'الفرقة الثالثة': {
    'ترم أول': [
      { code: 'TDC310', name: 'التسامح وحوار الحضارات (متطلب جامعة)' },
      { code: 'Eur310', name: 'لغة أوروبية 3' },
      { code: 'soc311', name: 'علم الاجتماع السياسي' },
      { code: 'soc312', name: 'علم الاجتماع الصناعي' },
      { code: 'soc313', name: 'البحث الاجتماعي تدريب ميداني' },
      { code: 'soc314', name: 'القانون والمجتمع' },
      { code: 'soc315', name: 'الدين والمجتمع (اختياري)' },
      { code: 'soc316', name: 'علم الاجتماع التنظيمي (اختياري)' },
      { code: 'soc317', name: 'الدبلوماسية الاجتماعية والعلاقات الدولية (اختياري)' },
      { code: 'soc318', name: 'المجتمع الحضري الحديث (اختياري)' }
    ],
    'ترم ثاني': [
      { code: 'AAr320', name: 'الفن في عصر النهضة العربية (متطلب جامعة)' },
      { code: 'Arb320', name: 'لغة عربية 3' },
      { code: 'soc321', name: 'علم اجتماع الجرائم المستحدثة' },
      { code: 'soc322', name: 'النظرية في علم الاجتماع' },
      { code: 'soc323', name: 'علم اجتماع التنمية البشرية الخدمة الاجتماعية تدريب ميداني' },
      { code: 'soc324', name: 'قضايا النوع الاجتماعي (اختياري)' },
      { code: 'soc325', name: 'علم الاجتماع السياحي (اختياري)' },
      { code: 'soc326', name: 'علم اجتماع العلم (اختياري)' },
      { code: 'soc327', name: 'علم الاجتماع الإقليمي (اختياري)' },
      { code: 'soc328', name: 'المقررات الاختيارية' }
    ]
  },
  'الفرقة الرابعة': {
    'ترم أول': [
      { code: 'CTH410', name: 'التفكير الناقد (متطلب جامعة)' },
      { code: 'soc411', name: 'المشكلات الاجتماعية' },
      { code: 'soc412', name: 'المعرفة وبناء المجتمع' },
      { code: 'soc413', name: 'التخطيط والسياسة الاجتماعية' },
      { code: 'soc414', name: 'علم الاجتماع الأزمات' },
      { code: 'soc415', name: 'المجتمع المدني تدريب ميداني' },
      { code: 'soc416', name: 'المشروعات التنموية تدريب ميداني (اختياري)' },
      { code: 'soc417', name: 'الرياضة والمجتمع تدريب ميداني (اختياري)' },
      { code: 'soc418', name: 'علم الاجتماع التطبيقي تدريب ميداني (اختياري)' }
    ],
    'ترم ثاني': [
      { code: 'MEA420', name: 'الفن المصري الحديث (متطلب جامعة)' },
      { code: 'soc421', name: 'علم اجتماع المستقبل' },
      { code: 'soc422', name: 'نصوص اجتماعية بلغة أوروبية 2' },
      { code: 'soc423', name: 'الأمن الإنساني والتنمية المستدامة' },
      { code: 'soc424', name: 'مشروع التخرج تصميم بحوث' },
      { code: 'soc425', name: 'سوسيولوجيا الصحة والمرض تدريب ميداني' },
      { code: 'soc426', name: 'علم اجتماع الإنترنت (اختياري)' },
      { code: 'soc427', name: 'سوسيولوجيا العمل عن بعد (اختياري)' },
      { code: 'soc428', name: 'المجتمعات الرقمية الحديثة (اختياري)' }
    ]
  }
};

async function main() {
  try {
    const { sheets, spreadsheetId } = await getSheetsClient();
    const meta = await sheets.spreadsheets.get({ spreadsheetId });
    const existing = new Set((meta.data.sheets || []).map(s => s.properties.title));

    const titlesToCreate = [];
    for (const g in CURRICULUM) {
      for (const t in CURRICULUM[g]) {
        for (const item of CURRICULUM[g][t]) {
          const title = getSubjectSheetName(item.code, item.name);
          if (!existing.has(title) && !titlesToCreate.includes(title)) {
            titlesToCreate.push(title);
          }
        }
      }
    }

    console.log(`Found ${titlesToCreate.length} subjects to create.`);
    if (titlesToCreate.length === 0) {
      console.log('All subject sheets are already created!');
      return;
    }

    // Google Sheets API batchUpdate can handle batches of sheets
    // To ensure reliability, we will create in chunks of 25
    const CHUNK_SIZE = 25;
    for (let i = 0; i < titlesToCreate.length; i += CHUNK_SIZE) {
      const chunk = titlesToCreate.slice(i, i + CHUNK_SIZE);
      console.log(`Creating batch ${Math.floor(i / CHUNK_SIZE) + 1} (${chunk.length} sheets)...`);

      const addSheetRequests = chunk.map(title => ({
        addSheet: {
          properties: {
            title: title,
            gridProperties: { frozenRowCount: 1 },
            tabColor: { red: 0.1, green: 0.25, blue: 0.65 }
          }
        }
      }));

      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: { requests: addSheetRequests }
      });

      const headerRow = ['التوقيت', 'التاريخ', 'الساعة', 'اسم الطالب', 'كود الطالب', 'الفرقة الدراسية', 'الترم', 'حالة الحضور', 'إيميل الدكتور/الأدمن'];
      const valueData = chunk.map(title => ({
        range: `'${title}'!A1:I1`,
        values: [headerRow]
      }));

      await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId,
        requestBody: {
          valueInputOption: 'USER_ENTERED',
          data: valueData
        }
      });

      console.log(`Batch ${Math.floor(i / CHUNK_SIZE) + 1} created and headers written.`);
    }

    console.log('ALL SUBJECT SHEETS CREATED SUCCESSFULLY!');
  } catch (err) {
    console.error('Error creating subject sheets:', err.message);
  }
}

main();
