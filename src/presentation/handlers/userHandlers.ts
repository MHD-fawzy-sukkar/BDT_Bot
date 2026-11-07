import { Composer } from "grammy";
import { MenuViewData } from "../../application/services/MenuNavigationService";
import { BotContext } from "../context/BotContext";
import {
  BACK_BUTTON_TEXT,
  buildUserReplyKeyboard,
  formatUserMenuText,
  HOME_BUTTON_TEXT,
} from "../keyboards/UserMenuKeyboard";
import { deliverNodeContents } from "../utils/contentDelivery";

export const userHandlers = new Composer<BotContext>();

/**
 * إرسال رسالة خفيفة جداً مع تحديث الكيبورد السفلي وحفظ موقع الطالب فوراً لضمان دقة التنقل
 */
async function showUserNodeKeyboard(
  ctx: BotContext,
  userId: string,
  nodeId: number | null,
  preloadedView?: MenuViewData
): Promise<void> {
  // حفظ موقع الطالب بدقة في قاعدة البيانات (يستغرق ~0.5ms) لمنع أي تداخل بين الأقسام
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

// 1. أمر البداية (/start) في المحادثة الخاصة مع الطالب
userHandlers.command("start", async (ctx, next) => {
  if (ctx.chat?.type !== "private") {
    return next();
  }
  const userId = ctx.from ? String(ctx.from.id) : "";
  await showUserNodeKeyboard(ctx, userId, null);
});

// دعم التوافق مع أي أزرار قديمة إن وجدت
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

// 2. استقبال ضغطات أزرار الكيبورد السفلي في المحادثة الخاصة للطالب
userHandlers.on("message:text", async (ctx, next) => {
  if (ctx.chat.type !== "private") {
    return next();
  }

  const text = ctx.message.text.trim();
  if (text.startsWith("/")) {
    return next();
  }

  const userId = String(ctx.from.id);

  // أ) الضغط على زر "🏠 الرئيسية"
  if (
    text === HOME_BUTTON_TEXT ||
    text === "🏠 القائمة الرئيسية" ||
    text === "الرئيسية" ||
    text === "القائمة الرئيسية"
  ) {
    await showUserNodeKeyboard(ctx, userId, null);
    return;
  }

  // ب) الضغط على زر "↩️ رجوع"
  if (
    text === BACK_BUTTON_TEXT ||
    text === "🔙 رجوع خطوة" ||
    text === "رجوع" ||
    text === "رجوع خطوة"
  ) {
    const currentNode =
      await ctx.services.navigation.getValidUserCurrentNode(userId);
    const parentId = currentNode ? currentNode.parentId : null;
    await showUserNodeKeyboard(ctx, userId, parentId);
    return;
  }

  // ج) البحث عن الزر الذي ضغط عليه الطالب ضمن القسم المفتوح أمامه (من الكاش في 0ms)
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
  // زيادة عداد المشاهدات في الخلفية بدون تأخير رد الطالب
  ctx.runInBackground(ctx.services.statsAndBroadcast.trackNodeView(nodeId));

  const view = await ctx.services.navigation.getMenuView(nodeId);
  const chatId = ctx.chat?.id;
  if (!chatId) return;

  // 1. إذا كان الزر فارغاً لم يُضف فيه محتوى بعد:
  if (
    view.children.length === 0 &&
    view.contents.length === 0 &&
    !view.currentNode?.description
  ) {
    const parentId = view.currentNode?.parentId ?? null;
    const parentView = await ctx.services.navigation.getMenuView(parentId);
    await ctx.reply("سيتم إضافة محتوى هذا القسم قريباً ⏳", {
      reply_markup: buildUserReplyKeyboard(parentView),
    });
    return;
  }

  // 2. إذا كان الزر يوصل لمحتوى (ملفات أو رسائل) وليس له أزرار فرعية بداخله:
  // نرسل الملفات فقط فوراً بدون أي رسائل زائدة!
  if (view.contents.length > 0 && view.children.length === 0) {
    const parentId = view.currentNode?.parentId ?? null;
    await ctx.services.navigation.setUserCurrentNodeId(userId, parentId);
    const parentView = await ctx.services.navigation.getMenuView(parentId);
    const parentKeyboard = buildUserReplyKeyboard(parentView);

    await deliverNodeContents(ctx, chatId, view.contents, parentKeyboard);
    return;
  }

  // 3. إذا كان الزر يحتوي ملفات ويحتوي أيضاً أزراراً فرعية بداخله:
  if (view.contents.length > 0 && view.children.length > 0) {
    await deliverNodeContents(ctx, chatId, view.contents);
    await showUserNodeKeyboard(ctx, userId, nodeId, view);
    return;
  }

  // 4. إذا كان الزر يحتوي أزراراً فرعية فقط (مجلد)، نستخدم نفس الـ view المحمل مسبقاً بدون استعلام مكرر!
  await showUserNodeKeyboard(ctx, userId, nodeId, view);
}
