# Facebook AI Auto Poster

هذا المشروع ينشئ بوت Node.js للنشر التلقائي إلى **Facebook Page** كل 10 دقائق باستخدام:

- OpenAI لتوليد نص المنشور
- Meta Graph API للنشر الرسمي
- Facebook Login لربط الحساب واختيار الصفحة

## مهم

هذا المشروع موجّه للنشر التلقائي إلى **Facebook Page** تديرها أنت. يعتمد على واجهات Meta الرسمية الخاصة بالصفحات، وليس على الملف الشخصي.

المصادر الرسمية:

- https://developers.facebook.com/docs/pages-api/posts/
- https://developers.facebook.com/docs/permissions/
- https://developers.facebook.com/docs/sharing/reference/feed-dialog
- https://platform.openai.com/docs/libraries/node-js-library
- https://platform.openai.com/docs/api-reference/responses

## 1. التثبيت

```bash
npm install
```

انسخ ملف البيئة:

```bash
copy .env.example .env
```

ثم عدل القيم التالية داخل `.env`:

- `OPENAI_API_KEY`
- `FB_APP_ID`
- `FB_APP_SECRET`
- `CONTENT_BRIEF`

اختياري:

- `BASE_URL` إذا أردت تحديد الدومين يدويًا
- `STATE_DIR` لتحديد مسار ملف الحالة
- `FB_PAGE_ID` إذا أردت تثبيت صفحة معيّنة تلقائيًا
- `POST_INTERVAL_MINUTES` لتغيير كل كم دقيقة يتم النشر

## 2. تشغيل البوت

```bash
npm start
```

ثم افتح:

```text
http://localhost:3000
```

## 3. ربط فيسبوك

من الصفحة الرئيسية:

1. اضغط `ربط حساب فيسبوك واختيار صفحة`
2. سجل الدخول عبر Facebook Login
3. امنح الصلاحيات المطلوبة
4. اختر الصفحة التي تريد النشر عليها

## 4. تجربة النشر

يمكنك تشغيل منشور فوري من:

```text
http://localhost:3000/run-once
```

## 5. الصلاحيات المستخدمة

المشروع يطلب صلاحيات مرتبطة بإدارة الصفحة والنشر عليها، وأهمها:

- `pages_manage_posts`
- `pages_read_engagement`
- `pages_show_list`

## 6. ملاحظات عملية

- التوكنات تُحفظ محليًا داخل `data/state.json`
- لا تضع هذا الملف في Git
- إذا انتهت صلاحية الربط، أعد تسجيل الدخول من `/auth/facebook/start`
- عدل `CONTENT_BRIEF` ليصبح المحتوى مناسبًا لمجالك بدل المنشورات العامة

## 7. النشر على GitHub

إذا لم يكن المشروع داخل Git بعد:

```bash
git init
git add .
git commit -m "Initial Facebook page auto poster"
```

ثم أنشئ مستودعًا جديدًا على GitHub وأضف الـ remote:

```bash
git remote add origin YOUR_GITHUB_REPO_URL
git branch -M main
git push -u origin main
```

## 8. النشر على Railway

1. ارفع المشروع إلى GitHub
2. في Railway اختر `New Project` ثم `Deploy from GitHub Repo`
3. أضف متغيرات البيئة:
   - `OPENAI_API_KEY`
   - `FB_APP_ID`
   - `FB_APP_SECRET`
   - `FB_PAGE_ID` اختياري
   - `CONTENT_BRIEF`
   - `POST_INTERVAL_MINUTES`
   - `TIMEZONE`
4. أضف Volume في Railway إذا أردت الاحتفاظ بالتوكنات والحالة بعد إعادة التشغيل
5. اضبط `STATE_DIR=/data` إذا كان الـ Volume مركبًا على `/data`
6. بعد أن يعطيك Railway الدومين العام:
   - إما اترك التطبيق يستخدم `RAILWAY_PUBLIC_DOMAIN` تلقائيًا
   - أو ضع `BASE_URL=https://your-app.up.railway.app`
7. أضف رابط callback نفسه في إعدادات تطبيق Meta:
   - `https://your-domain/auth/facebook/callback`
8. بعد النشر افتح:
   - `/health` للفحص
   - `/status` لمراجعة الحالة
   - الصفحة الرئيسية لربط فيسبوك واختيار الصفحة
