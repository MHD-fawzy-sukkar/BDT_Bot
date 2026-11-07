import { Keyboard } from "grammy";
import { NodeContent } from "../../domain/entities/NodeContent";
import { BotContext } from "../context/BotContext";

/**
 * يرسل الملفات والرسائل بأقصى سرعة ممكنة:
 * - إذا كانت الرسالة محولة في الأصل (من قناة أو كاتب أصلي)، تُرسل كـ Forward لتظهر بالاسم الأصلي.
 * - إذا أرسلها الأدمن مباشرة أو ألغى التحويل، تُرسل كـ copyMessage لتظهر باسم البوت.
 */
export async function deliverNodeContents(
  ctx: BotContext,
  targetChatId: number | string,
  contents: NodeContent[],
  replyKeyboard?: Keyboard
): Promise<void> {
  for (let i = 0; i < contents.length; i++) {
    const item = contents[i];
    const isLast = i === contents.length - 1;
    const keyboardToAttach = isLast ? replyKeyboard : undefined;

    let delivered = false;

    // 1. إذا كانت الرسالة محولة بالأصل: نرسلها كـ Forward مع الاسم الأصلي
    if (item.isForwarded) {
      delivered = await tryForwardMessage(ctx, targetChatId, item);
    }

    // 2. إذا لم تكن محولة (أو فشل التحويل): ننسخها بـ copyMessage لتظهر باسم البوت
    if (!delivered) {
      delivered = await tryCopyMessage(
        ctx,
        targetChatId,
        item,
        keyboardToAttach
      );
    }

    // 3. في حال حُذفت الرسالة من الغروب: نستخدم file_id الاحتياطي
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
  }
}
