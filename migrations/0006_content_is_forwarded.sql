-- إضافة عمود تحديد ما إذا كانت الرسالة محولة تحويل (ليتم إرسالها للطلاب كـ forward مع الاسم الأصلي)
ALTER TABLE node_contents ADD COLUMN is_forwarded INTEGER NOT NULL DEFAULT 0;

-- تحديث الرسائل الحالية التي تم تحويلها من القناة لتظهر محولة باسم القناة
UPDATE node_contents SET is_forwarded = 1;
