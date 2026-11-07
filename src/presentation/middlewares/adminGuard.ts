import { MiddlewareFn } from "grammy";
import { BotContext } from "../context/BotContext";

export const adminGuard: MiddlewareFn<BotContext> = async (ctx, next) => {
  if (!ctx.isAdminContext) {
    if (ctx.callbackQuery) {
      await ctx.answerCallbackQuery({
        text: "⛔ أوامر ولوحة الإدارة مخصصة حصرياً داخل غروب المشرفين.",
        show_alert: true,
      });
    } else if (ctx.chat?.type === "private") {
      await ctx.reply("⛔ أوامر ولوحة الإدارة محصورة حصرياً داخل غروب المشرفين.");
    }
    return;
  }
  await next();
};
