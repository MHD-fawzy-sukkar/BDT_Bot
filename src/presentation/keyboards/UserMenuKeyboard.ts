import { InlineKeyboard, Keyboard } from "grammy";
import { MenuViewData } from "../../application/services/MenuNavigationService";
import { MenuNodeWithCounts } from "../../domain/entities/MenuNode";

export const BACK_BUTTON_TEXT = "↩️ رجوع";
export const HOME_BUTTON_TEXT = "🏠 الرئيسية";

/**
 * يرتب الأزرار المدمجة (تُستخدم للوحة المشرفين داخل غروب الأدمن)
 * يحترم خيار المشرف: إما بسطر لحاله (isFullWidth) أو طبيعي (زرين في كل سطر)
 */
export function appendCleanButtonsGrid(
  keyboard: InlineKeyboard,
  children: MenuNodeWithCounts[],
  prefix: string
): void {
  let currentRowCount = 0;

  for (const child of children) {
    const label = child.title.trim();

    if (child.isFullWidth) {
      if (currentRowCount > 0) {
        keyboard.row();
        currentRowCount = 0;
      }
      keyboard.text(label, `${prefix}:${child.id}`).row();
    } else {
      keyboard.text(label, `${prefix}:${child.id}`);
      currentRowCount++;
      if (currentRowCount === 2) {
        keyboard.row();
        currentRowCount = 0;
      }
    }
  }

  if (currentRowCount > 0) {
    keyboard.row();
  }
}

/**
 * يبني كيبورد الأزرار السفلي الفعلي (Reply Keyboard) للطلاب في المحادثة الخاصة
 * يحترم خيار المشرف لكل زر: إما بسطر لحاله (isFullWidth) أو طبيعي (زرين في كل سطر)
 */
export function buildUserReplyKeyboard(view: MenuViewData): Keyboard {
  const keyboard = new Keyboard();
  let currentRowCount = 0;

  for (const child of view.children) {
    const label = child.title.trim();

    if (child.isFullWidth) {
      if (currentRowCount > 0) {
        keyboard.row();
        currentRowCount = 0;
      }
      keyboard.text(label).row();
    } else {
      keyboard.text(label);
      currentRowCount++;
      if (currentRowCount === 2) {
        keyboard.row();
        currentRowCount = 0;
      }
    }
  }

  if (currentRowCount > 0) {
    keyboard.row();
  }

  // صف أزرار الرجوع والرئيسية في أسفل الكيبورد عند الدخول لأي قسم فرعي
  if (view.currentNode !== null) {
    keyboard.text(BACK_BUTTON_TEXT).text(HOME_BUTTON_TEXT).row();
  }

  return keyboard.resized();
}

/**
 * رسالة مختصرة وخفيفة جداً عند التنقل بين الأقسام
 */
export function formatUserMenuText(view: MenuViewData): string {
  if (view.currentNode === null) {
    return "🏠 أنت في القائمة الرئيسية";
  }

  if (view.currentNode.description) {
    return escapeHtml(view.currentNode.description);
  }

  return `اختر من القائمة ⬇️`;
}

export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
