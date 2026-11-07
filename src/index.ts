import { webhookCallback } from "grammy";
import { Env } from "./infrastructure/config/Env";
import { createBot } from "./presentation/bot";
import { SystemLogger } from "./presentation/utils/systemLogger";

let hasLoggedColdStart = false;

export default {
  async fetch(
    request: Request,
    env: Env,
    executionCtx: ExecutionContext
  ): Promise<Response> {
    const url = new URL(request.url);

    // إشعار تشغيل الخادم على شبكة Edge (Cold Start) مرة واحدة لكل بيئة تشغيل Isolate
    if (!hasLoggedColdStart && env.ADMIN_GROUP_ID && env.LOGS_TOPIC_ID) {
      hasLoggedColdStart = true;
      try {
        const bot = createBot(env);
        executionCtx.waitUntil(
          SystemLogger.health(
            bot.api,
            env,
            "تشغيل الخادم (Edge Worker Active)",
            `🟢 <b>سيرفر البوت يعمل بنشاط على شبكة Cloudflare Edge</b>\n\n` +
              `• <b>قناة التخزين الدائم:</b> <code>${env.STORAGE_CHANNEL_ID || "غير محددة"}</code>\n` +
              `• <b>توبيك المراقبة:</b> <code>#${env.LOGS_TOPIC_ID}</code>\n` +
              `• <b>التوقيت:</b> <code>${new Date().toISOString()}</code>\n` +
              `• <b>الحالة:</b> جاهز لاستقبال الطلبات وتأمين المحتوى.`
          )
        );
      } catch (err) {
        console.error("[StartupLog] Error sending cold start log:", err);
      }
    }

    // 1. نقطة فحص حالة البوت (Health Check)
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

    // نقطة فحص الـ Webhook المباشرة من تيلغرام (تشخيص فوري ومحمي)
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

    // 2. نقطة ربط الـ Webhook وتسجيل قائمة الأوامر تلقائياً في تيلغرام
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
        });

        // تخصيص قائمة الأوامر: للطلاب في الخاص يظهر /start فقط، وللمشرفين في الغروبات تظهر أوامر الإدارة
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
                description: "🌳 خريطة شجرة البوت الكاملة",
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

        // إرسال إشعار فوري في توبيك السجلات عند تحديث الـ Webhook والنشر
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

    // 3. نقطة استقبال تحديثات تيلغرام (Webhook Endpoint)
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
};
