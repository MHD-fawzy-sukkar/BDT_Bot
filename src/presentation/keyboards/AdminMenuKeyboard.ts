import { InlineKeyboard } from "grammy";
import { MenuViewData } from "../../application/services/MenuNavigationService";
import { BotStatistics } from "../../domain/entities/BotUser";
import { MenuNodeWithCounts } from "../../domain/entities/MenuNode";
import { NodeContent } from "../../domain/entities/NodeContent";
import { appendCleanButtonsGrid, escapeHtml } from "./UserMenuKeyboard";

export function buildAdminMenuKeyboard(view: MenuViewData): InlineKeyboard {
  const keyboard = new InlineKeyboard();

  // 1. عرض الأزرار بنفس الشكل تماماً كما تظهر للمستخدم العادي
  appendCleanButtonsGrid(keyboard, view.children, "a:nav");

  const nodeTarget =
    view.currentNode !== null ? String(view.currentNode.id) : "root";

  // 2. أزرار التعديل والإضافة المبسطة تحت القائمة مباشرة
  if (view.currentNode === null) {
    if (view.children.length >= 2) {
      keyboard
        .text("➕ إضافة زر جديد", `a:add_btn:root:0`)
        .text("↕️ ترتيب الأزرار", `a:ro_menu:root`)
        .row();
    } else {
      keyboard.text("➕ إضافة زر جديد", `a:add_btn:root:0`).row();
    }
  } else {
    const id = view.currentNode.id;
    const widthToggleLabel = view.currentNode.isFullWidth
      ? "🔲 جعله مع زر جنبه"
      : "↔️ جعله بسطر لحاله";

    keyboard
      .text("📎 إضافة ملفات أو رسائل", `a:add_cnt:${id}`)
      .text(`📂 الملفات الموجودة (${view.contents.length})`, `a:list_cnt:${id}`)
      .row();

    keyboard
      .text("➕ إضافة زر بداخل هذا القسم", `a:add_btn:${nodeTarget}:0`)
      .text("✏️ تغيير اسم الزر", `a:ren:${id}`)
      .row();

    keyboard.text(widthToggleLabel, `a:width:${id}`);

    if (view.children.length >= 2) {
      keyboard.text("↕️ ترتيب الأزرار", `a:ro_menu:${nodeTarget}`).row();
      keyboard.text("🗑️ حذف هذا الزر", `a:del_ask:${id}`).row();
    } else {
      keyboard.text("🗑️ حذف هذا الزر", `a:del_ask:${id}`).row();
    }

    const parentCallback =
      view.currentNode.parentId !== null
        ? `a:nav:${view.currentNode.parentId}`
        : "a:root";

    keyboard
      .text("🔙 رجوع خطوة", parentCallback)
      .text("🏠 القائمة الرئيسية", "a:root")
      .row();
  }

  return keyboard;
}

export function formatAdminMenuText(view: MenuViewData): string {
  if (view.currentNode === null) {
    return (
      "⚙️ <b>تعديل أزرار وملفات البوت</b>\n\n" +
      "اضغط على أي زر للدخول إليه وإضافة ملفات أو تعديله 👇"
    );
  }

  const cleanPath = view.breadcrumbs.map((b) => b.title).join(" ⬅️ ");
  const layoutText = view.currentNode.isFullWidth
    ? "بسطر لحاله"
    : "طبيعي (مع زر جنبه)";

  const lines: string[] = [
    `📍 <b>القسم الحالي:</b> ${escapeHtml(cleanPath)}`,
    `📐 <b>موضع الزر:</b> ${layoutText} | 📎 <b>الملفات:</b> ${view.contents.length}`,
  ];

  if (view.children.length > 0) {
    lines.push("\nاضغط على أي زر بالأسفل للدخول إليه أو استخدم أزرار التعديل 👇");
  } else if (view.contents.length === 0) {
    lines.push(
      "\n💡 <i>هذا الزر فارغ حالياً. اضغط «📎 إضافة ملفات أو رسائل» لرفع المحتوى فيه، أو «➕ إضافة زر» لعمل أقسام فرعية بداخله.</i>"
    );
  }

  return lines.join("\n");
}

