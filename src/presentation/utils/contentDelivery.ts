import { Keyboard } from "grammy";
import { NodeContent } from "../../domain/entities/NodeContent";
import { BotContext } from "../context/BotContext";
import { SystemLogger } from "./systemLogger";

interface DeliveryAttemptResult {
  readonly success: boolean;
  readonly isRateLimited: boolean;
}

function isRateLimitError(err: unknown): boolean {
  if (!err) return false;
  const str = String(err);
  return (
    str.includes("429") ||
    str.includes("Too Many Requests") ||
    str.includes("retry after")
  );
}

/**
 * Delivers files and messages with maximum throughput and speed:
 * - Forwarded content from educational channels is sent via forwardMessage to keep original attribution.
 * - Direct content from vault or admin is sent via copyMessage under the bot's name without headers.
 * - Fallback: If original message in the admin group is inaccessible, copies from vault channel under bot's name.
 * - Ultimate fallback: If messages are deleted everywhere, delivers via cached file_id.
 */
export async function deliverNodeContents(
  ctx: BotContext,
  targetChatId: number | string,
  contents: NodeContent[],
  replyKeyboard?: Keyboard
): Promise<void> {
  const storageChannelId = ctx.env.STORAGE_CHANNEL_ID?.trim();

  for (let i = 0; i < contents.length; i++) {
    const item = contents[i];
    const isLast = i === contents.length - 1;
    const keyboardToAttach = isLast ? replyKeyboard : undefined;

    let delivered = false;

    const isFromVault = Boolean(
      storageChannelId && item.sourceChatId === storageChannelId
    );

    // 1. If content is forwarded and resides in the admin group, try forward with original attribution
    if (item.isForwarded && !isFromVault) {
      const res = await tryForwardMessage(ctx, targetChatId, item);
      delivered = res.success;
      if (res.isRateLimited) {
        break; // Recipient chat is rate-limited; stop hammering Telegram
      }
    }

    // 2. If from vault, not forwarded, or forwardMessage failed:
    // Copy cleanly under the bot's name (stripping forward headers)
    if (!delivered) {
      // First try to copy from the permanent vault channel if vaultMessageId exists
      if (storageChannelId && item.vaultMessageId) {
        const res = await tryCopyFromLocation(
          ctx,
          targetChatId,
          storageChannelId,
          item.vaultMessageId,
          keyboardToAttach
        );
        delivered = res.success;
        if (res.isRateLimited) {
          break; // Recipient chat is rate-limited; stop hammering Telegram
        }
      }

      // If still not delivered, try copying from original source location
      if (!delivered) {
        const res = await tryCopyMessage(
          ctx,
          targetChatId,
          item,
          keyboardToAttach
        );
        delivered = res.success;
        if (res.isRateLimited) {
          break; // Recipient chat is rate-limited; stop hammering Telegram
        }
      }
    }

    // 3. Fallback: If original message was deleted everywhere, deliver via file_id
    if (!delivered) {
      await tryFallbackDelivery(ctx, targetChatId, item, keyboardToAttach);
    }
  }
}

async function tryForwardMessage(
  ctx: BotContext,
  targetChatId: number | string,
  item: NodeContent
): Promise<DeliveryAttemptResult> {
  try {
    await ctx.api.forwardMessage(
      targetChatId,
      item.sourceChatId,
      item.sourceMessageId
    );
    return { success: true, isRateLimited: false };
  } catch (err) {
    const rateLimited = isRateLimitError(err);
    if (!rateLimited) {
      console.warn(
        `[ContentDelivery] forwardMessage failed for content #${item.id}, trying copyMessage fallback:`,
        err
      );
    }
    return { success: false, isRateLimited: rateLimited };
  }
}

async function tryCopyFromLocation(
  ctx: BotContext,
  targetChatId: number | string,
  fromChatId: string | number,
  fromMessageId: number,
  replyKeyboard?: Keyboard
): Promise<DeliveryAttemptResult> {
  try {
    await ctx.api.copyMessage(
      targetChatId,
      fromChatId,
      fromMessageId,
      replyKeyboard ? { reply_markup: replyKeyboard } : undefined
    );
    return { success: true, isRateLimited: false };
  } catch (err) {
    const rateLimited = isRateLimitError(err);
    if (!rateLimited) {
      console.warn(
        `[ContentDelivery] copyFromLocation failed for chat ${fromChatId} msg ${fromMessageId}:`,
        err
      );
    }
    return { success: false, isRateLimited: rateLimited };
  }
}

async function tryCopyMessage(
  ctx: BotContext,
  targetChatId: number | string,
  item: NodeContent,
  replyKeyboard?: Keyboard
): Promise<DeliveryAttemptResult> {
  try {
    await ctx.api.copyMessage(
      targetChatId,
      item.sourceChatId,
      item.sourceMessageId,
      replyKeyboard ? { reply_markup: replyKeyboard } : undefined
    );
    return { success: true, isRateLimited: false };
  } catch (err) {
    const rateLimited = isRateLimitError(err);
    if (!rateLimited) {
      console.warn(
        `[ContentDelivery] copyMessage failed for content #${item.id}, trying file_id fallback:`,
        err
      );
    }
    return { success: false, isRateLimited: rateLimited };
  }
}

async function tryFallbackDelivery(
  ctx: BotContext,
  targetChatId: number | string,
  item: NodeContent,
  replyKeyboard?: Keyboard
): Promise<void> {
  try {
    const caption = item.caption ?? undefined;
    const extra = {
      caption,
      ...(replyKeyboard ? { reply_markup: replyKeyboard } : {}),
    };

    if (item.contentType === "text" && item.caption) {
      await ctx.api.sendMessage(
        targetChatId,
        item.caption,
        replyKeyboard ? { reply_markup: replyKeyboard } : undefined
      );
      return;
    }

    if (!item.fileId) {
      return;
    }

    switch (item.contentType) {
      case "document":
        await ctx.api.sendDocument(targetChatId, item.fileId, extra);
        break;
      case "video":
        await ctx.api.sendVideo(targetChatId, item.fileId, extra);
        break;
      case "audio":
        await ctx.api.sendAudio(targetChatId, item.fileId, extra);
        break;
      case "voice":
        await ctx.api.sendVoice(targetChatId, item.fileId, extra);
        break;
      case "photo":
        await ctx.api.sendPhoto(targetChatId, item.fileId, extra);
        break;
      default:
        await ctx.api.sendDocument(targetChatId, item.fileId, extra);
        break;
    }
  } catch (fallbackErr) {
    console.error(
      `[ContentDelivery] Fallback delivery also failed for content #${item.id}:`,
      fallbackErr
    );
    if (ctx.env) {
      ctx.runInBackground(
        SystemLogger.warn(
          ctx.api,
          ctx.env,
          "تعذر تسليم ملف للطالب",
          `فشل إرسال الملف #${item.id} («${item.title}») للمحادثة <code>${targetChatId}</code>.\nسبب الفشل: <code>${String(
            fallbackErr
          ).slice(0, 200)}</code>`
        )
      );
    }
  }
}
