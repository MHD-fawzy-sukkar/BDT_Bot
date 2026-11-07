-- تفعيل القيود المرجعية لحذف التفرعات تلقائياً عند حذف زر أب (ON DELETE CASCADE)
PRAGMA foreign_keys = ON;

-- 1. جدول الأزرار والقوائم الشجرية (Tree Nodes)
CREATE TABLE IF NOT EXISTS menu_nodes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    parent_id INTEGER NULL,
    title TEXT NOT NULL,
    description TEXT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (parent_id) REFERENCES menu_nodes(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_menu_nodes_parent_sort
    ON menu_nodes(parent_id, sort_order, id);

-- 2. جدول محتوى الأزرار (الملفات والرسائل المرتبطة بكل زر)
-- يعتمد على copyMessage(source_chat_id, source_message_id) للتحويل الفوري بسرعة البرق حتى لملفات 2GB
-- مع الاحتفاظ بـ file_id و caption كنسخة احتياطية في حال حُذفت الرسالة الأصلية من غروب الأدمن
CREATE TABLE IF NOT EXISTS node_contents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    node_id INTEGER NOT NULL,
    content_type TEXT NOT NULL, -- 'document' | 'video' | 'audio' | 'voice' | 'photo' | 'text' | 'other'
    source_chat_id TEXT NOT NULL,
    source_message_id INTEGER NOT NULL,
    file_id TEXT NULL,
    title TEXT NOT NULL,
    caption TEXT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (node_id) REFERENCES menu_nodes(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_node_contents_node_sort
    ON node_contents(node_id, sort_order, id);

-- 3. جدول جلسات المشرفين (لتتبع العملية الحالية للمشرف داخل غروب الأدمن)
CREATE TABLE IF NOT EXISTS admin_sessions (
    user_id TEXT NOT NULL,
    chat_id TEXT NOT NULL,
    action TEXT NOT NULL DEFAULT 'IDLE', -- 'IDLE' | 'ADD_CHILD_NODE' | 'RENAME_NODE' | 'EDIT_NODE_DESC' | 'ADD_CONTENT'
    target_node_id INTEGER NULL,
    panel_message_id INTEGER NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (user_id, chat_id)
);