/**
 * كيبورد إضافة زر جديد مع اختيار موضعه بضغطة واحدة (طبيعي مع زر جنبه أو بسطر لحاله)
 */
export function buildAddButtonKeyboard(
  targetNodeId: number | null,
  isFullWidth: boolean
): InlineKeyboard {
  const rawTarget = targetNodeId !== null ? String(targetNodeId) : "root";
  const backTarget = targetNodeId !== null ? `a:nav:${targetNodeId}` : "a:root";

  const normalLabel = isFullWidth
    ? "⚪ طبيعي (مع زر جنبه)"
    : "✅ طبيعي (مع زر جنبه)";
  const fullLabel = isFullWidth
    ? "✅ بسطر لحاله"
    : "⚪ بسطر لحاله";

  return new InlineKeyboard()
    .text(normalLabel, `a:add_btn:${rawTarget}:0`)
    .text(fullLabel, `a:add_btn:${rawTarget}:1`)
    .row()
    .text("❌ إلغاء والرجوع", `a:cancel:${backTarget}`);
}

/**
 * لوحة ترتيب الأزرار بشكل بسيط
 */
export function buildReorderChildrenKeyboard(
  parentId: number | null,
  children: MenuNodeWithCounts[]
): InlineKeyboard {
  const keyboard = new InlineKeyboard();

  children.forEach((child, idx) => {
    const shortTitle =
      child.title.length > 20 ? `${child.title.slice(0, 20)}...` : child.title;

    keyboard.text(`${idx + 1}. ${shortTitle}`, `a:nav:${child.id}`);

    if (idx > 0) {
      keyboard.text("⬆️", `a:ro_up:${child.id}`);
    } else {
      keyboard.text("▫️", "a:noop");
    }

    if (idx < children.length - 1) {
      keyboard.text("⬇️", `a:ro_down:${child.id}`);
    } else {
      keyboard.text("▫️", "a:noop");
    }

    keyboard
      .text(child.isFullWidth ? "↔️ سطر كامل" : "🔲 نص سطر", `a:ro_width:${child.id}`)
      .row();
  });

  const backCallback = parentId !== null ? `a:nav:${parentId}` : "a:root";
  keyboard.text("✅ حفظ الترتيب والرجوع", backCallback).row();

  return keyboard;
}

/**
 * لوحة عرض وحذف وترتيب الملفات الموجودة داخل الزر
 */
export function buildAdminContentListKeyboard(
  nodeId: number,
  contents: NodeContent[]
): InlineKeyboard {
  const keyboard = new InlineKeyboard();

  for (let i = 0; i < contents.length; i++) {
    const item = contents[i];
    const icon = getContentTypeIcon(item.contentType);
    const shortTitle =
      item.title.length > 20 ? `${item.title.slice(0, 20)}...` : item.title;

    keyboard.text(`${i + 1}. ${icon} ${shortTitle}`, `a:prev_item:${item.id}`);

    if (contents.length > 1) {
      if (i > 0) {
        keyboard.text("⬆️", `a:cnt_up:${item.id}`);
      }
      if (i < contents.length - 1) {
        keyboard.text("⬇️", `a:cnt_down:${item.id}`);
      }
    }

    keyboard.text("🗑️ حذف", `a:del_cnt:${item.id}`).row();
  }

  keyboard.text("📎 إضافة ملفات أو رسائل جديدة", `a:add_cnt:${nodeId}`).row();

  if (contents.length > 1) {
    keyboard.text("🗑️ حذف كل الملفات دفعة واحدة", `a:clr_cnt_ask:${nodeId}`).row();
  }

  keyboard.text("🔙 رجوع للزر", `a:nav:${nodeId}`).row();
  return keyboard;
}

/**
 * لوحة معاينة وتأكيد الإذاعة بعد الرد على رسالة البوت
 */
