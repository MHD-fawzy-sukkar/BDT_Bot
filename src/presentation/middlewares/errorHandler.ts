import { ErrorHandler } from "grammy";
import { AppError } from "../../application/errors/AppError";
import { BotContext } from "../context/BotContext";

export const botErrorHandler: ErrorHandler<BotContext> = async (err) => {
  const ctx = err.ctx;
  const error = err.error;

  console.error(`[BotError] Update ${ctx.update.update_id}:`, error);

  const message =
    error instanceof AppError
      ? `⚠️ ${error.userMessage}`
      : "⚠️ حدث خطأ غير متوقع، يرجى المحاولة مرة أخرى.";

  try {
    if (ctx.callbackQuery) {
      await ctx.answerCallbackQuery({
        text: message.slice(0, 190),
        show_alert: true,
      });
    } else if (ctx.chat) {
      await ctx.reply(message);
    }
  } catch (replyErr) {
    console.error("[BotError] Failed to send error response:", replyErr);
  }
};
