import { Api } from "grammy";
import { Env } from "../../infrastructure/config/Env";
import { escapeHtml } from "../keyboards/UserMenuKeyboard";

interface ErrorThrottleItem {
  lastSent: number;
  count: number;
}

const errorThrottleMap = new Map<string, ErrorThrottleItem>();
const THROTTLE_WINDOW_MS = 60_000; // نافذة كبح التكرار: دقيقة واحدة

export class SystemLogger {
  /**
   * إرسال رسالة معلومات عامة إلى توبيك السجلات
   */
  static async info(
    api: Api,
    env: Env,
    title: string,
    message: string
  ): Promise<void> {
    await SystemLogger.sendToTopic(api, env, `ℹ️ <b>[معلومات النظام] ${escapeHtml(title)}</b>\n\n${message}`);
  }

  /**
   * إرسال تحذير تشغيلي إلى توبيك السجلات
   */
  static async warn(
    api: Api,
    env: Env,
    title: string,
    message: string
  ): Promise<void> {
    await SystemLogger.sendToTopic(api, env, `⚠️ <b>[تحذير تشغيلي] ${escapeHtml(title)}</b>\n\n${message}`);
  }

  /**
   * إرسال تقرير خطأ مفصل مع صمام أمان لمنع التكرار والإغراق (Anti-Flood)
   */
  static async error(
    api: Api,
    env: Env,
    title: string,
    err: unknown,
    context?: {
      updateId?: number;
      chatId?: number | string;
      userId?: number | string;
      username?: string | null;
      text?: string | null;
      nodeId?: number | null;
    }
  ): Promise<void> {
    const errorString =
      err instanceof Error ? err.stack || err.message : String(err);
    const shortKey = `${title}:${String(err).slice(0, 100)}`;

    const now = Date.now();
    const existing = errorThrottleMap.get(shortKey);

    if (existing && now - existing.lastSent < THROTTLE_WINDOW_MS) {
      existing.count++;
      return; // كبح الإشعار منعاً للإغراق
    }

    const previousCount = existing ? existing.count : 0;
    errorThrottleMap.set(shortKey, { lastSent: now, count: 0 });

    const lines: string[] = [
      `🚨 <b>[تنبيه عطل بالنظام] ${escapeHtml(title)}</b>`,
      "",
      `❌ <b>الخطأ:</b> <code>${escapeHtml(errorString.slice(0, 500))}</code>`,
    ];

    if (previousCount > 0) {
      lines.push(`🔁 <i>(تكرر هذا الخطأ ${previousCount} مرة خلال الدقيقة الماضية)</i>`);
    }

    if (context) {
      lines.push("");
      lines.push("📋 <b>معلومات السياق:</b>");
      if (context.userId) {
        const userTag = context.username ? ` (@${context.username})` : "";
        lines.push(`• <b>المستخدم:</b> <code>${context.userId}</code>${userTag}`);
      }
      if (context.chatId) {
        lines.push(`• <b>المحادثة:</b> <code>${context.chatId}</code>`);
      }
      if (context.nodeId) {
        lines.push(`• <b>القسم/الزر:</b> <code>#${context.nodeId}</code>`);
      }
      if (context.text) {
        lines.push(`• <b>المدخل/البيانات:</b> <code>${escapeHtml(context.text.slice(0, 70))}</code>`);
      }
    }

    lines.push(`\n⏱️ <b>التوقيت:</b> <code>${new Date().toISOString()}</code>`);

    await SystemLogger.sendToTopic(api, env, lines.join("\n"));
  }

  /**
   * إرسال تقرير فحص صحة واستقرار السيرفر
   */
  static async health(
    api: Api,
    env: Env,
    title: string,
    report: string
  ): Promise<void> {
    await SystemLogger.sendToTopic(
      api,
      env,
      `🩺 <b>[صحة السيرفر والبوت] ${escapeHtml(title)}</b>\n\n${report}`
    );
  }

  /**
   * الإرسال الفعلي لرسالة التوبيك بأمان تام
   */
  private static async sendToTopic(
    api: Api,
    env: Env,
    formattedHtml: string
  ): Promise<void> {
    const adminGroupId = env.ADMIN_GROUP_ID?.trim();
    const topicId = env.LOGS_TOPIC_ID ? Number(env.LOGS_TOPIC_ID.trim()) : undefined;

    if (!adminGroupId || !topicId || isNaN(topicId)) {
      return;
    }

    try {
      await api.sendMessage(adminGroupId, formattedHtml, {
        message_thread_id: topicId,
        parse_mode: "HTML",
        link_preview_options: { is_disabled: true },
      });
    } catch (sendErr) {
      console.error("[SystemLogger] Failed to deliver log message to topic:", sendErr);
    }
  }
}