export function buildBroadcastPreviewKeyboard(
  sourceMessageId: number,
  previewMessageId: number,
  activeUsersCount: number
): InlineKeyboard {
  return new InlineKeyboard()
    .text(
      `✅ نعم، أرسلها للجميع الآن (${activeUsersCount})`,
      `a:bc_go:${sourceMessageId}:${previewMessageId}:0`
    )
    .row()
    .text("✏️ تعديل الرسالة", `a:bc_edit:${previewMessageId}`)
    .text("🗑️ إلغاء وحذف", `a:bc_del:${previewMessageId}`)
    .row();
}

export function buildBroadcastContinueKeyboard(
  sourceMessageId: number,
  nextOffset: number,
  totalUsers: number
): InlineKeyboard {
  return new InlineKeyboard().text(
    `▶️ إرسال للدفعة التالية (${nextOffset} من ${totalUsers})`,
    `a:bc_go:${sourceMessageId}:0:${nextOffset}`
  );
}

export function formatBotStatisticsText(stats: BotStatistics): string {
  const lines: string[] = [
    "📊 <b>إحصائيات البوت</b>",
    "",
    `👥 <b>عدد الطلاب الكلي:</b> ${stats.totalUsers}`,
    `✅ <b>الطلاب المتاحون حالياً:</b> ${stats.activeUsers}`,
    `🕒 <b>دخلوا البوت آخر 24 ساعة:</b> ${stats.activeLast24h}`,
    `🚫 <b>أوقفوا البوت:</b> ${stats.blockedUsers}`,
    "",
    `📁 <b>عدد الأزرار في البوت:</b> ${stats.totalNodes}`,
    `📎 <b>عدد الملفات والرسائل المرفوعة:</b> ${stats.totalContents}`,
    "",
    "🔥 <b>أكثر الأقسام التي يفتحها الطلاب:</b>",
  ];

  if (stats.topNodes.length === 0) {
    lines.push("• <i>لا توجد زيارات مسجلة بعد.</i>");
  } else {
    stats.topNodes.forEach((node, index) => {
      lines.push(
        `${index + 1}. <b>${escapeHtml(node.title)}</b> (${
          node.viewsCount
        } مرة)`
      );
    });
  }

  return lines.join("\n");
}

export function buildStatsKeyboard(): InlineKeyboard {
  return new InlineKeyboard().text("🔄 تحديث الأرقام", "a:stats");
}

export function buildTreeOverviewKeyboard(): InlineKeyboard {
  return new InlineKeyboard().text("🔄 تحديث الهيكلية", "a:tree");
}

export function buildDeleteNodeConfirmKeyboard(nodeId: number): InlineKeyboard {
  return new InlineKeyboard()
    .text("🗑️ نعم، احذفه", `a:del_yes:${nodeId}`)
    .text("🔙 لا، تراجع", `a:nav:${nodeId}`);
}

export function buildClearContentsConfirmKeyboard(
  nodeId: number
): InlineKeyboard {
  return new InlineKeyboard()
    .text("🗑️ نعم، احذف كل الملفات", `a:clr_cnt_yes:${nodeId}`)
    .text("🔙 لا، تراجع", `a:list_cnt:${nodeId}`);
}

export function buildCancelSessionKeyboard(
  targetNodeId: number | null,
  isUploadMode = false
): InlineKeyboard {
  const backTarget = targetNodeId !== null ? `a:nav:${targetNodeId}` : "a:root";
  const label = isUploadMode
    ? "✅ تم، انتهيت من الإضافة"
    : "❌ إلغاء والرجوع";

  return new InlineKeyboard().text(label, `a:cancel:${backTarget}`);
}

export function getContentTypeIcon(type: string): string {
  switch (type) {
    case "document":
      return "📄";
    case "video":
      return "🎬";
    case "audio":
      return "🎵";
    case "voice":
      return "🎙️";
    case "photo":
      return "🖼️";
    case "text":
      return "💬";
    default:
      return "📎";
  }
}
