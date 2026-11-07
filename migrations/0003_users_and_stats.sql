-- 1. جدول المشتركين والطلاب (لتتبع الإحصائيات وإرسال الإذاعات Broadcast)
CREATE TABLE IF NOT EXISTS bot_users (
    user_id TEXT PRIMARY KEY,
    username TEXT NULL,
    first_name TEXT NULL,
    is_active INTEGER NOT NULL DEFAULT 1, -- 1 = فعال، 0 = قام بحظر البوت
    joined_at TEXT NOT NULL DEFAULT (datetime('now')),
    last_active_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_bot_users_active
    ON bot_users(is_active);

-- 2. إضافة عداد المشاهدات (views_count) لجدول الأزرار لمعرفة الأقسام الأكثر استخداماً
ALTER TABLE menu_nodes ADD COLUMN views_count INTEGER NOT NULL DEFAULT 0;
