# Lazaza Menu — تعليمات الرفع من Google Cloud Shell

المشروع جاهز بالكامل (Admin + Menu + Firestore فقط بدون Storage + QR Code + حماية بجلسة واحدة).

⚠️ **لا يستخدم المشروع Firebase Storage نهائيًا** — صور المنتجات واللوجو والبانر بتتضغط في المتصفح وتتخزن كـ base64 جوه Firestore مباشرة.

---

## 1) فعّل الخدمات المطلوبة في Firebase Console (مرة واحدة بس)

افتح [console.firebase.google.com](https://console.firebase.google.com) → مشروع **lazaza-menu**:

1. **Authentication** → *Sign-in method* → فعّل **Email/Password**.
2. **Authentication** → *Users* → **Add user**:
   - Email: `lazazagr99@lazaza-admin.local`
   - Password: (حط الباسورد اللي هتستخدمه لأول دخول)

   > اسم المستخدم اللي هيظهر للمستخدم في شاشة تسجيل الدخول هو الجزء قبل `@` بس (يعني `LazazaGr99` — الموقع بيحوّله تلقائيًا للإيميل ده من وراء الكواليس، مش هيشوفه المستخدم).

3. **Firestore Database** → **Create database** → **Production mode** → أي Region قريب.

---

## 2) افتح Google Cloud Shell

`https://shell.cloud.google.com`

---

## 3) ارفع ملفات المشروع

⋮ (فوق يمين الـ Terminal) → **Upload** → اختار ملف الـ ZIP، بعدين:

```bash
unzip lazaza-menu.zip -d ~/lazaza-menu
cd ~/lazaza-menu
```

---

## 4) ارفع المشروع على GitHub

```bash
git init
git branch -M main
git remote add origin https://github.com/ibrahimspektrumm-create/Lazaza-Menu.git
git add .
git commit -m "Initial commit - Lazaza Menu"
git push -u origin main
```

---

## 5) ثبّت Firebase CLI وسجّل الدخول

```bash
npm install -g firebase-tools
firebase login
firebase use lazaza-menu
```

---

## 6) ارفع القواعد والموقع

```bash
firebase deploy --only firestore:rules,hosting
```

هيديك رابط الموقع، تقريبًا:

- المنيو: `https://lazaza-menu.web.app/menu/`
- الإدارة: `https://lazaza-menu.web.app/admin/`

---

## 7) أول دخول للوحة الإدارة (مهم جدًا)

1. افتح `/admin/` وسجّل دخول باسم المستخدم `LazazaGr99` والباسورد اللي حطيته في الخطوة 1.
2. **أول مرة بس** هتظهر لك شاشة "إعداد أولي: رمز تغيير كلمة المرور" — هنا حط الرمز السري اللي هتحتاجه لاحقًا لو حبيت تغيّر الباسورد (احتفظ بيه في مكان آمن، الموقع مش هيعرضه أو يلمّح له تاني في أي مكان).
3. بعد كده كمّل الإعداد العادي: أقسام، بيانات المطعم، منتجات، QR.

---

## الأمان — إيه اللي اتعمل وإيه حدوده

- **حساب واحد بس**: عن طريق Firebase Authentication (مش نظام مبني يدويًا)، ومفيش شاشة "تسجيل حساب جديد" في الموقع خالص.
- **قفل جلسة واحدة**: أي تسجيل دخول جديد (من أي جهاز) بيسجّل خروج أي جلسة تانية مفتوحة تلقائيًا خلال ثوانٍ.
- **تغيير الباسورد** يتطلب: الباسورد الحالي + الرمز السري (المخزّن كـ hash مش نص صريح).
- **مهم**: مفيش موقع بدون سيرفر خاص (Backend) ممكن يكون "غير قابل للاختراق نهائيًا" بشكل مطلق. اللي فوق ده أفضل حماية ممكنة على البنية دي (Static Site + Firebase)، مش ضمان مطلق.

---

## تحديثات بعد كده

```bash
git add .
git commit -m "وصف التعديل"
git push
firebase deploy --only hosting
```
