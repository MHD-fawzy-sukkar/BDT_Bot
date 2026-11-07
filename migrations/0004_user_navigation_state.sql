-- إضافة عمود حفظ موقع الطالب الحالي في شجرة الأزرار لدعم أزرار الكيبورد السفلية (Reply Keyboard)
ALTER TABLE bot_users ADD COLUMN current_node_id INTEGER NULL;
