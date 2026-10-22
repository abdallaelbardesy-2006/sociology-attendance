# 🎓 نظام تسجيل الحضور والغياب الذكي بـ QR Code (PWA)
## قسم علم الاجتماع - كلية الآداب - جامعة عين شمس (اللائحة الجديدة)

تطبيق ويب متكامل (Web App + Progressive Web App) لتسجيل الطلاب، واستخراج كارنيه الحضور الرقمي بكود QR، ولوحة تحكم ذكية للأدمن والدكاترة مزودة بكاميرا سكانر سريعة مع فحص عدم التكرار، وتعديل بيانات الطلاب، وحساب نسب الحضور والغياب لكل طالب ومادة وترم وعام دراسي، ونظام ترقية الفرق الدراسية.

قاعدة البيانات: **Google Sheets (جوجل شيت)** مربوطة مباشرة عبر Google Sheets API v4.
الاستضافة والنشر: **Vercel** + مستودع **GitHub**.

---

## 📁 هيكل ملفات المشروع

```text
├── api/
│   ├── _sheets.js          # محرك الاتصال بـ Google Sheets API وتهيئة الأوراق تلقائياً
│   ├── auth.js             # فحص دخول المشرفين بالمفتاح السري وشيت Admins
│   ├── students.js         # تسجيل طالب جديد، جلب وتصفية الطلاب، وتعديل البيانات
│   ├── attendance.js       # تسجيل الحضور بالكاميرا ومنع التكرار وفحص اللائحة
│   ├── analytics.js        # حساب نسب الحضور والغياب للطلاب والمواد والترم والسنة
│   ├── promote.js          # ترقية الطلاب للفرقة التالية نهاية العام الدراسي
│   └── setup.js            # فحص اتصال الشيت والأوراق
├── public/
│   ├── index.html          # واجهة الطلاب واستخراج كارنيه الكلية الرقمي
│   ├── admin.html          # تطبيق لوحة التحكم والسكانر والإحصائيات (PWA)
│   ├── manifest.json       # ملف تعريف التطبيق للـ PWA والتثبيت على الجوال
│   ├── sw.js               # Service Worker للعمل دون انقطاع وتخزين الكاش
│   └── icons/              # أيقونات التطبيق بدقة 192px و 512px
├── vercel.json             # إعدادات التوجيه والـ Rewrites على Vercel
├── package.json            # الاعتماديات (googleapis, google-auth-library)
├── .env.example            # نموذج متغيرات البيئة السرية
└── README.md
```

---

## 🛠️ الخطوة 1: تجهيز ملف جوجل شيت و Google Service Account

1. افتح **[Google Sheets](https://sheets.new)** وأنشئ ملفاً جديداً باسم:
   `Sociology_Attendance_System`
   *(انسخ معرّف الشيت من شريط العنوان في المتصفح، وهو الجزء بين `/d/` و `/edit`)*.

2. اذهب إلى **[Google Cloud Console](https://console.cloud.google.com)**:
   - أنشئ مشروعاً جديداً.
   - من قائمة **APIs & Services** ⬅️ **Library**، ابحث عن **Google Sheets API** واضغط **Enable**.
   - من تبويب **Credentials** اضغط **Create Credentials** ⬅️ **Service Account**.
   - بعد إنشائه، ادخل على تفاصيله، وافتح تبويب **Keys** واضغط **Add Key** ⬅️ **Create new key (JSON)**.
   - سيتم تنزيل ملف JSON على جهازك يحتوي على:
     * `client_email`
     * `private_key`

3. **مشاركة الشيت**: افتح ملف جوجل شيت الخاص بك، واضغط على زر **Share (مشاركة)** بالأعلى، والصق إيميل الـ `client_email` وامنحه صلاحية **Editor (محرر)**.

> 💡 **ملاحظة ذكية**: عند أول تشغيل لأي عملية، سيقوم السيرفر تلقائياً بإنشاء وتنسيق الأوراق الثلاث (`Students`، `Admins`، `Attendance`) مع كافة العناوين المطلوبة دون أي مجهود منك!

---

## 🐙 الخطوة 2: رفع المشروع على GitHub

افتح موجه الأوامر في مجلد المشروع ونفذ:

```bash
git init
git add .
git commit -m "feat: complete sociology attendance PWA system"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/sociology-attendance.git
git push -u origin main
```

---

## ⚡ الخطوة 3: النشر على Vercel وضبط متغيرات البيئة

1. افتح موقع **[Vercel](https://vercel.com)** وسجل الدخول بحسابك في GitHub.
2. اضغط **Add New...** ⬅️ **Project**، واختر المستودع `sociology-attendance`.
3. قبل الضغط على Deploy، افتح قسم **Environment Variables** وأضف المتغيرات التالية:

| اسم المتغير (Key) | القيمة (Value) |
|---|---|
| `GOOGLE_SHEET_ID` | معرّف ملف جوجل شيت الخاص بك |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | الـ `client_email` من ملف JSON |
| `GOOGLE_PRIVATE_KEY` | الـ `private_key` كاملاً من ملف JSON (بما في ذلك `-----BEGIN PRIVATE KEY-----`) |
| `ADMIN_SECRET_KEY` | مفتاح سري من اختيارك للدخول للوحة (مثال: `SOC_ADMIN_2026_SECRET`) |

4. اضغط زر **Deploy**، وفي خلال 30 ثانية سيكون موقعك مباشراً على الإنترنت!

---

## 📱 الروابط وتثبيت الـ PWA

- **رابط الطلاب**:
  `https://your-app.vercel.app/`
  (تسجيل الطالب ⬅️ الحصول على كارنيه رقمي به الـ QR ⬅️ زر لحفظه كصورة PNG بجهازه).

- **رابط لوحة التحكم والسكانر (PWA)**:
  `https://your-app.vercel.app/admin`
  - يمكن فتح الرابط من أي هاتف (أندرويد أو آيفون) أو تابلت.
  - اضغط على خيارات المتصفح (ثلاث نقاط في كروم أو زر المشاركة في سفاري) واختر:
    **"Add to Home screen" / "تثبيت التطبيق"**.
  - سينزل التطبيق كأيقونة مستقلة تفتح بملء الشاشة مع وصول فوري للكاميرا والصوت!
