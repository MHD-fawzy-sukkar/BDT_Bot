import { ErrorHandler } from "grammy";
import { AppError } from "../../application/errors/AppError";
import { BotContext } from "../context/BotContext";
import { SystemLogger } from "../utils/systemLogger";

export const botErrorHandler: ErrorHandler<BotContext> = async (err) => {
  const ctx = err.ctx;
  const error = err.error;

  console.error(`[BotError] Update ${ctx.update.update_id}:`, error);

  // Automatically dispatch error report to the audit topic
  if (
    ctx.env &&
    !(error instanceof AppError && error.code === "BOUNDARY_REACHED")
  ) {
    ctx.runInBackground(
      SystemLogger.error(
        ctx.api,
        ctx.env,
        "خطأ أثناء معالجة رسالة أو زر",
        error,
        {
          updateId: ctx.update.update_id,
          chatId: ctx.chat?.id,
          userId: ctx.from?.id,
          username: ctx.from?.username,
          text: ctx.message?.text ?? ctx.callbackQuery?.data,
        }
      )
    );
  }

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
