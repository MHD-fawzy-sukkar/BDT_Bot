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
    batchSize: number = 25,
    onProgress?: (progress: VaultSyncProgressUpdate) => Promise<void>,
    isCancelled?: () => Promise<boolean>
  ): Promise<VaultSyncResult> {
    const storageChannelId = env.STORAGE_CHANNEL_ID?.trim();
    if (!storageChannelId) {
      throw new Error("STORAGE_CHANNEL_ID is not configured in environment");
    }

    const allContents = await contentAdmin.getAllContents();
    // All contents (both direct and forwarded) are backed up in the vault channel.
    // An item is pending sync if it does not yet have a recorded vaultMessageId.
    const targetContents = allContents;
    const pending = targetContents.filter((c) => !c.vaultMessageId);

    const alreadyInVault = targetContents.length - pending.length;

    if (pending.length === 0) {
      return {
        total: targetContents.length,
        transferredInThisStep: 0,
        totalTransferred: targetContents.length,
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
      if (isCancelled && (await isCancelled())) {
        console.log("[VaultSyncRunner] Synchronization stopped early by user request.");
        break;
      }

      const item = currentBatch[i];
      try {
        let newMsgId: number | null = null;

        // 1. Attempt fast direct copy from original message
        try {
          const copied = await api.copyMessage(
            storageChannelId,
            item.sourceChatId,
            item.sourceMessageId
          );
          newMsgId = copied.message_id;
        } catch (copyErr: any) {
          // If Telegram hit rate limit 429, wait retry_after and retry once
          if (copyErr?.parameters?.retry_after) {
            const waitSec = Number(copyErr.parameters.retry_after) || 2;
            console.warn(`[VaultSyncRunner] Rate limit 429 on copyMessage, backing off for ${waitSec}s`);
            await new Promise((resolve) => setTimeout(resolve, (waitSec + 1) * 1000));
            try {
              const copiedRetry = await api.copyMessage(
                storageChannelId,
                item.sourceChatId,
                item.sourceMessageId
              );
              newMsgId = copiedRetry.message_id;
            } catch {
              // fall through to fallback 2
            }
          }

          if (!newMsgId) {
            // 2. Fallback: send text or media via cached file_id
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
        }

        // Persist mirrored message ID in vault channel
        if (newMsgId) {
          await contentAdmin.updateVaultMessageId(item.id, newMsgId);

          // For direct files, also update source_chat_id to point directly to vault channel
          if (!item.isForwarded) {
            await contentAdmin.updateContentSource(
              item.id,
              storageChannelId,
              newMsgId
            );
          }
          transferredInThisStep++;
        } else {
          failedCount++;
        }

        if (onProgress) {
          const curTransferred = alreadyInVault + transferredInThisStep;
          const curRemaining = targetContents.length - curTransferred;
          const curPercent = Math.round(
            (curTransferred / targetContents.length) * 100
          );
          const curBlocks = Math.round((curPercent / 100) * 5);
          const curProgressBar =
            "🟩".repeat(curBlocks) + "⬜".repeat(5 - curBlocks);

          try {
            await onProgress({
              transferred: curTransferred,
              total: targetContents.length,
              remaining: curRemaining,
              percent: curPercent,
              progressBar: curProgressBar,
            });
          } catch {
            // Silently ignore transient UI edit errors
          }
        }

        // Rate limiting buffer: 120ms delay between Telegram API calls
        await new Promise((resolve) => setTimeout(resolve, 120));
      } catch (itemErr) {
        failedCount++;
        console.warn(`[VaultSyncRunner] Failed item #${item.id}:`, itemErr);
      }
    }

    const totalTransferred = alreadyInVault + transferredInThisStep;
    const remaining = targetContents.length - totalTransferred;
    const percent = Math.round(
      (totalTransferred / targetContents.length) * 100
    );

    // Compact 5-block progress bar for mobile screens
    const filledBlocks = Math.round((percent / 100) * 5);
    const progressBar =
      "🟩".repeat(filledBlocks) + "⬜".repeat(5 - filledBlocks);

    // Send batch sync audit log to the logs topic
    if (transferredInThisStep > 0) {
      await SystemLogger.info(
        api,
        env,
        "مزامنة دفعة أرشيف",
        `📦 <b>تم نقل وتأمين دفعة جديدة (${transferredInThisStep} ملف):</b>\n\n` +
          `• شريط الإنجاز: [${progressBar}] <b>${percent}%</b>\n` +
          `• المنقول والمؤمن في المستودع: <b>${totalTransferred} / ${targetContents.length}</b>\n` +
          `• المتبقي: <b>${remaining}</b> ملف`
      );
    }

    if (remaining <= 0) {
      await SystemLogger.info(
        api,
        env,
        "اكتملت مزامنة الأرشيف بالكامل",
        `🎉 <b>تم بحمد الله نقل وتأمين جميع ملفات البوت (${targetContents.length} ملف: المباشرة والمحولة) داخل قناة المستودع الدائم بنسبة 100%!</b>`
      );
    }

    return {
      total: targetContents.length,
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
