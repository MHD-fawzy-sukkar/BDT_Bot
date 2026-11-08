import { Keyboard } from "grammy";
import { NodeContent } from "../../domain/entities/NodeContent";
import { BotContext } from "../context/BotContext";
import { SystemLogger } from "./systemLogger";

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
      delivered = await tryForwardMessage(ctx, targetChatId, item);
      // Telegram forwardMessage does not support reply_markup. If this is the last item and
      // a keyboard was requested, deliver the keyboard prompt so navigation is never lost.
      if (delivered && isLast && replyKeyboard) {
        try {
          await ctx.api.sendMessage(
            targetChatId,
            "⬇️ اختر من القائمة بالأسفل:",
            { reply_markup: replyKeyboard }
          );
        } catch (kbErr) {
          console.warn(
            "[ContentDelivery] Failed to attach trailing reply keyboard for forwarded message:",
            kbErr
          );
        }
      }
    }

    // 2. If from vault, not forwarded, or forwardMessage failed:
    // Copy cleanly under the bot's name (stripping forward headers)
    if (!delivered) {
      // First try to copy from the permanent vault channel if vaultMessageId exists
      if (storageChannelId && item.vaultMessageId) {
        delivered = await tryCopyFromLocation(
          ctx,
          targetChatId,
          storageChannelId,
          item.vaultMessageId,
          keyboardToAttach
        );
      }

      // If still not delivered, try copying from original source location
      if (!delivered) {
        delivered = await tryCopyMessage(
          ctx,
          targetChatId,
          item,
          keyboardToAttach
        );
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
): Promise<boolean> {
  try {
    await ctx.api.forwardMessage(
      targetChatId,
      item.sourceChatId,
      item.sourceMessageId
    );
    return true;
  } catch (err) {
    console.warn(
      `[ContentDelivery] forwardMessage failed for content #${item.id}, trying copyMessage fallback:`,
      err
    );
    return false;
  }
}

async function tryCopyFromLocation(
  ctx: BotContext,
  targetChatId: number | string,
  fromChatId: string | number,
  fromMessageId: number,
  replyKeyboard?: Keyboard
): Promise<boolean> {
  try {
    await ctx.api.copyMessage(
      targetChatId,
      fromChatId,
      fromMessageId,
      replyKeyboard ? { reply_markup: replyKeyboard } : undefined
    );
    return true;
  } catch (err) {
    console.warn(
      `[ContentDelivery] copyFromLocation failed for chat ${fromChatId} msg ${fromMessageId}:`,
      err
    );
    return false;
  }
}

async function tryCopyMessage(
  ctx: BotContext,
  targetChatId: number | string,
  item: NodeContent,
  replyKeyboard?: Keyboard
): Promise<boolean> {
  try {
    await ctx.api.copyMessage(
      targetChatId,
      item.sourceChatId,
      item.sourceMessageId,
      replyKeyboard ? { reply_markup: replyKeyboard } : undefined
    );
    return true;
  } catch (err) {
    console.warn(
      `[ContentDelivery] copyMessage failed for content #${item.id}, trying file_id fallback:`,
      err
    );
    return false;
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
