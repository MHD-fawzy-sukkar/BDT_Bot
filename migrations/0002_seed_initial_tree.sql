-- البيانات الابتدائية لهيكلية البوت (قابلة للتعديل والحذف والإضافة بالكامل من غروب الأدمن)

-- المستوى الأول (الرئيسية)
INSERT INTO menu_nodes (id, parent_id, title, sort_order) VALUES
    (1, NULL, '📚 عربي', 1),
    (2, NULL, '🇬🇧 انكليزي', 2),
    (3, NULL, '🇫🇷 فرنسي', 3),
    (4, NULL, '💡 نصائح', 4);

-- تفرعات: عربي (id = 1)
INSERT INTO menu_nodes (id, parent_id, title, sort_order) VALUES
    (10, 1, 'قواعد', 1),
    (11, 1, 'بلاغة', 2),
    (12, 1, 'قراءة', 3),
    (13, 1, 'تعبير', 4);

-- تفرعات: عربي -> قراءة (id = 12)
INSERT INTO menu_nodes (id, parent_id, title, sort_order) VALUES
    (120, 12, 'واحد', 1),
    (121, 12, 'اثنين', 2),
    (122, 12, 'ثلاثة', 3);

-- تفرعات: عربي -> تعبير (id = 13)
INSERT INTO menu_nodes (id, parent_id, title, sort_order) VALUES
    (130, 13, 'وجداني', 1),
    (131, 13, 'اجتماعي', 2);

-- تفرعات: انكليزي (id = 2)
INSERT INTO menu_nodes (id, parent_id, title, sort_order) VALUES
    (20, 2, 'وحدات', 1),
    (21, 2, 'مواضيع', 2),
    (22, 2, 'قواعد', 3);

-- تفرعات: انكليزي -> وحدات (id = 20)
INSERT INTO menu_nodes (id, parent_id, title, sort_order) VALUES
    (201, 20, 'واحد', 1),
    (202, 20, 'اثنين', 2),
    (203, 20, 'ثلاثة', 3),
    (204, 20, 'أربعة', 4),
    (205, 20, 'خمسة', 5),
    (206, 20, 'ستة', 6),
    (207, 20, 'سبعة', 7),
    (208, 20, 'ثمانية', 8),
    (209, 20, 'تسعة', 9),
    (210, 20, 'عشرة', 10),
    (211, 20, 'أحد عشر', 11),
    (212, 20, 'اثنا عشر', 12);

-- تفرعات: فرنسي (id = 3)
INSERT INTO menu_nodes (id, parent_id, title, sort_order) VALUES
    (30, 3, 'قواعد', 1),
    (31, 3, 'مواضيع', 2);

-- تفرعات: نصائح (id = 4)
INSERT INTO menu_nodes (id, parent_id, title, sort_order) VALUES
    (40, 4, 'نصائح المواد', 1),
    (41, 4, 'نصائح الانقطاع', 2);

-- تفرعات: نصائح -> نصائح المواد (id = 40)
INSERT INTO menu_nodes (id, parent_id, title, sort_order) VALUES
    (401, 40, 'عربي', 1),
    (402, 40, 'انكليزي', 2),
    (403, 40, 'فرنسي', 3);

-- تفرعات: نصائح -> نصائح المواد -> عربي (id = 401)
INSERT INTO menu_nodes (id, parent_id, title, sort_order) VALUES
    (4011, 401, 'طريقة الدراسة', 1),
    (4012, 401, 'نصائح عامة', 2);

-- تفرعات: نصائح -> نصائح المواد -> عربي -> طريقة الدراسة (id = 4011)
INSERT INTO menu_nodes (id, parent_id, title, sort_order) VALUES
    (40111, 4011, 'طريقة دراسة القراءة', 1),
    (40112, 4011, 'طريقة دراسة التعبير', 2);

-- تفرعات: نصائح -> نصائح المواد -> انكليزي (id = 402)
INSERT INTO menu_nodes (id, parent_id, title, sort_order) VALUES
    (4021, 402, 'طريقة الدراسة', 1),
    (4022, 402, 'نصائح عامة', 2);

-- تفرعات: نصائح -> نصائح المواد -> فرنسي (id = 403)
INSERT INTO menu_nodes (id, parent_id, title, sort_order) VALUES
    (4031, 403, 'طريقة الدراسة', 1),
    (4032, 403, 'نصائح عامة', 2);
