

# خطة إنشاء الجداول في مشروع Supabase الجديد

## المشكلة
المشروع الجديد فارغ بالكامل — لا توجد جداول أو functions أو triggers. كل استدعاءات Supabase في الكود تفشل لأن الجداول غير موجودة.

## الحل
تشغيل migration واحد كبير يحتوي على كل شيء:

### ما سيتم إنشاؤه:

**22 جدول:**
offices, profiles, companies, order_statuses, products, user_roles, activity_logs, orders, order_notes, advances, courier_bonuses, delivery_prices, office_payments, user_permissions, diaries, diary_orders, expenses, cash_flow_entries, app_settings, courier_locations, messages, courier_collections, office_daily_closings, company_payments

**الـ Functions:**
- `has_role` — فحص صلاحية المستخدم
- `is_owner_or_admin` — فحص owner/admin
- `handle_new_user` — إنشاء profile تلقائياً عند التسجيل
- `generate_barcode` — باركود تلقائي
- `generate_diary_number` — رقم الدفتر تلقائي
- `auto_create_diary_for_order` — ربط الأوردر بالدفتر
- `log_activity` — تسجيل الحركات
- `cleanup_old_activity_logs` / `cleanup_old_diaries`
- `nextval_barcode`

**Triggers:**
- `on_auth_user_created` — profile تلقائي
- `set_barcode_on_insert` — باركود تلقائي
- `set_diary_number` — رقم دفتر تلقائي
- `auto_diary_on_order_insert` — دفتر تلقائي

**RLS Policies:** كل الصلاحيات الموجودة

**البيانات الافتراضية:** 11 حالة أوردر ثابتة

### بعد الـ Migration:
- نشر الـ Edge Function `auth-login` (تلقائي)
- إنشاء أول مستخدم Owner عن طريق صفحة الدخول

### التفاصيل التقنية:
- يتم استخدام الملف الموحد `20260312041955` كأساس مع إضافة جدول `company_payments`
- الـ migration الأخير (`20260312043139`) يتم تجاهله لأنه يعدل `auth.users` وهو خاص بالبيانات القديمة
- Enum `app_role` يُنشأ أولاً قبل كل شيء

