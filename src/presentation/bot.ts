import { Bot } from "grammy";
import { UserFromGetMe } from "grammy/types";
import { Env } from "../infrastructure/config/Env";
import { BotContext } from "./context/BotContext";
import { adminHandlers } from "./handlers/adminHandlers";
import { userHandlers } from "./handlers/userHandlers";
import { createDependencyInjectionMiddleware } from "./middlewares/dependencyInjection";
import { botErrorHandler } from "./middlewares/errorHandler";

// Cache bot identity in memory to prevent calling getMe on Telegram API for every update
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

  // Cache bot info on first update for subsequent requests
  bot.use(async (ctx, next) => {
    if (!cachedBotInfo && ctx.me) {
      cachedBotInfo = ctx.me;
    }
    await next();
  });

  // 1. Dependency injection and admin context detection
  bot.use(createDependencyInjectionMiddleware(env, executionCtx));

  // 2. Student private chat handlers
  bot.use(userHandlers);

  // 3. Admin handlers (guarded by adminGuard in admin supergroup)
  bot.use(adminHandlers);

  // 4. Centralized error handling
  bot.catch(botErrorHandler);

  return bot;
}
