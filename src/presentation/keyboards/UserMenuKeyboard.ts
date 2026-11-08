import { InlineKeyboard, Keyboard } from "grammy";
import { MenuViewData } from "../../application/services/MenuNavigationService";
import { MenuNodeWithCounts } from "../../domain/entities/MenuNode";

export const BACK_BUTTON_TEXT = "↩️ رجوع";
export const HOME_BUTTON_TEXT = "🏠 الرئيسية";
export const GENERAL_FILES_BUTTON_PREFIX = "📄 ملفات هذا القسم";

/**
 * Arranges inline buttons for the admin panel in the admin group.
 * Honors the full-width (single column) or standard (2 columns) setting.
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
 * Builds the user reply keyboard for private student chat navigation.
 * Respects full-width and 2-column layout preferences.
 */
export function buildUserReplyKeyboard(view: MenuViewData): Keyboard {
  const keyboard = new Keyboard();

  // If a folder has children and also non-text files (documents, videos, etc.),
  // add a dedicated button for general files so files are not dumped forcibly.
  // Pure text notes/messages are rendered directly in the prompt text.
  const nonTextContents = view.contents.filter((c) => c.contentType !== "text");
  if (
    view.currentNode !== null &&
    nonTextContents.length > 0 &&
    view.children.length > 0
  ) {
    keyboard
      .text(`${GENERAL_FILES_BUTTON_PREFIX} (${nonTextContents.length})`)
      .row();
  }

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

  // Add Back and Home navigation buttons when inside any sub-menu
  if (view.currentNode !== null) {
    keyboard.text(BACK_BUTTON_TEXT).text(HOME_BUTTON_TEXT).row();
  }

  return keyboard.placeholder("اختر من القائمة بالأسفل ⬇️").resized();
}

/**
 * Formats the menu prompt text for students.
 * Displays any custom button message/note above the menu selection prompt.
 */
export function formatUserMenuText(view: MenuViewData): string {
  if (view.currentNode === null) {
    return "🏠 أنت في القائمة الرئيسية";
  }

  const cleanTag = view.currentNode.title
    .trim()
    .replace(/[^\p{L}\p{N}_]+/gu, "_")
    .replace(/^_+|_+$/g, "");

  const defaultPrompt =
    cleanTag.length > 0
      ? `📂 قسم #${cleanTag} اختر من القائمة ⬇️`
      : "اختر من القائمة ⬇️";

  // 1. Check if node has an explicit custom message / description
  let customMessage = view.currentNode.description?.trim();

  // 2. Fallback: check if text contents/notes were attached to this folder
  if (!customMessage && view.contents.length > 0) {
    const textContents = view.contents.filter((c) => c.contentType === "text");
    if (textContents.length > 0) {
      customMessage = textContents
        .map((c) => c.caption || c.title)
        .filter(Boolean)
        .join("\n\n");
    }
  }

  if (customMessage) {
    const formattedMessage =
      customMessage.includes("<") && customMessage.includes(">")
        ? customMessage
        : escapeHtml(customMessage);
    return `${formattedMessage}\n\n${defaultPrompt}`;
  }

  return defaultPrompt;
}

export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
