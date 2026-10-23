const { getSheetsClient, getSubjectSheetName } = require('../api/_sheets.js');

const { CURRICULUM } = require('../api/_lib/curriculum.js');

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
          valueInputOption: 'RAW',
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
