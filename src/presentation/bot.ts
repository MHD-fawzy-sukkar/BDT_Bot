import { Bot } from "grammy";
import { UserFromGetMe } from "grammy/types";
import { Env } from "../infrastructure/config/Env";
import { BotContext } from "./context/BotContext";
import { adminHandlers } from "./handlers/adminHandlers";
import { userHandlers } from "./handlers/userHandlers";
import { createDependencyInjectionMiddleware } from "./middlewares/dependencyInjection";
import { botErrorHandler } from "./middlewares/errorHandler";

// حفظ معلومات البوت في الذاكرة لتجنب استدعاء getMe من سيرفرات تيلغرام مع كل رسالة
let cachedBotInfo: UserFromGetMe | undefined;

export function createBot(
  env: Env,
  executionCtx?: ExecutionContext
): Bot<BotContext> {
  if (!env.BOT_TOKEN) {
    throw new Error("Missing BOT_TOKEN environment variable");
  }

  const bot = new Bot<BotContext>(
    env.BOT_TOKEN,
    cachedBotInfo ? { botInfo: cachedBotInfo } : undefined
  );

  // بمجرد جلب معلومات البوت لأول مرة، نحفظها في الذاكرة لكل الطلبات القادمة
  bot.use(async (ctx, next) => {
    if (!cachedBotInfo && ctx.me) {
      cachedBotInfo = ctx.me;
    }
    await next();
  });

  // 1. حقن الاعتماديات وتحديد سياق المشرفين
  bot.use(createDependencyInjectionMiddleware(env, executionCtx));

  // 2. معالجات المستخدمين العاديين (في الخاص)
  bot.use(userHandlers);

  // 3. معالجات المشرفين (محمية بـ adminGuard داخل غروب الأدمن)
  bot.use(adminHandlers);

  // 4. المعالج المركزي للأخطاء
  bot.catch(botErrorHandler);

  return bot;
}
