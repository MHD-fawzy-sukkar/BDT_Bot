import { InlineKeyboard } from "grammy";
import { BotContext } from "../context/BotContext";

/**
 * يحاول تعديل الرسالة الحالية بسلاسة، ويتجاهل خطأ تيلغرام الشهير "message is not modified"
 * عند الضغط المزدوج أو التحديث بدون تغير البيانات، مع التراجع التلقائي لإرسال رسالة جديدة عند الحاجة
 */
export async function safeEditOrReply(
  ctx: BotContext,
  text: string,
  keyboard: InlineKeyboard,
  editCurrent = true
): Promise<number | null> {
  if (editCurrent && ctx.callbackQuery?.message) {
    try {
      const edited = await ctx.editMessageText(text, {
        parse_mode: "HTML",
        reply_markup: keyboard,
      });
      await ctx.answerCallbackQuery().catch(() => undefined);
      return typeof edited === "object" && "message_id" in edited
        ? edited.message_id
        : ctx.callbackQuery.message.message_id;
    } catch (err) {
      const errMsg = String(err);
      if (errMsg.includes("message is not modified")) {
        await ctx.answerCallbackQuery().catch(() => undefined);
        return ctx.callbackQuery.message.message_id;
      }
      // في حال تعذر التعديل (مثلاً الرسالة حُذفت أو كانت ملف ميديا)، نرسل رسالة جديدة
    }
  }

  const sent = await ctx.reply(text, {
    parse_mode: "HTML",
    reply_markup: keyboard,
  });
  if (ctx.callbackQuery) {
    await ctx.answerCallbackQuery().catch(() => undefined);
  }
  return sent.message_id;
}

export async function tryDeleteMessage(
  ctx: BotContext,
  chatId: number | string,
  messageId: number | null | undefined
): Promise<void> {
  if (!messageId) return;
  try {
    await ctx.api.deleteMessage(chatId, messageId);
  } catch {
    // تجاهل الخطأ إن كانت الرسالة محذوفة مسبقاً
  }
}
