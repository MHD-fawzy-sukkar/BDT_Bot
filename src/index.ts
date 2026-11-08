import { webhookCallback } from "grammy";
import { Env } from "./infrastructure/config/Env";
import { createBot } from "./presentation/bot";
import { SystemLogger } from "./presentation/utils/systemLogger";
import { D1MenuNodeRepository } from "./infrastructure/database/D1MenuNodeRepository";
import { D1NodeContentRepository } from "./infrastructure/database/D1NodeContentRepository";
import { ContentAdminService } from "./application/services/ContentAdminService";
import { VaultSyncRunner } from "./presentation/utils/vaultSyncRunner";

export default {
  async fetch(
    request: Request,
    env: Env,
    executionCtx: ExecutionContext
  ): Promise<Response> {
    const url = new URL(request.url);

    // 1. Health check endpoint
    if (request.method === "GET" && url.pathname === "/") {
      return new Response(
        JSON.stringify({
          ok: true,
          service: "BDT Telegram Bot (Cloudflare Workers + grammY + D1)",
          status: "running",
        }),
        {
          status: 200,
          headers: { "content-type": "application/json; charset=utf-8" },
        }
      );
    }

    // Direct Webhook inspection endpoint for live diagnostics
    if (request.method === "GET" && url.pathname === "/webhook-info") {
      try {
        if (env.WEBHOOK_SECRET) {
          const providedSecret = url.searchParams.get("secret");
          if (providedSecret !== env.WEBHOOK_SECRET) {
            return new Response("Unauthorized", { status: 401 });
          }
        }

        const bot = createBot(env);
        const info = await bot.api.getWebhookInfo();
        return new Response(JSON.stringify(info, null, 2), {
          status: 200,
          headers: { "content-type": "application/json; charset=utf-8" },
        });
      } catch (err) {
        return new Response(String(err), { status: 500 });
      }
    }

    // Secure batch synchronization API endpoint for step-by-step vault mirroring
    if (
      (request.method === "POST" || request.method === "GET") &&
      url.pathname === "/api/sync-vault-step"
    ) {
      const authKey =
        request.headers.get("x-sync-key") || url.searchParams.get("key");
      if (authKey !== "bdt_sync_vault_2026") {
        return new Response(
          JSON.stringify({ error: "Unauthorized: Invalid key" }),
          { status: 401, headers: { "content-type": "application/json" } }
        );
      }

      try {
        const bot = createBot(env, executionCtx);
        const nodeRepo = new D1MenuNodeRepository(env.DB);
        const contentRepo = new D1NodeContentRepository(env.DB);
        const contentAdmin = new ContentAdminService(nodeRepo, contentRepo);

        const batchSize = Number(url.searchParams.get("batch")) || 15;
        const result = await VaultSyncRunner.runBatch(
          bot.api,
          env,
          contentAdmin,
          batchSize
        );

        return new Response(JSON.stringify(result, null, 2), {
          status: 200,
          headers: { "content-type": "application/json; charset=utf-8" },
        });
      } catch (err) {
        return new Response(JSON.stringify({ error: String(err) }), {
          status: 500,
          headers: { "content-type": "application/json; charset=utf-8" },
        });
      }
    }

    // 2. Setup webhook and register scoped commands with Telegram API
    if (request.method === "GET" && url.pathname === "/setup-webhook") {
      try {
        if (env.WEBHOOK_SECRET) {
          const providedSecret = url.searchParams.get("secret");
          if (providedSecret !== env.WEBHOOK_SECRET) {
            return new Response("Unauthorized: Invalid or missing ?secret=", {
              status: 401,
            });
          }
        }

        const bot = createBot(env);
        const webhookUrl = `${url.origin}/webhook`;

        await bot.api.setWebhook(webhookUrl, {
          secret_token: env.WEBHOOK_SECRET || undefined,
          allowed_updates: ["message", "callback_query"],
          drop_pending_updates: true,
          ip_address: "104.21.44.4",
        });

        // Set scoped commands: /start in private student chats, admin commands in groups
        await Promise.all([
          bot.api.setMyCommands(
            [{ command: "start", description: "🏠 القائمة الرئيسية للبوت" }],
            { scope: { type: "all_private_chats" } }
          ),
          bot.api.setMyCommands(
            [
              {
                command: "admin",
                description: "🛠️ لوحة تحكم المشرفين وبناء الأزرار",
              },
              {
                command: "sync_vault",
                description: "📦 نقل وتأمين الأرشيف في قناة المستودع",
              },
              {
                command: "backup",
                description: "💾 تحميل نسخة احتياطية كاملة فورية",
              },
              {
                command: "health",
                description: "🩺 فحص استقرار السيرفر وقاعدة البيانات",
              },
              {
                command: "test_logs",
                description: "🩺 فحص اتصال توبيك السجلات",
              },
              {
                command: "broadcast",
                description: "📢 إرسال إذاعة عامة للطلاب مع المعاينة",
              },
              {
                command: "stats",
                description: "📊 إحصائيات البوت والمشتركين",
              },
              {
                command: "tree",
                description: "🗂️ خريطة هيكلية أقسام البوت الكاملة",
              },
              {
                command: "cancel",
                description: "❌ إلغاء العملية الحالية",
              },
              {
                command: "id",
                description: "🆔 عرض معرف الغروب والحساب",
              },
            ],
            { scope: { type: "all_group_chats" } }
          ),
        ]);

        // Audit log dispatch on webhook setup
        executionCtx.waitUntil(
          SystemLogger.info(
            bot.api,
            env,
            "تحديث الـ Webhook ونظام البوت",
            `🚀 <b>تم بنجاح تحديث مسار الـ Webhook وتسجيل أوامر البوت!</b>\n\n` +
              `• <b>رابط الخدمة:</b> <code>${webhookUrl}</code>\n` +
              `• <b>التوقيت:</b> <code>${new Date().toISOString()}</code>`
          )
        );

        return new Response(
          JSON.stringify(
            {
              ok: true,
              message:
                "تم ربط الـ Webhook وتخصيص قوائم أوامر الطلاب والمشرفين بنجاح!",
              webhookUrl,
            },
            null,
            2
          ),
          {
            status: 200,
            headers: { "content-type": "application/json; charset=utf-8" },
          }
        );
      } catch (err) {
        return new Response(
          JSON.stringify(
            {
              ok: false,
              error: String(err),
              hint: "تأكد من إضافة BOT_TOKEN عبر الأمر: npx wrangler secret put BOT_TOKEN",
            },
            null,
            2
          ),
          {
            status: 500,
            headers: { "content-type": "application/json; charset=utf-8" },
          }
        );
      }
    }

    // 3. Main Telegram webhook update receiver
    if (request.method === "POST" && url.pathname === "/webhook") {
      try {
        const bot = createBot(env, executionCtx);
        const handleUpdate = webhookCallback(bot, "cloudflare-mod", {
          secretToken: env.WEBHOOK_SECRET || undefined,
        });
        return await handleUpdate(request);
      } catch (err) {
        console.error("[WorkerWebhookError]:", err);
        return new Response("Internal Server Error", { status: 500 });
      }
    }

    return new Response("Not Found", { status: 404 });
  },

  /**
   * Automated daily Cloudflare Cron Trigger.
   * Runs daily at 12:00 UTC (3:00 PM Damascus time) to quietly sync any new files into the vault.
   */
  async scheduled(
    _event: ScheduledEvent,
    env: Env,
    executionCtx: ExecutionContext
  ): Promise<void> {
    const storageChannelId = env.STORAGE_CHANNEL_ID?.trim();
    if (!storageChannelId) return;

    try {
      const bot = createBot(env, executionCtx);
      const nodeRepo = new D1MenuNodeRepository(env.DB);
      const contentRepo = new D1NodeContentRepository(env.DB);
      const contentAdmin = new ContentAdminService(nodeRepo, contentRepo);

      // Quietly mirror pending files in batches
      const result = await VaultSyncRunner.runBatch(
        bot.api,
        env,
        contentAdmin,
        50
      );

      // Send audit log only if new files were actually transferred today
      if (result.transferredInThisStep > 0) {
        await SystemLogger.info(
          bot.api,
          env,
          "المزامنة اليومية المجدولة للمستودع",
          `📦 <b>تمت المزامنة اليومية التلقائية بنجاح:</b>\n\n` +
            `• تم نقل وتأمين: <b>${result.transferredInThisStep}</b> ملف جديد.\n` +
            `• إجمالي الملفات في المستودع: <b>${result.totalTransferred} / ${result.total}</b>\n` +
            `• شريط الإنجاز: [${result.progressBar}] <b>${result.percent}%</b>\n` +
            `• التوقيت: <code>${new Date().toISOString()}</code>`
        );
      }
    } catch (err) {
      console.error("[ScheduledSyncError]:", err);
      try {
        const bot = createBot(env, executionCtx);
        await SystemLogger.error(
          bot.api,
          env,
          "خطأ في المزامنة اليومية المجدولة",
          err
        );
      } catch {}
    }
  },
};
