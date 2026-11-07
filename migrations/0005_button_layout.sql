-- إضافة خاصية تحديد عرض الزر: 0 = طبيعي (مع زر بجانبه)، 1 = بسطر مستقل لوحده
ALTER TABLE menu_nodes ADD COLUMN is_full_width INTEGER NOT NULL DEFAULT 0;
