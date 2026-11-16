# تقرير تنفيذ الدفعة الأولى — مزرعتي: رحلة الازدهار

## 1. ما نُفذ فعليًا
- **هيكل التطبيق وفصل المسؤوليات**:
  - فصل تعريفات المحتوى والأسعار والأزمنة في `src/content/crops.ts`.
  - فصل منطق اللعبة والاقتصاد والتوقيت ومنحة الإنقاذ وحساب المستوى والهدف التمهيدي في `src/game/rules.ts` و`src/game/types.ts`.
  - فصل خدمات Firebase ومنطق المزامنة والتعارض في `src/firebase/config.ts` و`src/firebase/farmRepository.ts` و`src/firebase/syncLogic.ts` و`src/firebase/errors.ts`.
  - بناء مشهد ثلاثي الأبعاد Low-Poly بـ Three.js + React Three Fiber + Drei في `src/scene/*` يشمل 6 قطع أرض، وبئرًا ومستودعًا مركّبين من أجزاء متعددة، وسياجًا وأشجارًا، وخامات إجرائية عبر `CanvasTexture`، وإضاءة شمسية دافئة مع `RoomEnvironment`، ومؤثرات جزيئية مجمعة، ومعالجة تعذر WebGL، ومسارًا مكيّفًا لبيئات Software WebGL.
  - بناء واجهة عربية **RTL** متجاوبة للحاسوب والهاتف في `src/components/*` تشمل شاشة البداية، وشريط العملات والمستوى وحالة الحفظ، وبطاقة الهدف التمهيدي «احصد 3 محاصيل»، وشريط الأدوات (القمح، الجزر، الري، الحصاد)، ومتجر البذور، والمستودع والبيع، وفاحص القطعة، ونوافذ التأكيد والتعارض.
  - إضافة مؤثرات صوتية إجرائية عبر Web Audio API (`src/audio/soundEffects.ts`) مع زر كتم.

## 2. مشروع Firebase المرتبط والخدمات المفعّلة
- **معرّف مشروع Firebase**: `gen-lang-client-0649108111`
- **معرّف تطبيق الويب**: `1:319684456176:web:e042ad7a88c2b609d35c35`
- **قاعدة بيانات Cloud Firestore**: `ai-studio-32015be8-a6d3-4152-a95f-245607f25a20`
- **المصادقة**: Firebase Authentication (Google Sign-In via `signInWithPopup`).
- **الأمان**: تم كتابة قواعد Firestore في `firestore.rules` (تقييد كل مستخدم بمسار `/farms/{uid}` مع التحقق من `email_verified` والأنواع والحدود غير السالبة والترتيب الموضعي لقطع الأرض وتسلسل `revision` ونافذة زمن الخادم `request.time ± 5m` المتوافقة مع معاملات Firestore Enterprise Edition)، وتم فحصها عبر ESLint (`@firebase/eslint-plugin-security-rules`) ونشرها فعليًا إلى المشروع عبر `fax.DeployRules`.

## 3. نتائج البناء والاختبارات الفعلية (بعد آخر تعديل)
### أ. الاختبارات الآلية (`node:test` via `tsx`)
- `src/game/rules.test.ts`: **9/9 اختبارات ناجحة** تغطي:
  - القيم الابتدائية (200 عملة، 6 قطع، 5 قمح، 3 جزر).
  - منع الشراء دون رصيد أو بكميات غير صالحة.
  - منع الزراعة دون بذور أو فوق قطعة مشغولة.
  - عدم نمو المحصول قبل الري وعدم تغيير توقيت النضج عند تكرار الري.
  - منع الحصاد المبكر أو المكرر، واستمرار النمو من الطابع الزمني بعد إعادة التحميل.
  - صحة المخزون والعملات بعد البيع دون إضافة خبرة.
  - اشتقاق المستوى (مستوى لكل 100 خبرة).
  - منحة الإنقاذ (3 بذور قمح مرة واحدة عند تحقق الشروط).
  - إعادة ضبط المزرعة وتقدم الهدف التمهيدي.
- `src/firebase/syncLogic.test.ts`: **6/6 اختبارات ناجحة** تغطي:
  - عدم استبدال حفظ سحابي موجود بالحالة الابتدائية.
  - إنشاء المزرعة الأولى فقط عند عدم وجود وثيقة سابقة.
  - استعادة التعديلات المحلية المعلقة عند تطابق `baseRevision`.
  - رصد تعارض المراجعات (`revision`) دون دمج آلي للأرصدة والمخزون.
  - التحقق الذري من المراجعة، والتسلسل/إلغاء التسلسل للبيانات.

### ب. البناء وفحص الأنواع وقواعد الأمان
- `npm run lint` (`tsc --noEmit`): ناجح بدون أخطاء.
- `npm run build` (`vite build`): ناجح بدون أخطاء.
- `npx eslint firestore.rules`: ناجح بدون تحذيرات أو أخطاء.

### ج. الفحص التفاعلي في المتصفح (Chromium عبر Playwright)
- فحص شاشة البداية (`1440x900`) والمشهد ثلاثي الأبعاد: لا أخطاء console، ظهور عنوان «مزرعتي — رحلة الازدهار» وزر تسجيل الدخول بحساب Google.
- فحص اللعب التفاعلي (`?autostart=1` في وضع المعاينة المحلي) على سطح المكتب (`1440x900`) والهاتف (`390x844`):
  - النقر على قطعة الأرض يزرع القمح ويُظهر البذور ومؤشر الري ويحدّث فاحص القطعة.
  - الري يغيّر لون التربة للداكن ويبدأ عداد الـ 30 ثانية.
  - سحب الكاميرا بالماوس يدور المشهد دون تنفيذ زراعة أو حصاد بالخطأ.
  - الشراء من متجر البذور يخصم العملات ويزيد مخزون البذور.

## 4. ما لم يتمكن من اختباره محليًا والقيود المتبقية
- **تسجيل الدخول التفاعلي بحساب Google الفعلي واختبار Firestore الحي من داخل الحاوية الآلية**: يتطلب نافذة OAuth تفاعلية من المستخدم (`signInWithPopup`)؛ لذا يظل اختبار الاسترجاع الحي بين تسجيل الخروج والدخول وتعارض جلستين حيتين بحاجة لتجربة يدوية بحساب Google في المتصفح الفعلي.
- **محاكي قواعد Firestore المحلي (Firestore Emulator)**: لم يتوفر Java JRE داخل بيئة الحاوية لتشغيل المحاكي محليًا؛ لذا جرى التحقق من `firestore.rules` عبر `@firebase/eslint-plugin-security-rules` ونشرها فعليًا إلى Firestore.

## 5. الملفات الأساسية للمراجعة
- `src/content/crops.ts`
- `src/game/types.ts`، `src/game/rules.ts`، `src/game/rules.test.ts`
- `src/firebase/config.ts`، `src/firebase/farmRepository.ts`، `src/firebase/syncLogic.ts`، `src/firebase/syncLogic.test.ts`، `src/firebase/errors.ts`
- `firestore.rules`، `firebase-blueprint.json`، `docs/security_spec.md`
- `src/scene/FarmCanvas.tsx`، `src/scene/FarmEnvironment.tsx`، `src/scene/FarmStructures.tsx`، `src/scene/PlotMesh.tsx`، `src/scene/FarmEffects.tsx`، `src/scene/materials.ts`
- `src/hooks/useFarmGame.ts`، `src/App.tsx`
- `src/components/*`
