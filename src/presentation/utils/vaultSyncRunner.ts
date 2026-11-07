import { Api } from "grammy";
import { Env } from "../../infrastructure/config/Env";
import { ContentAdminService } from "../../application/services/ContentAdminService";
import { SystemLogger } from "./systemLogger";

export interface VaultSyncResult {
  total: number;
  transferredInThisStep: number;
  totalTransferred: number;
  remaining: number;
  percent: number;
  progressBar: string;
  isComplete: boolean;
  failedCount: number;
}

export interface VaultSyncProgressUpdate {
  transferred: number;
  total: number;
  remaining: number;
  percent: number;
  progressBar: string;
}

export class VaultSyncRunner {
  static async runBatch(
    api: Api,
    env: Env,
    contentAdmin: ContentAdminService,
    batchSize: number = 10,
    onProgress?: (progress: VaultSyncProgressUpdate) => Promise<void>
  ): Promise<VaultSyncResult> {
    const storageChannelId = env.STORAGE_CHANNEL_ID?.trim();
    if (!storageChannelId) {
      throw new Error("STORAGE_CHANNEL_ID is not configured in environment");
    }

    const allContents = await contentAdmin.getAllContents();
    const pending = allContents.filter(
      (c) => c.sourceChatId !== storageChannelId
    );

    const alreadyInVault = allContents.length - pending.length;

    if (pending.length === 0) {
      return {
        total: allContents.length,
        transferredInThisStep: 0,
        totalTransferred: allContents.length,
        remaining: 0,
        percent: 100,
        progressBar: "🟩".repeat(5),
        isComplete: true,
        failedCount: 0,
      };
    }

    const currentBatch = pending.slice(0, batchSize);
    let transferredInThisStep = 0;
    let failedCount = 0;

    for (let i = 0; i < currentBatch.length; i++) {
      const item = currentBatch[i];
      try {
        let newMsgId: number | null = null;

        // 1. محاولة النسخ المباشر السريع من الرسالة الأصلية
        try {
          const copied = await api.copyMessage(
            storageChannelId,
            item.sourceChatId,
            item.sourceMessageId
          );
          newMsgId = copied.message_id;
        } catch {
          // 2. المحاولة البديلة عبر المحتوى المخزن
          if (item.contentType === "text") {
            const textToSend = item.caption || item.title || "";
            if (textToSend.length > 0) {
              const sentText = await api.sendMessage(
                storageChannelId,
                textToSend
              );
              newMsgId = sentText.message_id;
            }
          } else if (item.fileId) {
            const caption = item.caption ?? undefined;
            let sentMedia: any;
            switch (item.contentType) {
              case "video":
                sentMedia = await api.sendVideo(
                  storageChannelId,
                  item.fileId,
                  { caption }
                );
                break;
              case "audio":
                sentMedia = await api.sendAudio(
                  storageChannelId,
                  item.fileId,
                  { caption }
                );
                break;
              case "voice":
                sentMedia = await api.sendVoice(
                  storageChannelId,
                  item.fileId,
                  { caption }
                );
                break;
              case "photo":
                sentMedia = await api.sendPhoto(
                  storageChannelId,
                  item.fileId,
                  { caption }
                );
                break;
              default:
                sentMedia = await api.sendDocument(
                  storageChannelId,
                  item.fileId,
                  { caption }
                );
                break;
            }
            if (sentMedia && "message_id" in sentMedia) {
              newMsgId = sentMedia.message_id;
            }
          }
        }

        // الحفظ الفوري المباشر في قاعدة البيانات فور نجاح النقل لتجنب أي فقدان للبيانات
        if (newMsgId) {
          await contentAdmin.updateContentSource(
            item.id,
            storageChannelId,
            newMsgId
          );
          transferredInThisStep++;
        } else {
          failedCount++;
        }

        // تحديث حي للمستخدم على واجهة تيلغرام كل 3 ملفات أو عند نهاية الدفعة
        if (onProgress && ((i + 1) % 3 === 0 || i === currentBatch.length - 1)) {
          const curTransferred = alreadyInVault + transferredInThisStep;
          const curRemaining = allContents.length - curTransferred;
          const curPercent = Math.round(
            (curTransferred / allContents.length) * 100
          );
          const curBlocks = Math.round((curPercent / 100) * 5);
          const curProgressBar =
            "🟩".repeat(curBlocks) + "⬜".repeat(5 - curBlocks);

          try {
            await onProgress({
              transferred: curTransferred,
              total: allContents.length,
              remaining: curRemaining,
              percent: curPercent,
              progressBar: curProgressBar,
            });
          } catch {
            // تجاهل أخطاء التعديل اللحظي إن حدثت
          }
        }

        // فاصل زمني بسيط (250ms) احتراماً لقيود معدل الإرسال في تيلغرام (Rate Limiting)
        await new Promise((resolve) => setTimeout(resolve, 250));
      } catch (itemErr) {
        failedCount++;
        console.warn(`[VaultSyncRunner] Failed item #${item.id}:`, itemErr);
      }
    }

    const totalTransferred = alreadyInVault + transferredInThisStep;
    const remaining = allContents.length - totalTransferred;
    const percent = Math.round((totalTransferred / allContents.length) * 100);

    // شريط تقدم مقتضب وجميل (5 خانات) يناسب شاشات الهواتف دون تشويه السطور
    const filledBlocks = Math.round((percent / 100) * 5);
    const progressBar =
      "🟩".repeat(filledBlocks) + "⬜".repeat(5 - filledBlocks);

    // إرسال تقرير الدفعة في توبيك السجلات
    if (transferredInThisStep > 0) {
      await SystemLogger.info(
        api,
        env,
        "مزامنة دفعة أرشيف",
        `📦 <b>تم نقل وتأمين دفعة جديدة (${transferredInThisStep} ملف):</b>\n\n` +
          `• شريط الإنجاز: [${progressBar}] <b>${percent}%</b>\n` +
          `• المنقول والمؤمن في المستودع: <b>${totalTransferred} / ${allContents.length}</b>\n` +
          `• المتبقي: <b>${remaining}</b> ملف`
      );
    }

    if (remaining <= 0) {
      await SystemLogger.info(
        api,
        env,
        "اكتملت مزامنة الأرشيف بالكامل",
        `🎉 <b>تم بحمد الله نقل وتأمين جميع ملفات البوت بالكامل (${allContents.length} ملف) داخل قناة المستودع الدائم بنسبة 100%!</b>`
      );
    }

    return {
      total: allContents.length,
      transferredInThisStep,
      totalTransferred,
      remaining,
      percent,
      progressBar,
      isComplete: remaining <= 0,
      failedCount,
    };
  }
}
