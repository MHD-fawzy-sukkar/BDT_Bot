import { MiddlewareFn } from "grammy";
import { ContentAdminService } from "../../application/services/ContentAdminService";
import { MenuAdminService } from "../../application/services/MenuAdminService";
import { MenuNavigationService } from "../../application/services/MenuNavigationService";
import { StatsAndBroadcastService } from "../../application/services/StatsAndBroadcastService";
import { Env, parseAdminUserIds } from "../../infrastructure/config/Env";
import { D1AdminSessionRepository } from "../../infrastructure/database/D1AdminSessionRepository";
import { D1BotUserRepository } from "../../infrastructure/database/D1BotUserRepository";
import { D1MenuNodeRepository } from "../../infrastructure/database/D1MenuNodeRepository";
import { D1NodeContentRepository } from "../../infrastructure/database/D1NodeContentRepository";
import { BotContext } from "../context/BotContext";

const THREAD_AWARE_METHODS = new Set([
  "sendMessage",
  "copyMessage",
  "forwardMessage",
  "sendPhoto",
  "sendDocument",
  "sendVideo",
  "sendAudio",
  "sendVoice",
]);

// تجنب تحديث last_active_at لنفس الطالب في كل ثانية؛ نكتفي بتحديثه في القاعدة مرة كل 5 دقائق
const recentUserActivityMap = new Map<string, number>();

export function createDependencyInjectionMiddleware(
  env: Env,
  executionCtx?: ExecutionContext
): MiddlewareFn<BotContext> {
  const nodeRepo = new D1MenuNodeRepository(env.DB);
  const contentRepo = new D1NodeContentRepository(env.DB);
  const sessionRepo = new D1AdminSessionRepository(env.DB);
  const userRepo = new D1BotUserRepository(env.DB);

  const navigation = new MenuNavigationService(nodeRepo, contentRepo, userRepo);
  const menuAdmin = new MenuAdminService(nodeRepo, sessionRepo);
  const contentAdmin = new ContentAdminService(nodeRepo, contentRepo);
  const statsAndBroadcast = new StatsAndBroadcastService(
    userRepo,
    nodeRepo,
    contentRepo
  );

  const adminGroupId = env.ADMIN_GROUP_ID?.trim() ?? "";

  return async (ctx, next) => {
    ctx.env = env;
    ctx.services = {
      navigation,
      menuAdmin,
      contentAdmin,
      statsAndBroadcast,
    };

    ctx.runInBackground = (promise: Promise<unknown>) => {
      const safePromise = promise.catch((err) =>
        console.error("[BackgroundTask] Error:", err)
      );
      if (executionCtx) {
        executionCtx.waitUntil(safePromise);
      }
    };

    const currentChatId = ctx.chat?.id ? String(ctx.chat.id) : "";
    const allowedAdminUserIds = parseAdminUserIds(env.ADMIN_USER_IDS);
    const isUserAllowed =
      allowedAdminUserIds.size === 0 ||
      (ctx.from && allowedAdminUserIds.has(String(ctx.from.id)));

    // حصر صلاحيات وأوامر المشرفين حصرياً داخل غروب الأدمن فقط وللمشرفين المعتمدين
    ctx.isAdminContext =
      adminGroupId.length > 0 &&
      currentChatId === adminGroupId &&
      Boolean(isUserAllowed);

    // دعم كامل لميزة الموضوعات (Topics / Forum Threads) داخل غروب الأدمن
    const threadId = ctx.msg?.message_thread_id;
    if (threadId && currentChatId) {
      ctx.api.config.use((prev, method, payload, signal) => {
        if (
          THREAD_AWARE_METHODS.has(method) &&
          payload &&
          typeof payload === "object" &&
          "chat_id" in payload &&
          String((payload as { chat_id: unknown }).chat_id) === currentChatId &&
          !("message_thread_id" in payload)
        ) {
          return prev(
            method,
            { ...payload, message_thread_id: threadId },
            signal
          );
        }
        return prev(method, payload, signal);
      });
    }

    // تسجيل وتحديث نشاط الطالب في الخلفية (waitUntil) بدون تأخير الرد على الطالب نهائياً!
    if (ctx.chat?.type === "private" && ctx.from && !ctx.from.is_bot) {
      const uid = String(ctx.from.id);
      const now = Date.now();
      const lastTracked = recentUserActivityMap.get(uid) ?? 0;

      if (now - lastTracked > 300_000) {
        recentUserActivityMap.set(uid, now);
        ctx.runInBackground(
          statsAndBroadcast.trackUserActivity({
            userId: uid,
            username: ctx.from.username ?? null,
            firstName: ctx.from.first_name ?? null,
          })
        );
      }
    }

    await next();
  };
}
