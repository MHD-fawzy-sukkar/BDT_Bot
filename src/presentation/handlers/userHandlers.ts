import { Composer } from "grammy";
import { MenuViewData } from "../../application/services/MenuNavigationService";
import { BotContext } from "../context/BotContext";
import {
  BACK_BUTTON_TEXT,
  buildUserReplyKeyboard,
  formatUserMenuText,
  GENERAL_FILES_BUTTON_PREFIX,
  HOME_BUTTON_TEXT,
} from "../keyboards/UserMenuKeyboard";
import { deliverNodeContents } from "../utils/contentDelivery";
import { normalizeArabic } from "../utils/arabicText";

export const userHandlers = new Composer<BotContext>();

/**
 * Sends a lightweight menu prompt, updates the reply keyboard,
 * and saves user position in database for stateful navigation.
 */
async function showUserNodeKeyboard(
  ctx: BotContext,
  userId: string,
  nodeId: number | null,
  preloadedView?: MenuViewData
): Promise<void> {
  // Persist user location to avoid collisions during concurrent taps (~0.5ms)
  await ctx.services.navigation.setUserCurrentNodeId(userId, nodeId);

  const view =
    preloadedView ?? (await ctx.services.navigation.getMenuView(nodeId));
  const text = formatUserMenuText(view);
  const keyboard = buildUserReplyKeyboard(view);

  await ctx.reply(text, {
    parse_mode: "HTML",
    reply_markup: keyboard,
  });
}

// 1. /start command in private student chat
userHandlers.command("start", async (ctx, next) => {
  if (ctx.chat?.type !== "private") {
    return next();
  }
  const userId = ctx.from ? String(ctx.from.id) : "";
  await showUserNodeKeyboard(ctx, userId, null);
});

// Backward compatibility for root callback queries
userHandlers.callbackQuery("u:root", async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!ctx.from) return;
  await showUserNodeKeyboard(ctx, String(ctx.from.id), null);
});

userHandlers.callbackQuery(/^u:nav:(\d+)$/, async (ctx) => {
  const nodeId = Number(ctx.match[1]);
  await ctx.answerCallbackQuery();
  if (!ctx.from) return;
  await handleStudentNodeSelection(ctx, String(ctx.from.id), nodeId);
});

// 2. Handle reply keyboard button taps in student private chat
userHandlers.on("message:text", async (ctx, next) => {
  if (ctx.chat.type !== "private") {
    return next();
  }

  const text = ctx.message.text.trim();
  if (text.startsWith("/")) {
    return next();
  }

  const userId = String(ctx.from.id);

  // A) Tap on "Home" button
  const cleanHome = text.replace(/[🏠🏡]/g, "").trim();
  if (
    text === HOME_BUTTON_TEXT ||
    cleanHome === "الرئيسية" ||
    cleanHome === "القائمة الرئيسية" ||
    normalizeArabic(cleanHome) === normalizeArabic("الرئيسية") ||
    normalizeArabic(cleanHome) === normalizeArabic("القائمة الرئيسية")
  ) {
    await showUserNodeKeyboard(ctx, userId, null);
    return;
  }

  // B) Tap on "Back" button
  const cleanBack = text.replace(/[↩️🔙◀️⬅️]/g, "").trim();
  if (
    text === BACK_BUTTON_TEXT ||
    cleanBack === "رجوع" ||
    cleanBack === "رجوع خطوة" ||
    normalizeArabic(cleanBack) === normalizeArabic("رجوع") ||
    normalizeArabic(cleanBack) === normalizeArabic("رجوع خطوة")
  ) {
    const currentNode =
      await ctx.services.navigation.getValidUserCurrentNode(userId);
    const parentId = currentNode ? currentNode.parentId : null;
    await showUserNodeKeyboard(ctx, userId, parentId);
    return;
  }

  // C) Tap on general files button (when folder contains non-text media files alongside child buttons)
  if (text.startsWith(GENERAL_FILES_BUTTON_PREFIX)) {
    const currentNode =
      await ctx.services.navigation.getValidUserCurrentNode(userId);
    if (currentNode && ctx.chat?.id) {
      const view = await ctx.services.navigation.getMenuView(currentNode.id);
      const nonTextContents = view.contents.filter(
        (c) => c.contentType !== "text"
      );
      if (nonTextContents.length > 0) {
        await deliverNodeContents(ctx, ctx.chat.id, nonTextContents);
        return;
      }
    }
  }

  // D) Resolve button tap within open section (zero-latency in-memory lookup)
  const targetNode = await ctx.services.navigation.resolveNodeByButtonText(
    userId,
    text
  );

  if (!targetNode) {
    const currentNode =
      await ctx.services.navigation.getValidUserCurrentNode(userId);
    const currentView = await ctx.services.navigation.getMenuView(
      currentNode ? currentNode.id : null
    );
    await ctx.reply("اختر من القائمة ⬇️", {
      reply_markup: buildUserReplyKeyboard(currentView),
    });
    return;
  }

  await handleStudentNodeSelection(ctx, userId, targetNode.id);
});

async function handleStudentNodeSelection(
  ctx: BotContext,
  userId: string,
  nodeId: number
): Promise<void> {
  // Increment view counter in background without blocking response
  ctx.runInBackground(ctx.services.statsAndBroadcast.trackNodeView(nodeId));

  const view = await ctx.services.navigation.getMenuView(nodeId);
  const chatId = ctx.chat?.id;
  if (!chatId) return;

  // 1. If button has no content, no description, and no children yet
  if (
    view.children.length === 0 &&
    view.contents.length === 0 &&
    !view.currentNode?.description
  ) {
    const parentId = view.currentNode?.parentId ?? null;
    await ctx.services.navigation.setUserCurrentNodeId(userId, parentId);
    const parentView = await ctx.services.navigation.getMenuView(parentId);
    await ctx.reply("سيتم إضافة محتوى هذا القسم قريباً ⏳", {
      reply_markup: buildUserReplyKeyboard(parentView),
    });
    return;
  }

  // 2. If button is an endpoint node containing content without sub-buttons:
  // Deliver content directly with the parent navigation keyboard attached to the last item
  if (view.contents.length > 0 && view.children.length === 0) {
    const parentId = view.currentNode?.parentId ?? null;
    await ctx.services.navigation.setUserCurrentNodeId(userId, parentId);
    const parentView = await ctx.services.navigation.getMenuView(parentId);
    const parentKeyboard = buildUserReplyKeyboard(parentView);

    await deliverNodeContents(ctx, chatId, view.contents, parentKeyboard);
    return;
  }

  // 3. If button is a category folder with sub-buttons:
  // Open the category keyboard and display any custom message/description
  await showUserNodeKeyboard(ctx, userId, nodeId, view);
}
