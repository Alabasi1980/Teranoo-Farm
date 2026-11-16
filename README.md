# مزرعتي — رحلة الازدهار (الدفعة الأولى)

لعبة متصفح ثلاثية الأبعاد بواجهة عربية **RTL** مبنية بـ **React + TypeScript + Vite** و**Three.js (React Three Fiber & Drei)**، مع تسجيل دخول بحساب **Google** وحفظ سحابي معزول لكل مستخدم عبر **Cloud Firestore**.

## المتطلبات التقنية
- Node.js 20+
- حساب Firebase مرتبط (تم إعداد المشروع `gen-lang-client-0649108111` وقاعدة بيانات Firestore `ai-studio-32015be8-a6d3-4152-a95f-245607f25a20`).

## التثبيت والتشغيل المحلي
```bash
npm install
npm run dev
```
يفتح التطبيق على المنفذ `3000` (`http://localhost:3000`).

## الفحص والبناء والاختبارات
```bash
# فحص الأنواع (TypeScript)
npm run lint

# تشغيل اختبارات المنطق والتوقيت والمزامنة
npx --yes tsx --test src/game/rules.test.ts src/firebase/syncLogic.test.ts

# فحص قواعد أمان Firestore عبر ESLint
npx eslint firestore.rules

# بناء نسخة الإنتاج
npm run build
```

## إعداد Firebase
1. إعدادات تطبيق الويب غير السرية موجودة في `firebase-applet-config.json` (وموثقة كمتغيرات نموذجية في `.env.example`).
2. قواعد الأمان في `firestore.rules` تحصر القراءة والكتابة لكل مستخدم في مسار `/farms/{uid}` فقط، وتتحقق من الأنواع والحدود غير السالبة ومن تسلسل `revision` و`request.time`.
3. مزود تسجيل الدخول المفعّل هو **Google Sign-In** عبر `signInWithPopup`.
4. لمعاينة الواجهة والمشهد محليًا أثناء التطوير بدون تسجيل دخول (بوضع معاينة محلي صريح لا يدّعي الحفظ السحابي)، يمكن تمرير `?autostart=1` في الرابط.
